import {asDefined, Lazy, panic, TimeSpan, UUID} from "@opendaw/lib-std"
import {SfzInstrument} from "@opendaw/studio-adapters"
import {OpenDAWHeaders} from "./OpenDAWHeaders"
import {SfzIndex} from "./SfzIndex"
import {IntervalRetryOption, network, Promises} from "@opendaw/lib-runtime"

export class OpenSfzAPI {
    static readonly FileRoot = "/factory/sfz"
    static readonly IndexFile = `${OpenSfzAPI.FileRoot}/index.json`

    @Lazy
    static get(): OpenSfzAPI {return new OpenSfzAPI()}

    // Same as the sample/soundfont index: the query defeats caching outright, so a publish is visible on the
    // next load without relying on the browser revalidating.
    readonly #headers: RequestInit = {...OpenDAWHeaders, cache: "no-cache"}
    readonly #memoized: () => Promise<SfzIndex> = Promises.memoizeAsync(() =>
        Promises.retry(() => network.limitFetch(`${OpenSfzAPI.IndexFile}?v=${Date.now()}`, this.#headers),
            new IntervalRetryOption(3, TimeSpan.seconds(1)))
            .then(response => response.ok ? response.json() : panic(`${response.status} ${response.statusText}`))
            .then(json => SfzIndex.schema.parse(json)))

    private constructor() {}

    async tree(): Promise<SfzIndex> {return this.#memoized()}

    async all(): Promise<ReadonlyArray<SfzInstrument>> {return SfzIndex.flatten(await this.#memoized())}

    async get(uuid: UUID.Bytes): Promise<SfzInstrument> {
        const uuidAsString = UUID.toString(uuid)
        return this.all().then(list => asDefined(list
            .find(({uuid}) => uuid === uuidAsString), "Could not find SFZ instrument"))
    }

    // A catalog entry is a `.sfz` text file plus N separately-addressed WAVs, not one opaque blob (unlike
    // Soundfont's `load`), so this splits into a definition fetch and a per-sample fetch instead.
    async loadDefinition(uuid: UUID.Bytes): Promise<string> {
        const instrument = await this.get(uuid)
        const url = `${OpenSfzAPI.FileRoot}/${instrument.uuid}/source/${instrument.definition}`
        return fetch(url, OpenDAWHeaders).then(response =>
            response.ok ? response.text() : panic(`${response.status} ${response.statusText}`))
    }

    async loadSample(uuid: UUID.Bytes, relativePath: string): Promise<ArrayBuffer> {
        const instrument = await this.get(uuid)
        const url = `${OpenSfzAPI.FileRoot}/${instrument.uuid}/source/${relativePath}`
        return fetch(url, OpenDAWHeaders).then(response =>
            response.ok ? response.arrayBuffer() : panic(`${response.status} ${response.statusText}`))
    }
}
