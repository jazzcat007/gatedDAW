import {Arrays, asDefined, isAbsent, RuntimeNotifier, UUID} from "@opendaw/lib-std"
import {InstrumentFactories, SfzInstrument} from "@opendaw/studio-adapters"
import {SfzParser, toSfzAttachment} from "@opendaw/studio-core"
import {AudioFileBox} from "@opendaw/studio-boxes"
import {Promises} from "@opendaw/lib-runtime"
import {OpenSfzAPI} from "@/opendaw-api"
import {HTMLSelection} from "@/ui/HTMLSelection"
import {StudioService} from "@/service/StudioService"
import {ResourceSelection} from "@/ui/browse/ResourceSelection"

// Mirrors SoundfontSelection's click-to-device flow, but an SFZ catalog entry is a `.sfz` text file plus N
// separately-addressed WAVs (not one opaque blob), so this fetches the definition, parses it, then fetches
// and imports every uniquely-referenced sample before a device can be created — same shape SfzImportTrigger
// builds from local files, sourced from OpenSfzAPI instead of a FileList.
export class SfzSelection implements ResourceSelection<SfzInstrument> {
    readonly #service: StudioService
    readonly #selection: HTMLSelection

    constructor(service: StudioService, selection: HTMLSelection) {
        this.#service = service
        this.#selection = selection
    }

    async requestDevice(instruments: ReadonlyArray<SfzInstrument>): Promise<void> {
        const [sfz] = instruments
        if (isAbsent(sfz)) {return}
        if (!this.#service.hasProfile) {
            await this.#service.newProject()
            if (!this.#service.hasProfile) {return}
        }
        const dialog = RuntimeNotifier.progress({headline: `Loading ${sfz.name}`})
        const {status, value: result, error} = await Promises.tryCatch(this.#loadAttachment(sfz))
        dialog.terminate()
        if (status === "rejected") {
            console.warn(`SFZ import: failed to load '${sfz.name}':`, error)
            RuntimeNotifier.notify({message: "Cannot load SFZ instrument.", icon: "Warning"})
            return
        }
        const {attachment, missing} = result
        if (attachment.length === 0) {
            RuntimeNotifier.notify({message: "SFZ instrument has no loadable regions.", icon: "Warning"})
            return
        }
        if (missing > 0) {
            RuntimeNotifier.notify({message: `${missing} SFZ region(s) skipped.`, icon: "Warning"})
        }
        const {api, editing} = this.#service.project
        editing.modify(() => api.createInstrument(InstrumentFactories.Sfz, {attachment}))
    }

    async #loadAttachment(sfz: SfzInstrument): Promise<{attachment: InstrumentFactories.SfzRegionAttachment, missing: number}> {
        const uuid = UUID.parse(sfz.uuid)
        const source = await OpenSfzAPI.get().loadDefinition(uuid)
        const {regions, unsupportedOpcodes} = SfzParser.parse(source)
        if (unsupportedOpcodes.length > 0) {
            console.warn(`SFZ import: unsupported opcodes ignored: ${unsupportedOpcodes.join(", ")}`)
        }
        const {project} = this.#service
        const {boxGraph} = project
        const importedFiles = new Map<string, Promise<AudioFileBox>>()
        const resolveAudioFile = (relativePath: string): Promise<AudioFileBox> => {
            const key = relativePath.toLowerCase()
            const existing = importedFiles.get(key)
            if (existing !== undefined) {return existing}
            const promise = (async (): Promise<AudioFileBox> => {
                const arrayBuffer = await OpenSfzAPI.get().loadSample(uuid, relativePath)
                const name = relativePath.split("/").pop() ?? relativePath
                const sample = await this.#service.sampleService.importFile({name, arrayBuffer})
                const sampleUuid = UUID.parse(sample.uuid)
                project.trackUserCreatedSample(sampleUuid)
                return boxGraph.findBox<AudioFileBox>(sampleUuid).unwrapOrElse(() =>
                    AudioFileBox.create(boxGraph, sampleUuid, box => {
                        box.fileName.setValue(sample.name)
                        box.endInSeconds.setValue(sample.duration)
                    }))
            })()
            importedFiles.set(key, promise)
            return promise
        }
        const attachment: Array<InstrumentFactories.SfzRegionAttachment[number]> = []
        let missing = 0
        for (const region of regions) {
            const relativePath = SfzParser.resolveSamplePath(sfz.definition, region)
            const {status, value: file} = await Promises.tryCatch(resolveAudioFile(relativePath))
            if (status === "rejected") {missing++; continue}
            attachment.push(toSfzAttachment(region, file))
        }
        if (missing > 0) {
            console.warn(`SFZ import: ${missing} region(s) skipped, sample fetch failed`)
        }
        return {attachment, missing}
    }

    async deleteItems(_instruments: ReadonlyArray<SfzInstrument>): Promise<ReadonlyArray<SfzInstrument>> {
        // Every entry here is server-hosted factory content (origin "openDAW"); there is no local SFZ
        // storage yet to delete from.
        return Arrays.empty()
    }

    selected(): ReadonlyArray<SfzInstrument> {
        const selected = this.#selection.getSelected()
        return selected.map(element =>
            JSON.parse(asDefined(element.getAttribute("data-selection"))) as SfzInstrument)
    }
}
