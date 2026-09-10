#!/usr/bin/env node
/**
 * Validate and import SFZ instruments as self-contained, offline factory assets.
 * This deliberately preserves the source SFZ and its referenced samples; it never
 * flattens a multi-sample mapping into the single-sample catalog.
 */
import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync} from "node:fs"
import {createHash} from "node:crypto"
import {basename, dirname, extname, join, normalize, relative, resolve, sep} from "node:path"
import {fileURLToPath} from "node:url"

const DEFAULT_ROOT = "/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory"
const SUPPORTED = new Set([
    "sample", "default_path", "lokey", "hikey", "key", "lovel", "hivel", "pitch_keycenter",
    "loop_mode", "loop_start", "loop_end", "group", "off_by", "off_mode", "polyphony",
    "seq_length", "seq_position", "lorand", "hirand", "sw_lokey", "sw_hikey", "sw_last",
    "sw_default", "sw_down", "sw_up", "ampeg_attack", "ampeg_decay", "ampeg_sustain",
    "ampeg_release", "volume", "gain", "pan", "tune", "transpose", "trigger"
])
const usage = `Usage: node scripts/import-sfz-instruments.mjs <library-folder> [more-folders...]

Options:
  --root <path>       Factory root (default: configured media root)
  --library <name>    Source-library label (default: input folder name)
  --license <text>    License recorded on imported entries
  --url <url>         Source URL recorded on imported entries
  --dry-run           Validate and report without copying or changing index.json
  --help              Print this help
`

const parseArgs = argv => {
    const args = {paths: []}
    for (let index = 2; index < argv.length; index++) {
        const token = argv[index]
        if (!token.startsWith("--")) {args.paths.push(token); continue}
        const key = token.slice(2)
        if (key === "help" || key === "dry-run") {args[key] = true; continue}
        const value = argv[++index]
        if (value === undefined || value.startsWith("--")) {throw new Error(`Missing value for --${key}`)}
        args[key] = value
    }
    return args
}

const walk = (path, files = []) => {
    const stats = statSync(path)
    if (stats.isDirectory()) {
        readdirSync(path, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))
            .forEach(entry => walk(join(path, entry.name), files))
    } else if (stats.isFile() && extname(path).toLowerCase() === ".sfz") {files.push(path)}
    return files
}

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
    const expression = /([A-Za-z][A-Za-z0-9_]*)\s*=\s*("(?:[^"\\]|\\.)*"|[^\s<>=]+)/g
    for (const match of source.matchAll(expression)) {
        attributes.push([match[1].toLowerCase(), match[2].replace(/^"|"$/g, "")])
    }
    return attributes
}

const parseFile = (file, stack = []) => {
    const resolved = resolve(file)
    if (stack.includes(resolved)) {throw new Error(`Circular #include: ${[...stack, resolved].join(" -> ")}`)}
    const raw = readFileSync(resolved, "utf8")
    const expanded = withoutComments(raw).replace(/^\s*#include\s+"([^"]+)"\s*$/gm, (_match, include) =>
        parseFile(resolve(dirname(resolved), include), [...stack, resolved]).source)
    return {source: expanded, attributes: parseAttributes(expanded)}
}

export const parseSfz = file => {
    const {source} = parseFile(file)
    const tokens = /<(control|global|master|group|region)>|([A-Za-z][A-Za-z0-9_]*)\s*=\s*("(?:[^"\\]|\\.)*"|[^\s<>=]+)/gi
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
            const value = match[3].replace(/^"|"$/g, "")
            scopes[current][key] = value
            if (current === "region") {Object.assign(regions.at(-1), scopes.control, scopes.global, scopes.master, scopes.group, scopes.region)}
        }
    }
    return {regions, unsupported: [...new Set([...source.matchAll(/([A-Za-z][A-Za-z0-9_]*)\s*=/g)].map(match => match[1].toLowerCase()).filter(key => !SUPPORTED.has(key)))]}
}

const inside = (root, file) => {
    const path = relative(root, file)
    return path !== "" && !path.startsWith(`..${sep}`) && path !== ".." && !path.includes(`${sep}..${sep}`)
}
const contentUuid = buffers => {
    const hash = createHash("sha256"); buffers.forEach(buffer => hash.update(buffer))
    const bytes = hash.digest().subarray(0, 16); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128
    const hex = bytes.toString("hex")
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
const readCatalog = path => existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {version: 1, updatedAt: new Date(0).toISOString(), folders: []}

const main = () => {
    const args = parseArgs(process.argv)
    if (args.help) {process.stdout.write(usage); return}
    if (args.paths.length === 0) {throw new Error(usage)}
    const root = resolve(args.root ?? process.env.FACTORY_MIRROR_ROOT ?? DEFAULT_ROOT)
    const catalogPath = join(root, "sfz", "index.json")
    const catalog = readCatalog(catalogPath)
    catalog.folders ??= []
    let imported = 0; let failed = 0
    for (const input of args.paths) {
        const libraryRoot = resolve(input); const library = args.library ?? basename(libraryRoot)
        const entries = []
        for (const definition of walk(libraryRoot)) {
            const parsed = parseSfz(definition)
            const samples = [...new Set(parsed.regions.filter(region => region.sample).map(region =>
                resolve(dirname(definition), region.default_path ?? "", region.sample)))]
            const missing = samples.filter(sample => !inside(libraryRoot, sample) || !existsSync(sample))
            if (parsed.regions.length === 0 || missing.length > 0) {
                console.error(`invalid  ${relative(libraryRoot, definition)} regions=${parsed.regions.length} missing=${missing.length}`)
                failed++; continue
            }
            const uuid = contentUuid([readFileSync(definition), ...samples.sort().map(sample => readFileSync(sample))])
            const entry = {uuid, name: basename(definition, ".sfz"), definition: relative(libraryRoot, definition).replaceAll("\\", "/"),
                regions: parsed.regions.length, samples: samples.length, unsupportedOpcodes: parsed.unsupported,
                license: args.license ?? "No license provided", url: args.url ?? "local import"}
            entries.push({entry, definition, samples})
        }
        const folder = catalog.folders.find(candidate => candidate.name === library) ?? {name: library, instruments: []}
        if (!catalog.folders.includes(folder)) {catalog.folders.push(folder)}
        folder.instruments ??= []
        for (const {entry, definition, samples} of entries) {
            if (!folder.instruments.some(candidate => candidate.uuid === entry.uuid)) {folder.instruments.push(entry)}
            if (!args["dry-run"]) {
                const targetRoot = join(root, "sfz", entry.uuid, "source")
                for (const file of [definition, ...samples]) {
                    const target = join(targetRoot, relative(libraryRoot, file)); mkdirSync(dirname(target), {recursive: true}); copyFileSync(file, target)
                }
            }
            console.log(`import  ${library}/${entry.name} regions=${entry.regions} samples=${entry.samples} unsupported=${entry.unsupportedOpcodes.length}`)
            imported++
        }
        folder.instruments.sort((a, b) => a.name.localeCompare(b.name))
    }
    if (!args["dry-run"]) {
        mkdirSync(dirname(catalogPath), {recursive: true}); catalog.updatedAt = new Date().toISOString()
        const temporary = `${catalogPath}.tmp`; writeFileSync(temporary, `${JSON.stringify(catalog, null, 2)}\n`); renameSync(temporary, catalogPath)
    }
    console.log(`${args["dry-run"] ? "Dry run" : "Import"} complete: imported=${imported}, invalid=${failed}`)
    if (failed > 0) {process.exitCode = 1}
}

if (process.argv[1] && normalize(resolve(process.argv[1])) === normalize(fileURLToPath(import.meta.url))) {main()}
