import {afterAll, beforeAll, describe, expect, it} from "vitest"
import {mkdtempSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {isDefined} from "@opendaw/lib-std"
import {SfzParser} from "./SfzParser"
// @ts-expect-error — the offline parser is deliberately plain JS with no declarations; it stays build-free.
import {parseSfz, toRegion} from "../../../../../scripts/lib/sfz-parse.mjs"

// The offline importer (plain JS, no build step) and SfzParser (TS, in-browser) carry independent copies of
// the same tokenizer and opcode derivation. PR #11 had to fix the identical bug in both. This pins them
// together: any divergence in what they read out of a `.sfz` fails here instead of silently shipping.
type RawRegion = Record<string, string>

const readViaImporter = parseSfz as (file: string) => {regions: ReadonlyArray<RawRegion>}
const deriveViaImporter = toRegion as (raw: RawRegion) => Record<string, number>

let directory: string

beforeAll(() => {directory = mkdtempSync(join(tmpdir(), "sfz-parity-"))})

afterAll(() => rmSync(directory, {recursive: true, force: true}))

const both = (source: string) => {
    const file = join(directory, `${Math.random().toString(36).slice(2)}.sfz`)
    writeFileSync(file, source)
    return {
        // Both sides drop regions with no playable `sample=`; the importer leaves that to its caller.
        importerRegions: readViaImporter(file).regions
            .filter(region => isDefined(region.sample) && region.sample.length > 0)
            .map(region => ({
                sample: region.sample,
                defaultPath: region.default_path ?? "",
                ...deriveViaImporter(region)
            })),
        parserRegions: SfzParser.parse(source).regions.map(region => ({...region}))
    }
}

const expectParity = (source: string) => {
    const {importerRegions, parserRegions} = both(source)
    expect(importerRegions.length).toBe(parserRegions.length)
    expect(importerRegions).toEqual(parserRegions)
}

describe("importer / SfzParser parity", () => {
    it("agrees on an unquoted sample path containing spaces (the PR #11 regression)", () => {
        expectParity("<region> sample=Concert Harp/KSHarp_E1_f1.wav pitch_keycenter=28 lokey=28 hikey=29")
    })

    it("agrees on a quoted sample path", () => {
        expectParity(`<region> sample="Concert Harp/KSHarp E1.wav" lokey=30 hikey=31`)
    })

    it("agrees on default_path inheritance from <control>", () => {
        expectParity(`
            <control> default_path=Samples/Mallets/
            <region> sample=hit.wav lokey=60 hikey=60
            <region> sample=roll.wav lokey=61 hikey=61
        `)
    })

    it("agrees on global / master / group inheritance and its resets", () => {
        expectParity(`
            <global> volume=-3 ampeg_release=0.4
            <master> pan=25
            <group> lovel=1 hivel=63
            <region> sample=soft.wav key=48
            <region> sample=soft2.wav key=49 hivel=100
            <group> lovel=64 hivel=127
            <region> sample=loud.wav key=48
            <global> volume=0
            <region> sample=reset.wav key=50
        `)
    })

    it("agrees on the key= shorthand filling lokey/hikey/pitch_keycenter", () => {
        expectParity("<region> sample=one.wav key=64")
    })

    it("agrees on ampeg_sustain percentage-to-unit conversion and clamping", () => {
        expectParity(`
            <region> sample=a.wav ampeg_sustain=50
            <region> sample=b.wav ampeg_sustain=0
            <region> sample=c.wav ampeg_sustain=180
            <region> sample=d.wav ampeg_sustain=-20
        `)
    })

    it("agrees on tune plus transpose in cents, with clamping", () => {
        expectParity(`
            <region> sample=a.wav tune=-40 transpose=2
            <region> sample=b.wav transpose=24
            <region> sample=c.wav tune=50
        `)
    })

    it("agrees on pan scaling and clamping", () => {
        expectParity(`
            <region> sample=a.wav pan=-100
            <region> sample=b.wav pan=100
            <region> sample=c.wav pan=250
        `)
    })

    it("agrees that gain wins over volume", () => {
        expectParity(`
            <region> sample=a.wav volume=-6 gain=-2
            <region> sample=b.wav volume=-6
        `)
    })

    it("agrees on loop_mode and loop points", () => {
        expectParity(`
            <region> sample=a.wav loop_mode=loop_continuous loop_start=100 loop_end=20000
            <region> sample=b.wav loop_mode=no_loop
        `)
    })

    it("agrees when comments interleave with opcodes", () => {
        expectParity(`
            // leading comment
            <region> sample=a.wav key=60 // trailing comment
            /* block
               comment */
            <region> sample=b.wav key=61
        `)
    })

    it("agrees on CRLF line endings", () => {
        expectParity("<region> sample=a.wav key=60\r\n<region> sample=b.wav key=61\r\n")
    })

    it("agrees on a final opcode with no trailing newline", () => {
        expectParity("<region> sample=Some Folder/last.wav key=72")
    })

    it("agrees on a region carrying no sample opcode", () => {
        expectParity(`
            <region> key=60
            <region> sample=a.wav key=61
        `)
    })

    it("agrees that an explicitly empty sample opcode is not playable", () => {
        const {importerRegions, parserRegions} = both(`
            <region> sample="" key=60
            <region> sample=a.wav key=61
        `)
        expect(parserRegions).toHaveLength(1)
        expect(importerRegions).toEqual(parserRegions)
    })

    // A bare `sample=` swallows the following token as its value in both parsers. That is arguably wrong,
    // but it is wrong identically, which is what this suite exists to guarantee.
    it("agrees on a valueless sample opcode consuming the next token", () => {
        expectParity(`
            <region> sample= key=60
            <region> sample=a.wav key=61
        `)
    })
})
