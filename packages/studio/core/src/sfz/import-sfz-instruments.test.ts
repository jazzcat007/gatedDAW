import {afterAll, beforeAll, describe, expect, it} from "vitest"
import {spawnSync} from "node:child_process"
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"

// Exercises the real CLI end-to-end (spawn, not import) so it stays honest about what a host actually
// sees: stdout lines, exit codes, and the catalog/regions.json files written to disk. These fixtures
// reproduce the exact structural bugs found importing real non-orchestral CC0 packs (Karoryfer's Black and
// Green Guitars, Gogodze Phu Vol II, Caveman Cosmonaut, Shinyguitar) — every one of these previously
// dropped an entire instrument, or an entire library, over one bad reference.
const scriptPath = join(__dirname, "../../../../../scripts/import-sfz-instruments.mjs")

const buildWav = (): Buffer => {
    const fmt = Buffer.alloc(16)
    fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(1, 2); fmt.writeUInt32LE(44100, 4)
    fmt.writeUInt32LE(44100 * 2, 8); fmt.writeUInt16LE(2, 12); fmt.writeUInt16LE(16, 14)
    const data = Buffer.alloc(4)
    const size = 4 + (8 + fmt.length) + (8 + data.length)
    const wav = Buffer.alloc(8 + size)
    wav.write("RIFF", 0); wav.writeUInt32LE(size, 4); wav.write("WAVE", 8)
    wav.write("fmt ", 12); wav.writeUInt32LE(fmt.length, 16); fmt.copy(wav, 20)
    wav.write("data", 36); wav.writeUInt32LE(data.length, 40); data.copy(wav, 44)
    return wav
}

let libraryRoot: string
let factoryRoot: string

// The "invalid"/"partial" diagnostic lines go through console.error (stderr); "import"/"Dry run complete"
// go through console.log (stdout). Combine both so a single assertion can match either kind of line.
const run = (dryRun = true) => {
    const args = [scriptPath, libraryRoot, "--root", factoryRoot, "--library", "Fixture", "--license", "CC0-1.0"]
    if (dryRun) {args.push("--dry-run")}
    const result = spawnSync("node", args, {encoding: "utf8"})
    return {stdout: `${result.stdout}${result.stderr}`, code: result.status}
}

beforeAll(() => {
    const base = mkdtempSync(join(tmpdir(), "sfz-importer-"))
    libraryRoot = join(base, "library")
    factoryRoot = join(base, "factory")
    mkdirSync(join(libraryRoot, "Programs", "modules"), {recursive: true})
    mkdirSync(join(libraryRoot, "Samples"), {recursive: true})

    // A pure #include fragment — real regions, but only meaningful spliced into a parent's <global> scope.
    // Walked on its own it has no sample opcode at all here (mirrors curves.sfz-style control-only fragments).
    writeFileSync(join(libraryRoot, "Programs", "modules", "shared_curve.sfz"), "<curve>curve_index=1\nv000=0")

    // A real top-level instrument: one good region, one *sine generator (not a file), one region pointing at
    // a genuinely missing sample, one region pointing at a corrupt (non-WAVE) sample, and it #includes the
    // fragment above. Every prior importer version invalidated this whole file over any one of these.
    writeFileSync(join(libraryRoot, "Samples", "good.wav"), buildWav())
    writeFileSync(join(libraryRoot, "Samples", "corrupt.wav"), Buffer.from("not a wave file at all"))
    writeFileSync(join(libraryRoot, "Programs", "instrument.sfz"), [
        '#include "modules/shared_curve.sfz"',
        "<region> sample=../Samples/good.wav key=60",
        "<region> sample=*sine key=61",
        "<region> sample=../Samples/does_not_exist.wav key=62",
        "<region> sample=../Samples/corrupt.wav key=63"
    ].join("\n"))

    // A Sforzando-authored bank: default_path=$sample_dir/ resolves to nothing literally, but the
    // convention (and this fixture) puts real samples in a sibling Samples/ folder.
    writeFileSync(join(libraryRoot, "Programs", "bank.sfz"), [
        "<control> default_path=$sample_dir/",
        "<region> sample=good.wav key=64"
    ].join("\n"))

    // Nested #include written relative to the original top file's folder, not to the including file's own
    // folder — the exact shape that crashed Caveman Cosmonaut's entire import.
    mkdirSync(join(libraryRoot, "Programs", "mappings"), {recursive: true})
    // Regions resolve relative to the top-level walked file's own folder (Programs/), not the nested
    // file's folder, matching how the importer has always resolved #include-flattened regions.
    writeFileSync(join(libraryRoot, "Programs", "mappings", "leaf.sfz"), "<region> sample=../Samples/good.wav key=65")
    writeFileSync(join(libraryRoot, "Programs", "mappings", "mid.sfz"), '#include "mappings/leaf.sfz"')
    writeFileSync(join(libraryRoot, "Programs", "chained.sfz"), '#include "mappings/mid.sfz"')
})

afterAll(() => rmSync(join(libraryRoot, ".."), {recursive: true, force: true}))

describe("import-sfz-instruments.mjs (real CLI, real bugs reproduced)", () => {
    it("imports the real instrument, dropping only the generator/missing/corrupt regions", () => {
        const {stdout} = run()
        // 4 regions total, but the *sine generator is excluded from "playable" before drop-counting even
        // starts (it was never a file reference to begin with) — so this reports 2 of the 3 playable
        // regions dropped (missing + corrupt), 1 survives (good.wav).
        expect(stdout).toMatch(/partial\s+Programs\/instrument\.sfz dropped 2\/3 region\(s\)/)
        expect(stdout).toMatch(/import\s+Fixture\/instrument regions=1 samples=1/)
    })

    it("never reports the #include-only fragment as its own failed instrument", () => {
        const {stdout} = run()
        expect(stdout).not.toMatch(/shared_curve/)
    })

    it("resolves $sample_dir against the sibling Samples/ folder", () => {
        const {stdout} = run()
        expect(stdout).toMatch(/import\s+Fixture\/bank regions=1 samples=1/)
    })

    it("survives a nested #include resolved relative to the original top file, not the including file", () => {
        const {stdout} = run()
        expect(stdout).toMatch(/import\s+Fixture\/chained regions=1 samples=1/)
    })

    it("never crashes the whole run — exits with the documented invalid-count contract", () => {
        const {stdout, code} = run()
        // Nothing in this fixture is unrecoverably invalid, so the run succeeds outright.
        expect(stdout).toMatch(/Dry run complete: imported=3, invalid=0/)
        expect(code).toBe(0)
    })

    it("writes a real catalog and regions.json for a full (non-dry-run) pass", () => {
        run(false)
        const catalog = JSON.parse(readFileSync(join(factoryRoot, "sfz", "index.json"), "utf8"))
        const folder = catalog.folders.find((f: {name: string}) => f.name === "Fixture")
        expect(folder.instruments).toHaveLength(3)
        const instrument = folder.instruments.find((i: {name: string}) => i.name === "instrument")
        const regions = JSON.parse(readFileSync(join(factoryRoot, "sfz", instrument.uuid, "regions.json"), "utf8"))
        expect(regions.regions).toHaveLength(1)
    })
})
