import {UUID} from "@opendaw/lib-std"
import {Files} from "@opendaw/lib-dom"
import {Promises} from "@opendaw/lib-runtime"
import {AudioFileBox} from "@opendaw/studio-boxes"
import {SfzDeviceBoxAdapter} from "@opendaw/studio-adapters"
import {
    FilePickerAcceptTypes,
    limitSfzRegions,
    SfzParser,
    StudioPreferences,
    toSfzAttachment,
    withExtendedKeyRange
} from "@opendaw/studio-core"
import {StudioService} from "@/service/StudioService"

// Materializes an SFZ definition + its referenced WAVs into an existing (typically empty) SfzDeviceBox: opens a
// flat multi-file picker (no directory picker exists in this codebase), resolves each region's `sample=` by
// basename against the picked WAVs, imports each unique WAV once, and appends the resulting regions. Playable
// core's stopgap: basename-only resolution, no factory catalog, no #include (see plans/sfz-instrument-support.md).
export namespace SfzImportTrigger {
    export const run = async (service: StudioService, adapter: SfzDeviceBoxAdapter): Promise<void> => {
        const {status, value: files} = await Promises.tryCatch(Files.open({
            multiple: true,
            ...FilePickerAcceptTypes.SfzFiles
        }))
        if (status === "rejected" || files.length === 0) {return}
        const definitionFile = files.find(file => file.name.toLowerCase().endsWith(".sfz"))
        if (definitionFile === undefined) {
            console.warn("SFZ import: no .sfz file selected")
            return
        }
        const wavFilesByName = new Map<string, File>(files
            .filter(file => file.name.toLowerCase().endsWith(".wav"))
            .map(file => [file.name.toLowerCase(), file]))
        const source = await definitionFile.text()
        const {regions, unsupportedOpcodes} = SfzParser.parse(source)
        if (unsupportedOpcodes.length > 0) {
            console.warn(`SFZ import: unsupported opcodes ignored: ${unsupportedOpcodes.join(", ")}`)
        }
        const {project} = service
        const {boxGraph, editing} = project
        const configuredLimit = StudioPreferences.settings.engine["sfz-region-limit"]
        const availableRegions = Math.max(0, configuredLimit - adapter.regions.adapters().length)
        if (availableRegions === 0) {
            console.warn(`SFZ import: device already has the configured maximum of ${configuredLimit} regions`)
            return
        }
        const selectedRegions = limitSfzRegions(regions, availableRegions)
        if (selectedRegions.length < regions.length) {
            console.info(`SFZ import: limited ${regions.length} regions to ${selectedRegions.length}`)
        }
        // Resolves each WAV to sample metadata only -- no box-graph access here. The matching AudioFileBox
        // is created later, inside the single transaction that also creates the regions referencing it:
        // creating it here (its own transaction, ahead of time) left it briefly edgeless and tripped the
        // graph's referential-integrity check ("Target ... requires an edge") once that transaction closed.
        // The factory-catalog import path (SfzSelection.ts) never hits this because its manifest already
        // has everything synchronously and does box creation + region creation in one transaction; local
        // import needs this async pre-resolution phase first because it has to read/upload arbitrary
        // picked File objects.
        type ResolvedSample = {uuid: UUID.Bytes, name: string, duration: number}
        const importedFiles = new Map<string, Promise<ResolvedSample>>()
        const resolveSample = (wavFile: File): Promise<ResolvedSample> => {
            const key = wavFile.name.toLowerCase()
            const existing = importedFiles.get(key)
            if (existing !== undefined) {return existing}
            const promise = (async (): Promise<ResolvedSample> => {
                const arrayBuffer = await wavFile.arrayBuffer()
                const sample = await service.sampleService.importFile({name: wavFile.name, arrayBuffer})
                return {uuid: UUID.parse(sample.uuid), name: sample.name, duration: sample.duration}
            })()
            importedFiles.set(key, promise)
            return promise
        }
        const basename = (path: string): string => path.replaceAll("\\", "/").split("/").pop() ?? path
        const resolved: Array<{region: typeof selectedRegions[number], sample: ResolvedSample}> = []
        let missing = 0
        for (const region of selectedRegions) {
            const wavFile = wavFilesByName.get(basename(region.sample).toLowerCase())
            if (wavFile === undefined) {
                missing++
                continue
            }
            resolved.push({region, sample: await resolveSample(wavFile)})
        }
        if (missing > 0) {
            console.warn(`SFZ import: ${missing} region(s) skipped, sample not found among the picked files`)
        }
        if (resolved.length === 0) {return}
        editing.modify(() => {
            const files = new Map<string, AudioFileBox>()
            const attachment = resolved.map(({region, sample}) => {
                const key = UUID.toString(sample.uuid)
                let file = files.get(key)
                if (file === undefined) {
                    project.trackUserCreatedSample(sample.uuid)
                    file = boxGraph.findBox<AudioFileBox>(sample.uuid).unwrapOrElse(() =>
                        AudioFileBox.create(boxGraph, sample.uuid, box => {
                            box.fileName.setValue(sample.name)
                            box.endInSeconds.setValue(sample.duration)
                        }))
                    files.set(key, file)
                }
                return toSfzAttachment(region, file)
            })
            adapter.load(withExtendedKeyRange(attachment))
        })
    }
}
