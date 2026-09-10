import {isDefined} from "@opendaw/lib-std"

export type SfzParsedRegion = {
    sample: string
    defaultPath: string
    keyLo: number
    keyHi: number
    rootKey: number
    velLo: number
    velHi: number
    loopMode: number // 0 = no_loop, 1 = loop_continuous
    loopStart: number
    loopEnd: number
    attack: number
    decay: number
    sustain: number
    release: number
    volume: number
    pan: number
    tune: number
}

export type SfzParseResult = {
    regions: ReadonlyArray<SfzParsedRegion>
    unsupportedOpcodes: ReadonlyArray<string>
}

// The opcode surface playable-core actually applies. Anything else parses but is reported, never silently
// dropped (`plans/sfz-instrument-support.md`'s later phases: round robin, keyswitch, choke groups, #include).
const SUPPORTED = new Set([
    "sample", "default_path", "lokey", "hikey", "key", "lovel", "hivel", "pitch_keycenter",
    "loop_mode", "loop_start", "loop_end", "ampeg_attack", "ampeg_decay", "ampeg_sustain",
    "ampeg_release", "volume", "gain", "pan", "tune", "transpose"
])

type Scope = {[opcode: string]: string}
type ScopeKind = "control" | "global" | "master" | "group" | "region"

const withoutComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(line => {
    let quote = false
    for (let index = 0; index < line.length - 1; index++) {
        if (line[index] === "\"") {quote = !quote}
        if (!quote && line[index] === "/" && line[index + 1] === "/") {return line.slice(0, index)}
    }
    return line
}).join("\n")

const number = (value: string | undefined, fallback: number): number =>
    isDefined(value) ? parseFloat(value) : fallback

const toRegion = (raw: Scope): SfzParsedRegion => {
    const key = raw.key
    const loopMode = raw.loop_mode === "loop_continuous" ? 1 : 0
    const tuneCents = number(raw.tune, 0) + number(raw.transpose, 0) * 100
    const sustainUnit = number(raw.ampeg_sustain, 100) / 100
    const panUnit = number(raw.pan, 0) / 100
    return {
        sample: raw.sample ?? "",
        defaultPath: raw.default_path ?? "",
        keyLo: number(raw.lokey ?? key, 0),
        keyHi: number(raw.hikey ?? key, 127),
        rootKey: number(raw.pitch_keycenter ?? key, 60),
        velLo: number(raw.lovel, 0),
        velHi: number(raw.hivel, 127),
        loopMode,
        loopStart: number(raw.loop_start, 0),
        loopEnd: number(raw.loop_end, 0),
        attack: number(raw.ampeg_attack, 0.001),
        decay: number(raw.ampeg_decay, 0.001),
        sustain: Math.min(1, Math.max(0, sustainUnit)),
        release: number(raw.ampeg_release, 0.05),
        volume: number(raw.gain ?? raw.volume, 0),
        pan: Math.min(1, Math.max(-1, panUnit)),
        tune: Math.min(1200, Math.max(-1200, tuneCents))
    }
}

const posixDirname = (path: string): string => {
    const normalized = path.replaceAll("\\", "/")
    const index = normalized.lastIndexOf("/")
    return index === -1 ? "" : normalized.slice(0, index)
}

const posixJoin = (...segments: ReadonlyArray<string>): string => {
    const parts = segments.flatMap(segment => segment.replaceAll("\\", "/").split("/"))
        .filter(part => part.length > 0 && part !== ".")
    const resolved: Array<string> = []
    for (const part of parts) {
        if (part === "..") {resolved.pop()} else {resolved.push(part)}
    }
    return resolved.join("/")
}

export namespace SfzParser {
    // Parses a single, already-flattened `.sfz` text (no `#include`, deferred per plan) into inheritance-
    // resolved regions: `<control>` / `<global>` / `<master>` / `<group>` opcodes cascade down, each `<region>`
    // snapshotting the merge at the point it opens (mirrors `scripts/import-sfz-instruments.mjs#parseSfz`).
    export const parse = (source: string): SfzParseResult => {
        const stripped = withoutComments(source)
        const tokens = /<(control|global|master|group|region)>|([A-Za-z][A-Za-z0-9_]*)\s*=\s*("(?:[^"\\]|\\.)*"|[^<\r\n]*?(?=\s+[A-Za-z][A-Za-z0-9_]*\s*=|\s*<|\r?\n|$))/gi
        const scopes: {control: Scope, global: Scope, master: Scope, group: Scope, region: Scope} =
            {control: {}, global: {}, master: {}, group: {}, region: {}}
        const raw: Array<Scope> = []
        let current: ScopeKind = "global"
        for (const match of stripped.matchAll(tokens)) {
            if (isDefined(match[1])) {
                current = match[1].toLowerCase() as ScopeKind
                if (current === "global") {scopes.global = {}; scopes.master = {}; scopes.group = {}}
                if (current === "master") {scopes.master = {}; scopes.group = {}}
                if (current === "group") {scopes.group = {}}
                if (current === "region") {
                    scopes.region = {}
                    raw.push({...scopes.control, ...scopes.global, ...scopes.master, ...scopes.group, ...scopes.region})
                }
            } else {
                const opcode = match[2].toLowerCase()
                const value = match[3].trim().replace(/^"|"$/g, "")
                scopes[current][opcode] = value
                if (current === "region") {
                    Object.assign(raw[raw.length - 1], scopes.control, scopes.global, scopes.master, scopes.group, scopes.region)
                }
            }
        }
        const unsupportedOpcodes = [...new Set([...stripped.matchAll(/([A-Za-z][A-Za-z0-9_]*)\s*=/g)]
            .map(match => match[1].toLowerCase())
            .filter(opcode => !SUPPORTED.has(opcode)))]
        const regions = raw.filter(scope => isDefined(scope.sample) && scope.sample.length > 0).map(toRegion)
        return {regions, unsupportedOpcodes}
    }

    // A region's `sample=` opcode is relative to `default_path=` which is itself relative to the `.sfz`
    // file's own directory (SFZ spec). `definitionRelativePath` is that `.sfz` file's own path relative to
    // its library root, so the result is a path relative to that same root — the shape catalog storage uses.
    export const resolveSamplePath = (definitionRelativePath: string, region: SfzParsedRegion): string =>
        posixJoin(posixDirname(definitionRelativePath), region.defaultPath, region.sample)
}
