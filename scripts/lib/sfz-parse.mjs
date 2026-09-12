// Offline twin of packages/studio/core/src/sfz/SfzParser.ts. Kept as its own dependency-free module so the
// importer runs on the deploy host without a built checkout, and so `importer-parity.test.ts` can import the
// parse surface without pulling in the CLI. Any change here must keep parity with SfzParser.
import {existsSync, readFileSync} from "node:fs"
import {dirname, resolve} from "node:path"

const SUPPORTED = new Set([
    "sample", "default_path", "lokey", "hikey", "key", "lovel", "hivel", "pitch_keycenter",
    "loop_mode", "loop_start", "loop_end", "group", "off_by", "off_mode", "polyphony",
    "seq_length", "seq_position", "lorand", "hirand", "sw_lokey", "sw_hikey", "sw_last",
    "sw_default", "sw_down", "sw_up", "ampeg_attack", "ampeg_decay", "ampeg_sustain",
    "ampeg_release", "volume", "gain", "pan", "tune", "transpose", "trigger"
])

const withoutComments = source => source.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(line => {
    let quote = false
    for (let index = 0; index < line.length - 1; index++) {
        if (line[index] === '"') {quote = !quote}
        if (!quote && line[index] === "/" && line[index + 1] === "/") {return line.slice(0, index)}
    }
    return line
}).join("\n")

const parseAttributes = source => {
    const attributes = []
    const expression = /([A-Za-z][A-Za-z0-9_]*)\s*=\s*("(?:[^"\\]|\\.)*"|[^<\r\n]*?(?=\s+[A-Za-z][A-Za-z0-9_]*\s*=|\s*<|\r?\n|$))/g
    for (const match of source.matchAll(expression)) {
        attributes.push([match[1].toLowerCase(), match[2].trim().replace(/^"|"$/g, "")])
    }
    return attributes
}

// `root` is the directory of the file `parseSfz` was originally called with (not the immediate parent of
// whichever file is being expanded right now). Some libraries (e.g. Karoryfer's Caveman Cosmonaut) nest
// `#include` directives several levels deep where every `#include "mappings/x.sfz"` string is written
// relative to that original top-level file's folder, not to the including file's own folder — a file
// already inside `mappings/` including `"mappings/x.sfz"` means the sibling `x.sfz`, not `mappings/mappings/
// x.sfz`. Resolving relative to the including file first (the SFZ-spec-correct behavior, kept as the
// primary path so ordinary single-level includes are unaffected) and falling back to root-relative only
// when that path doesn't exist handles both conventions without guessing wrong for the common case.
const parseFile = (file, stack = [], root = dirname(resolve(file)), included = new Set()) => {
    const resolved = resolve(file)
    if (stack.includes(resolved)) {throw new Error(`Circular #include: ${[...stack, resolved].join(" -> ")}`)}
    const raw = readFileSync(resolved, "utf8")
    const expanded = withoutComments(raw).replace(/^\s*#include\s+"([^"]+)"\s*$/gm, (_match, include) => {
        const selfRelative = resolve(dirname(resolved), include)
        const target = existsSync(selfRelative) ? selfRelative : resolve(root, include)
        included.add(target)
        return parseFile(target, [...stack, resolved], root, included).source
    })
    return {source: expanded, attributes: parseAttributes(expanded), included}
}

export const parseSfz = file => {
    const {source, included} = parseFile(file)
    const tokens = /<(control|global|master|group|region)>|([A-Za-z][A-Za-z0-9_]*)\s*=\s*("(?:[^"\\]|\\.)*"|[^<\r\n]*?(?=\s+[A-Za-z][A-Za-z0-9_]*\s*=|\s*<|\r?\n|$))/gi
    const scopes = {control: {}, global: {}, master: {}, group: {}, region: {}}
    const regions = []
    let current = "global"
    for (const match of source.matchAll(tokens)) {
        if (match[1]) {
            current = match[1].toLowerCase()
            if (current === "global") {scopes.global = {}; scopes.master = {}; scopes.group = {}}
            if (current === "master") {scopes.master = {}; scopes.group = {}}
            if (current === "group") {scopes.group = {}}
            if (current === "region") {
                scopes.region = {}
                regions.push(Object.assign({}, scopes.control, scopes.global, scopes.master, scopes.group, scopes.region))
            }
        } else {
            const key = match[2].toLowerCase()
            const value = match[3].trim().replace(/^"|"$/g, "")
            scopes[current][key] = value
            if (current === "region") {Object.assign(regions.at(-1), scopes.control, scopes.global, scopes.master, scopes.group, scopes.region)}
        }
    }
    return {
        regions,
        unsupported: [...new Set([...source.matchAll(/([A-Za-z][A-Za-z0-9_]*)\s*=/g)].map(match => match[1].toLowerCase()).filter(key => !SUPPORTED.has(key)))],
        includedFiles: [...included]
    }
}

const number = (value, fallback) => value === undefined ? fallback : parseFloat(value)

// Mirrors SfzParser's `toRegion` so the published manifest carries the same derived values the browser
// would have computed.
export const toRegion = raw => {
    const key = raw.key
    const tuneCents = number(raw.tune, 0) + number(raw.transpose, 0) * 100
    const sustainUnit = number(raw.ampeg_sustain, 100) / 100
    const panUnit = number(raw.pan, 0) / 100
    return {
        keyLo: number(raw.lokey ?? key, 0),
        keyHi: number(raw.hikey ?? key, 127),
        rootKey: number(raw.pitch_keycenter ?? key, 60),
        velLo: number(raw.lovel, 0),
        velHi: number(raw.hivel, 127),
        loopMode: raw.loop_mode === "loop_continuous" ? 1 : 0,
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

// Resolves a region's sample against the definition's folder, tolerating Windows separators in the source.
export const resolveSfzPath = (base, ...segments) =>
    resolve(base, ...segments.flatMap(segment => segment.replaceAll("\\", "/").split("/")).filter(segment => segment.length > 0))
