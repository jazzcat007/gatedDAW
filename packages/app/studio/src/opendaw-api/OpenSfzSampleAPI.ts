import {asDefined, Lazy, panic, Procedure, unitValue, UUID} from "@opendaw/lib-std"
import {network, Promises} from "@opendaw/lib-runtime"
import {SampleMetaData} from "@opendaw/studio-adapters"
import {AudioData, WavFile} from "@opendaw/lib-dsp"
import {OpenDAWHeaders} from "./OpenDAWHeaders"
import {OpenSfzAPI} from "./OpenSfzAPI"

// Region samples of the SFZ catalog, addressed purely by content uuid — the importer publishes every unique
// WAV once under `samples/`, so a fetch needs no index and no path lookup. They stay out of
// `/factory/samples` deliberately: several thousand region WAVs would swamp the Samples browser, which lists
// that index. `origin: "sfz"` is what keeps them out of the user's local list once cached.
export class OpenSfzSampleAPI {
    static readonly FileRoot = `${OpenSfzAPI.FileRoot}/samples`

    @Lazy
    static get(): OpenSfzSampleAPI {return new OpenSfzSampleAPI()}

    private constructor() {}

    async load(uuid: UUID.Bytes, progress: Procedure<unitValue>): Promise<[AudioData, SampleMetaData]> {
        const uuidAsString = UUID.toString(uuid)
        const response = await Promises.retry(() => network
            .limitFetch(`${OpenSfzSampleAPI.FileRoot}/${uuidAsString}`, OpenDAWHeaders))
        if (!response.ok) {
            return panic(`Failed to fetch SFZ sample ${uuidAsString}: ${response.status} ${response.statusText}`)
        }
        const arrayBuffer = await this.#withProgress(response, progress)
        const audioData = WavFile.decodeFloats(arrayBuffer)
        return [audioData, {
            name: uuidAsString,
            bpm: 120,
            duration: audioData.numberOfFrames / audioData.sampleRate,
            sample_rate: audioData.sampleRate,
            origin: "sfz"
        }]
    }

    async #withProgress(response: Response, progress: Procedure<unitValue>): Promise<ArrayBuffer> {
        const total = parseInt(response.headers.get("Content-Length") ?? "0")
        const reader = asDefined(response.body, "No body in response").getReader()
        const chunks: Array<Uint8Array> = []
        let loaded = 0
        while (true) {
            const {done, value} = await reader.read()
            if (done) {break}
            chunks.push(value)
            loaded += value.length
            progress(total > 0 ? loaded / total : 0.5)
        }
        return new Blob(chunks as Array<BlobPart>).arrayBuffer()
    }
}
