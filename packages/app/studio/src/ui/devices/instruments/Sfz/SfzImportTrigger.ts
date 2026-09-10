import {UUID} from "@opendaw/lib-std"
import {Files} from "@opendaw/lib-dom"
import {Promises} from "@opendaw/lib-runtime"
import {AudioFileBox} from "@opendaw/studio-boxes"
import {InstrumentFactories, SfzDeviceBoxAdapter} from "@opendaw/studio-adapters"
import {FilePickerAcceptTypes, SfzParsedRegion, SfzParser} from "@opendaw/studio-core"
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
        const importedFiles = new Map<string, Promise<AudioFileBox>>()
        const resolveAudioFile = (wavFile: File): Promise<AudioFileBox> => {
            const key = wavFile.name.toLowerCase()
            const existing = importedFiles.get(key)
            if (existing !== undefined) {return existing}
            const promise = (async (): Promise<AudioFileBox> => {
                const arrayBuffer = await wavFile.arrayBuffer()
                const sample = await service.sampleService.importFile({name: wavFile.name, arrayBuffer})
                const uuid = UUID.parse(sample.uuid)
                project.trackUserCreatedSample(uuid)
                return boxGraph.findBox<AudioFileBox>(uuid).unwrapOrElse(() =>
                    AudioFileBox.create(boxGraph, uuid, box => {
                        box.fileName.setValue(sample.name)
                        box.endInSeconds.setValue(sample.duration)
                    }))
            })()
            importedFiles.set(key, promise)
            return promise
        }
        const basename = (path: string): string => path.replaceAll("\\", "/").split("/").pop() ?? path
        const attachment: Array<InstrumentFactories.SfzRegionAttachment[number]> = []
        let missing = 0
        for (const region of regions) {
            const wavFile = wavFilesByName.get(basename(region.sample).toLowerCase())
            if (wavFile === undefined) {
                missing++
                continue
            }
            const file = await resolveAudioFile(wavFile)
            attachment.push(toAttachment(region, file))
        }
        if (missing > 0) {
            console.warn(`SFZ import: ${missing} region(s) skipped, sample not found among the picked files`)
        }
        if (attachment.length === 0) {return}
        editing.modify(() => adapter.load(attachment))
    }

    const toAttachment = (region: SfzParsedRegion, file: AudioFileBox): InstrumentFactories.SfzRegionAttachment[number] => ({
        file,
        keyLo: Math.round(region.keyLo),
        keyHi: Math.round(region.keyHi),
        rootKey: Math.round(region.rootKey),
        velLo: Math.round(region.velLo),
        velHi: Math.round(region.velHi),
        loopMode: region.loopMode,
        loopStart: Math.round(region.loopStart),
        loopEnd: Math.round(region.loopEnd),
        attack: region.attack,
        decay: region.decay,
        sustain: region.sustain,
        release: region.release,
        volume: region.volume,
        pan: region.pan,
        tune: region.tune
    })
}
