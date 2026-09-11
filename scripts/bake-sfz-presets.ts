#!/usr/bin/env tsx
// Bakes SFZ catalog instruments into factory device presets. Each AudioFileBox keeps the sample-store
// UUID so the lazy sample loader can resolve the WAV on first playback. Run with tsx, not node:
// npx tsx scripts/bake-sfz-presets.ts --root <factory-root>
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from "node:fs"
import {createHash} from "node:crypto"
import {dirname, join, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {isDefined, Optional, Option, tryCatch, UUID} from "@opendaw/lib-std"
import {BoxGraph} from "@opendaw/lib-box"
import {AudioFileBox, CaptureMidiBox} from "@opendaw/studio-boxes"
import {AudioUnitType, IconSymbol} from "@opendaw/studio-enums"
import {AudioUnitFactory, InstrumentFactories, PresetEncoder, ProjectSkeleton} from "@opendaw/studio-adapters"
// Deep import from studio-core source: the package entry pulls in ysync code that reads
// `import.meta.env` at module scope, which only exists under a bundler, not in Node.
import {toSfzAttachment, withExtendedKeyRange} from "../packages/studio/core/src/sfz/SfzAttachment"
import type {InstrumentPresetMeta, PresetMeta} from "../packages/studio/core/src/presets/PresetMeta"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const defaultSelection = join(scriptDir, "sfz-preset-selection.json")

const usage = `Usage:
  npx tsx scripts/bake-sfz-presets.ts --root <factory-root> [options]

Options:
  --root <path>       Factory root containing sfz/ and presets/ (required)
  --selection <file>  JSON array of instrument names to bake (default: scripts/sfz-preset-selection.json)
  --all               Bake every catalog instrument instead of the selection
  --dry-run           Bake in memory and report without writing files
  --help              Show this help
`

// The numeric surface of SfzParsedRegion (packages/studio/core/src/sfz/SfzParser.ts) as written by the
// importer into factory/sfz/<instrument-uuid>/regions.json; "sample" is the sample-store UUID.
type ManifestRegion = {
    sample: string, fileName: string, durationInSeconds: number,
    keyLo: number, keyHi: number, rootKey: number, velLo: number, velHi: number,
    loopMode: number, loopStart: number, loopEnd: number,
    attack: number, decay: number, sustain: number, release: number,
    volume: number, pan: number, tune: number
}
type RegionManifest = {version: number, regions: ReadonlyArray<ManifestRegion>}
type CatalogEntry = {uuid: string, name: string, definition: string}
type CatalogFolder = {name: string, folders?: ReadonlyArray<CatalogFolder>, instruments?: ReadonlyArray<CatalogEntry>}
type SfzCatalog = {version: number, folders: ReadonlyArray<CatalogFolder>}
type CatalogInstrument = CatalogEntry & {folder: string}

type Args = {root: Optional<string>, selection: Optional<string>, all: boolean, dryRun: boolean, help: boolean}

const parseArgs = (argv: ReadonlyArray<string>): Args => {
    const args: Args = {root: undefined, selection: undefined, all: false, dryRun: false, help: false}
    for (let index = 2; index < argv.length; index++) {
        const token = argv[index]
        if (token === "--all") {args.all = true; continue}
        if (token === "--dry-run") {args.dryRun = true; continue}
        if (token === "--help") {args.help = true; continue}
        if (token !== "--root" && token !== "--selection") {throw new Error(usage)}
        const value = argv[++index]
        if (!isDefined(value) || value.startsWith("--")) {throw new Error(`Missing value for ${token}`)}
        if (token === "--root") {args.root = value} else {args.selection = value}
    }
    if (!isDefined(args.root) && !args.help) {throw new Error(usage)}
    return args
}

const readJson = <T>(path: string): Option<T> =>
    existsSync(path) ? Option.tryCatch(() => JSON.parse(readFileSync(path, "utf8")) as T) : Option.None

const writeJson = (path: string, value: unknown): void => {
    const temporary = `${path}.tmp`
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
    renameSync(temporary, path)
}

const flattenInstruments = (catalog: SfzCatalog): ReadonlyArray<CatalogInstrument> => {
    const instruments: Array<CatalogInstrument> = []
    const collect = (folder: CatalogFolder): void => {
        folder.instruments?.forEach(entry => instruments.push({...entry, folder: folder.name}))
        folder.folders?.forEach(collect)
    }
    catalog.folders.forEach(collect)
    return instruments
}

// The catalog nests one level deep (library -> instruments), so the library name alone would drop all 177
// VCSL presets into a single group and change nothing for the user. The definition path carries the real
// family — "Idiophones/Struck Idiophones/Cabasa.sfz" — so its first segment yields a browsable
// "VCSL / Idiophones". Instruments sitting at a library's root keep the bare library name.
const groupOf = (entry: CatalogInstrument): string => {
    const [family] = entry.definition.split("/")
    return isDefined(family) && family !== entry.definition ? `${entry.folder} / ${family}` : entry.folder
}

const resolveSelection = (instruments: ReadonlyArray<CatalogInstrument>, names: ReadonlyArray<string>) => {
    const matched: Array<CatalogInstrument> = []
    const missing: Array<string> = []
    for (const name of names) {
        const hits = instruments.filter(entry => entry.name === name)
        if (hits.length === 0) {missing.push(name); continue}
        matched.push(...hits)
    }
    return {matched, missing}
}

const useAudioFile = (boxGraph: BoxGraph, files: Map<string, AudioFileBox>, region: ManifestRegion): AudioFileBox => {
    const existing = files.get(region.sample)
    if (isDefined(existing)) {return existing}
    const file = AudioFileBox.create(boxGraph, UUID.parse(region.sample), box => {
        box.startInSeconds.setValue(0)
        box.endInSeconds.setValue(region.durationInSeconds)
        box.fileName.setValue(region.fileName)
    })
    files.set(region.sample, file)
    return file
}

const bakePreset = (name: string, regions: ReadonlyArray<ManifestRegion>): ArrayBufferLike => {
    const skeleton = ProjectSkeleton.empty({createDefaultUser: false, createOutputMaximizer: false})
    const {boxGraph} = skeleton
    boxGraph.beginTransaction()
    const capture = CaptureMidiBox.create(boxGraph, UUID.generate())
    const unit = AudioUnitFactory.create(skeleton, AudioUnitType.Instrument, Option.wrap(capture), 1)
    const files = new Map<string, AudioFileBox>()
    const attachment = withExtendedKeyRange(regions.map(region =>
        toSfzAttachment({defaultPath: "", ...region}, useAudioFile(boxGraph, files, region))))
    InstrumentFactories.Sfz.create(boxGraph, unit.input, name, IconSymbol.Sfz, attachment)
    boxGraph.endTransaction()
    return PresetEncoder.encode(unit, {includeTimeline: false})
}

// Derived, not random, so re-baking is idempotent; shaped like the importer's contentUuid helper.
const presetUuidFor = (instrumentUuid: string): UUID.String => {
    const hash = createHash("sha256")
    hash.update(instrumentUuid)
    const bytes = hash.digest().subarray(0, 16)
    bytes[6] = (bytes[6] & 15) | 64
    bytes[8] = (bytes[8] & 63) | 128
    const hex = bytes.toString("hex")
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const main = (): void => {
    const args = parseArgs(process.argv)
    if (args.help) {process.stdout.write(usage); return}
    const root = resolve(args.root ?? "")
    const catalogPath = join(root, "sfz", "index.json")
    const catalog = readJson<SfzCatalog>(catalogPath)
    if (catalog.isEmpty()) {throw new Error(`Cannot read catalog: ${catalogPath}`)}
    const instruments = flattenInstruments(catalog.unwrap())
    const {matched, missing} = args.all
        ? {matched: instruments, missing: [] as ReadonlyArray<string>}
        : (() => {
            const selectionPath = resolve(args.selection ?? defaultSelection)
            const names = readJson<ReadonlyArray<string>>(selectionPath)
            if (names.isEmpty()) {throw new Error(`Cannot read selection: ${selectionPath}`)}
            return resolveSelection(instruments, names.unwrap())
        })()
    missing.forEach(name => console.error(`unmatched  ${name} — no such instrument in the catalog`))
    if (matched.length === 0) {console.log("Nothing to bake."); return}
    const nameCounts = new Map<string, number>()
    matched.forEach(entry => nameCounts.set(entry.name, (nameCounts.get(entry.name) ?? 0) + 1))
    const presetsDir = join(root, "presets")
    const indexPath = join(presetsDir, "index.json")
    const indexEntries: Array<PresetMeta> = [...(readJson<ReadonlyArray<PresetMeta>>(indexPath).unwrapOrElse(() => []))]
    const now = Date.now()
    let baked = 0, failed = 0
    const seen = new Set<string>()
    for (const entry of matched) {
        if (seen.has(entry.uuid)) {continue}
        seen.add(entry.uuid)
        const manifest = readJson<RegionManifest>(join(root, "sfz", entry.uuid, "regions.json"))
        if (manifest.isEmpty()) {console.error(`missing    ${entry.folder}/${entry.name} — no regions.json`); failed++; continue}
        const {regions} = manifest.unwrap()
        if (regions.length === 0) {console.error(`empty      ${entry.folder}/${entry.name} — no regions`); failed++; continue}
        const count = nameCounts.get(entry.name) ?? 0
        const presetName = count > 1 ? `${entry.name} (${entry.folder})` : entry.name
        const encoded = tryCatch(() => bakePreset(presetName, regions))
        if (encoded.status === "failure") {console.error(`failed     ${entry.folder}/${entry.name}: ${String(encoded.error)}`); failed++; continue}
        const uuid = presetUuidFor(entry.uuid)
        const meta: InstrumentPresetMeta = {
            category: "instrument",
            device: "Sfz",
            uuid,
            name: presetName,
            description: `Baked from the ${entry.folder} SFZ catalog; samples load on first playback.`,
            created: now,
            modified: now,
            group: groupOf(entry)
        }
        console.log(`baked      ${presetName} regions=${regions.length} bytes=${encoded.value.byteLength}`)
        if (!args.dryRun) {
            mkdirSync(presetsDir, {recursive: true})
            writeFileSync(join(presetsDir, `${uuid}.odp`), Buffer.from(encoded.value))
        }
        const position = indexEntries.findIndex(candidate => candidate.uuid === uuid)
        if (position === -1) {indexEntries.push(meta)} else {indexEntries[position] = {...meta, created: indexEntries[position].created}}
        baked++
    }
    if (!args.dryRun && baked > 0) {writeJson(indexPath, indexEntries)}
    console.log(`${args.dryRun ? "Dry run" : "Bake"} complete: baked=${baked}, failed=${failed}, catalog=${instruments.length}`)
    if (failed > 0) {process.exitCode = 1}
}

main()