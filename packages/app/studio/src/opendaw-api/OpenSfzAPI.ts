import {asDefined, Lazy, panic, TimeSpan, UUID} from "@opendaw/lib-std"
import {SfzInstrument} from "@opendaw/studio-adapters"
import {OpenDAWHeaders} from "./OpenDAWHeaders"
import {SfzIndex} from "./SfzIndex"
import {SfzRegionsManifest} from "./SfzRegionsManifest"
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

    // The device-creation path: one small manifest the importer already resolved (sample uuids, durations,
    // derived opcode values), so the browser neither fetches nor parses `.sfz` text for catalog content.
    async loadRegions(uuid: UUID.Bytes): Promise<SfzRegionsManifest> {
        const instrument = await this.get(uuid)
        const url = `${OpenSfzAPI.FileRoot}/${instrument.uuid}/regions.json?v=${Date.now()}`
        return fetch(url, this.#headers).then(response =>
            response.ok ? response.json() : panic(`${response.status} ${response.statusText}`))
            .then(json => SfzRegionsManifest.parse(json))
    }

    // Raw catalog content, kept for diagnostics and for anything that wants the original definition. The
    // device-creation path uses `loadRegions` instead.
    async loadDefinition(uuid: UUID.Bytes): Promise<string> {
        const instrument = await this.get(uuid)
        const url = `${OpenSfzAPI.FileRoot}/${instrument.uuid}/source/${OpenSfzAPI.#encodePath(instrument.definition)}`
        return fetch(url, OpenDAWHeaders).then(response =>
            response.ok ? response.text() : panic(`${response.status} ${response.statusText}`))
    }

    async loadSample(uuid: UUID.Bytes, relativePath: string): Promise<ArrayBuffer> {
        const instrument = await this.get(uuid)
        const url = `${OpenSfzAPI.FileRoot}/${instrument.uuid}/source/${OpenSfzAPI.#encodePath(relativePath)}`
        return fetch(url, OpenDAWHeaders).then(response =>
            response.ok ? response.arrayBuffer() : panic(`${response.status} ${response.statusText}`))
    }

    // Note names like "F#3.wav" are common in keyswitch/articulation libraries. An unencoded "#" in a URL
    // passed to fetch() is parsed as the start of a fragment and silently stripped from the request path.
    static #encodePath(path: string): string {return path.replaceAll("\\", "/").split("/").map(encodeURIComponent).join("/")}
}
