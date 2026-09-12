import {
    Class,
    DefaultObservableValue,
    Errors,
    isInstanceOf,
    Notifier,
    Observer,
    Progress,
    RuntimeNotifier,
    Subscription,
    UUID
} from "@opendaw/lib-std"
import {Files} from "@opendaw/lib-dom"
import {Promises} from "@opendaw/lib-runtime"
import {BoxGraph} from "@opendaw/lib-box"
import {Sample, Soundfont} from "@opendaw/studio-adapters"
import {AudioFileBox, SoundfontFileBox} from "@opendaw/studio-boxes"

export namespace AssetService {
    export type ImportArgs = {
        uuid?: UUID.Bytes
        name?: string,
        bpm?: number,
        arrayBuffer: ArrayBuffer,
        progressHandler?: Progress.Handler,
        origin?: "import" | "recording"
    }
    export type MissingAsset = {uuid: UUID.Bytes, fileName: string}
    export type InvalidateManager = {invalidate: (uuid: UUID.Bytes) => void}
}

export abstract class AssetService<T extends Sample | Soundfont, RAW = void> {
    protected abstract readonly nameSingular: string
    protected abstract readonly namePlural: string
    protected abstract readonly boxType: Class<AudioFileBox | SoundfontFileBox>
    protected abstract readonly filePickerOptions: FilePickerOptions

    protected readonly notifier: Notifier<[T, RAW]> = new Notifier<[T, RAW]>()

    subscribe(observer: Observer<[T, RAW]>): Subscription {return this.notifier.subscribe(observer)}

    async browse(multiple: boolean): Promise<ReadonlyArray<T>> {
        return this.browseFiles(multiple, this.filePickerOptions)
    }

    abstract importFile(args: AssetService.ImportArgs): Promise<T>

    async list(): Promise<ReadonlyArray<T>> {return this.collectAllFiles()}

    // `prompt: false` opens a file picker per missing asset with zero blocking dialogs: it just reports what
    // is missing (see ProjectProfileService, which surfaces this as a persistent, actionable indicator
    // rather than a dialog the user must click through before the project even opens). `prompt: true`
    // (default) is the original interactive behavior, still used wherever a blocking confirm is acceptable.
    async replaceMissingFiles(boxGraph: BoxGraph, manager: AssetService.InvalidateManager,
                               {prompt = true}: {prompt?: boolean} = {}): Promise<ReadonlyArray<AssetService.MissingAsset>> {
        const {status, error, value: available} = await Promises.tryCatch(this.collectAllFiles())
        if (status === "rejected") {
            console.warn(`Could not collect ${this.namePlural}:`, error)
            if (prompt) {
                RuntimeNotifier.notify({
                    message: `Could not reach the ${this.namePlural} catalog. Missing files were not checked.`,
                    icon: "Warning"
                })
            }
            return []
        }
        const boxes = boxGraph.boxes().filter(box => isInstanceOf(box, this.boxType))
        const missing = boxes.filter(box => {
            const uuidAsString = UUID.toString(box.address.uuid)
            return available.find(({uuid}) => uuid === uuidAsString) === undefined
        })
        if (missing.length === 0) {return []}
        if (!prompt) {
            return missing.map(box => ({uuid: box.address.uuid, fileName: box.fileName.getValue()}))
        }
        const stillMissing: Array<AssetService.MissingAsset> = []
        for (const box of missing) {
            const uuid = box.address.uuid
            const fileName = box.fileName.getValue()
            const approved = await RuntimeNotifier.approve({
                headline: "Missing Asset",
                message: `Could not find ${this.nameSingular} '${fileName}'`,
                cancelText: "Ignore",
                approveText: "Browse"
            })
            if (!approved) {stillMissing.push({uuid, fileName}); continue}
            const resolved = await this.resolveOne(uuid, fileName, manager)
            if (!resolved) {stillMissing.push({uuid, fileName})}
        }
        return stillMissing
    }

    // Resolves exactly one missing asset by browsing for a replacement file, importing it, and invalidating
    // the box's loader entry — the same interactive step `replaceMissingFiles` runs per box, extracted so a
    // persistent "N missing assets" indicator can drive it on demand, one at a time, well after project load.
    async resolveOne(uuid: UUID.Bytes, fileName: string, manager: AssetService.InvalidateManager): Promise<boolean> {
        const {error, status, value: files} =
            await Promises.tryCatch(Files.open({...this.filePickerOptions, multiple: false}))
        if (status === "rejected") {
            if (!Errors.isAbort(error) && !Errors.isNotAllowed(error)) {
                console.warn(`File browse failed: ${error}`)
                RuntimeNotifier.notify({message: "File access error.", icon: "Warning"})
            }
            return false
        }
        if (files.length === 0) {return false}
        const readResult = await Promises.tryCatch(files[0].arrayBuffer())
        if (readResult.status === "rejected") {
            await RuntimeNotifier.info({
                headline: "File Read Error",
                message: `'${files[0].name}' could not be read. The file may be on an inaccessible location.`
            })
            return false
        }
        const importResult = await Promises.tryCatch(this.importFile({
            uuid, name: files[0].name, arrayBuffer: readResult.value, progressHandler: Progress.Empty
        }))
        if (importResult.status === "rejected") {
            await RuntimeNotifier.info({
                headline: `${this.nameSingular} Import Failed`,
                message: `'${files[0].name}' could not be imported: ${String(importResult.error)}`
            })
            return false
        }
        RuntimeNotifier.notify({message: `${importResult.value.name} has been replaced`, icon: "Checkbox"})
        manager.invalidate(uuid)
        return true
    }

    protected async browseFiles(multiple: boolean, filePickerSettings: FilePickerOptions): Promise<ReadonlyArray<T>> {
        const {error, status, value: files} =
            await Promises.tryCatch(Files.open({...filePickerSettings, multiple}))
        if (status === "rejected") {
            if (Errors.isAbort(error) || Errors.isNotAllowed(error)) {return []}
            console.warn(`File browse failed: ${error}`)
            RuntimeNotifier.notify({message: "File access error.", icon: "Warning"})
            return []
        }
        const progress = new DefaultObservableValue(0.0)
        const dialog = RuntimeNotifier.progress({
            headline: `Importing ${files.length === 1 ? this.nameSingular : this.namePlural}...`, progress
        })
        const progressHandler = Progress.split(value => progress.setValue(value), files.length)
        const rejected: Array<string> = []
        const imported: Array<T> = []
        for (const [index, file] of files.entries()) {
            const readResult = await Promises.tryCatch(file.arrayBuffer())
            if (readResult.status === "rejected") {
                rejected.push(`'${file.name}' could not be read`)
                continue
            }
            const {status, value, error} = await Promises.tryCatch(this.importFile({
                name: file.name,
                arrayBuffer: readResult.value,
                progressHandler: progressHandler[index]
            }))
            if (status === "rejected") {rejected.push(String(error))} else {imported.push(value)}
        }
        dialog.terminate()
        if (rejected.length > 0) {
            await RuntimeNotifier.info({
                headline: `${this.nameSingular} Import Issues`,
                message: `${rejected.join(", ")} could not be imported.`
            })
        }
        return imported
    }

    protected abstract collectAllFiles(): Promise<ReadonlyArray<T>>
}