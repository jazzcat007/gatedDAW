#!/usr/bin/env node
/**
 * Validate and import SFZ instruments as self-contained, offline factory assets.
 * This deliberately preserves the source SFZ and its referenced samples; it never
 * flattens a multi-sample mapping into the single-sample catalog.
 */
import {copyFileSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync} from "node:fs"
import {createHash} from "node:crypto"
import {basename, dirname, extname, join, normalize, relative, resolve, sep} from "node:path"
import {fileURLToPath} from "node:url"
import {wavInfo} from "./lib/wav-info.mjs"
import {parseSfz, resolveSfzPath, toRegion} from "./lib/sfz-parse.mjs"

const DEFAULT_ROOT = "/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory"
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

const tryWavInfo = buffer => {
    try {return {value: wavInfo(buffer)}} catch (error) {return {reason: error instanceof Error ? error.message : String(error)}}
}

const probeSamples = (samples, bytes) => {
    const info = new Map()
    const unreadable = []
    for (const path of samples) {
        const attempt = tryWavInfo(bytes.get(path))
        if (attempt.reason !== undefined) {unreadable.push({path, reason: attempt.reason}); continue}
        info.set(path, {...attempt.value, uuid: contentUuid([bytes.get(path)])})
    }
    return {info, unreadable}
}

const linkOrCopy = (source, target) => {
    if (existsSync(target)) {return}
    mkdirSync(dirname(target), {recursive: true})
    const attempt = tryLink(source, target)
    if (!attempt) {copyFileSync(source, target)}
}

const tryLink = (source, target) => {
    try {linkSync(source, target); return true} catch {return false}
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
        const invalidDefinitions = new Set()
        for (const definition of walk(libraryRoot)) {
            const key = relative(libraryRoot, definition).replaceAll("\\", "/")
            const parsed = parseSfz(definition)
            const pathOf = region => resolveSfzPath(dirname(definition), region.default_path ?? "", region.sample)
            const playable = parsed.regions.filter(region => region.sample)
            const samples = [...new Set(playable.map(pathOf))]
            const missing = samples.filter(sample => !inside(libraryRoot, sample) || !existsSync(sample))
            if (parsed.regions.length === 0 || missing.length > 0) {
                console.error(`invalid  ${key} regions=${parsed.regions.length} missing=${missing.length}`)
                invalidDefinitions.add(key); failed++; continue
            }
            const bytes = new Map(samples.map(sample => [sample, readFileSync(sample)]))
            const {info, unreadable} = probeSamples(samples, bytes)
            if (unreadable.length > 0) {
                const [{path, reason}] = unreadable
                console.error(`invalid  ${key} unreadable=${unreadable.length} first='${relative(libraryRoot, path)}' (${reason})`)
                invalidDefinitions.add(key); failed++; continue
            }
            // Hash inputs stay definition-then-sorted-sample-bytes: the instrument uuid must not shift.
            const uuid = contentUuid([readFileSync(definition), ...samples.slice().sort().map(sample => bytes.get(sample))])
            const manifest = {
                version: 1,
                regions: playable.map(region => {
                    const probe = info.get(pathOf(region))
                    return {
                        sample: probe.uuid,
                        fileName: basename(pathOf(region)),
                        durationInSeconds: probe.durationInSeconds,
                        sampleRate: probe.sampleRate,
                        channels: probe.channels,
                        ...toRegion(region)
                    }
                }),
                unsupportedOpcodes: parsed.unsupported
            }
            const entry = {uuid, name: basename(definition, ".sfz"), definition: key,
                regions: parsed.regions.length, samples: samples.length, unsupportedOpcodes: parsed.unsupported,
                license: args.license ?? "No license provided", url: args.url ?? "local import"}
            entries.push({entry, definition, samples, manifest, info})
        }
        const folder = catalog.folders.find(candidate => candidate.name === library) ?? {name: library, instruments: []}
        if (!catalog.folders.includes(folder)) {catalog.folders.push(folder)}
        folder.instruments ??= []
        // The index is additive across runs, so an instrument that stops validating would otherwise keep
        // advertising an entry whose regions.json was never written — a browser row that hard-fails the
        // moment it is clicked. This is exactly how VCSL's TX81Z/Gong 2/Tubular Bells entries survived a
        // run that rejected them. Prune by definition path rather than uuid, because the path is the
        // identity that survives a content edit: drop every entry for a definition this run walked, then
        // the loop below re-adds only the ones that actually imported. A definition deleted from the
        // library outright is not walked at all, so it is not pruned here.
        const walked = new Set([...invalidDefinitions, ...entries.map(({entry}) => entry.definition)])
        folder.instruments = folder.instruments.filter(candidate => !walked.has(candidate.definition))
        for (const {entry, definition, samples, manifest, info} of entries) {
            if (!folder.instruments.some(candidate => candidate.uuid === entry.uuid)) {folder.instruments.push(entry)}
            if (!args["dry-run"]) {
                const instrumentRoot = join(root, "sfz", entry.uuid)
                const targetRoot = join(instrumentRoot, "source")
                for (const file of [definition, ...samples]) {
                    const target = join(targetRoot, relative(libraryRoot, file)); mkdirSync(dirname(target), {recursive: true}); copyFileSync(file, target)
                }
                // Link out of the copy, not the library: same filesystem as the store, so the link cannot fail over.
                for (const sample of samples) {
                    linkOrCopy(join(targetRoot, relative(libraryRoot, sample)), join(root, "sfz", "samples", info.get(sample).uuid))
                }
                writeFileSync(join(instrumentRoot, "regions.json"), `${JSON.stringify(manifest, null, 2)}\n`)
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
