import {afterAll, beforeAll, describe, expect, it} from "vitest"
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
// @ts-expect-error — the offline parser is deliberately plain JS with no declarations; it stays build-free.
import {parseSfz} from "../../../../../scripts/lib/sfz-parse.mjs"

type ParseResult = {regions: ReadonlyArray<Record<string, string>>, includedFiles: ReadonlyArray<string>}
const read = parseSfz as (file: string) => ParseResult

let directory: string

beforeAll(() => {directory = mkdtempSync(join(tmpdir(), "sfz-include-"))})
afterAll(() => rmSync(directory, {recursive: true, force: true}))

// Real regression: Karoryfer's Caveman Cosmonaut nests `#include "mappings/x.sfz"` inside a file that is
// already inside `mappings/`, meaning the string is written relative to the *original* top-level file's
// folder, not to itself. Resolving strictly relative to the including file doubles the segment
// (`mappings/mappings/x.sfz`) and throws — which used to crash the entire importer run for the whole
// library, not just this one instrument.
describe("parseSfz #include resolution", () => {
    it("resolves a single-level #include relative to the including file (unaffected by the fallback)", () => {
        mkdirSync(join(directory, "single"), {recursive: true})
        writeFileSync(join(directory, "single", "fragment.sfz"), "<region> sample=a.wav key=60")
        writeFileSync(join(directory, "single", "top.sfz"), '#include "fragment.sfz"')
        const {regions} = read(join(directory, "single", "top.sfz"))
        expect(regions).toHaveLength(1)
        expect(regions[0].sample).toBe("a.wav")
    })

    it("falls back to root-relative resolution when a nested #include doubles its own folder", () => {
        const root = join(directory, "nested")
        mkdirSync(join(root, "mappings"), {recursive: true})
        // mono_first_map.sfz lives inside mappings/ and includes "mappings/leaf.sfz" — a path written as if
        // relative to root/, not to mappings/ itself (exactly Caveman Cosmonaut's real structure).
        writeFileSync(join(root, "mappings", "leaf.sfz"), "<region> sample=leaf.wav key=40")
        writeFileSync(join(root, "mappings", "mono_first_map.sfz"), '#include "mappings/leaf.sfz"')
        writeFileSync(join(root, "top.sfz"), '#include "mappings/mono_first_map.sfz"')
        const {regions, includedFiles} = read(join(root, "top.sfz"))
        expect(regions).toHaveLength(1)
        expect(regions[0].sample).toBe("leaf.wav")
        expect(includedFiles.some(file => file.endsWith("leaf.sfz"))).toBe(true)
    })

    it("throws (rather than silently producing nothing) when neither resolution finds the file", () => {
        const root = join(directory, "genuinely-missing")
        mkdirSync(root, {recursive: true})
        writeFileSync(join(root, "top.sfz"), '#include "does/not/exist.sfz"')
        expect(() => read(join(root, "top.sfz"))).toThrow()
    })

    it("still detects a genuine circular #include", () => {
        const root = join(directory, "circular")
        mkdirSync(root, {recursive: true})
        writeFileSync(join(root, "a.sfz"), '#include "b.sfz"')
        writeFileSync(join(root, "b.sfz"), '#include "a.sfz"')
        expect(() => read(join(root, "a.sfz"))).toThrow(/Circular #include/)
    })

    it("reports every file pulled in via #include, direct and nested", () => {
        const root = join(directory, "included-files")
        mkdirSync(root, {recursive: true})
        writeFileSync(join(root, "curves.sfz"), "<curve>curve_index=1\nv000=0")
        writeFileSync(join(root, "mid.sfz"), '#include "curves.sfz"\n<region> sample=b.wav key=61')
        writeFileSync(join(root, "top.sfz"), '#include "mid.sfz"')
        const {includedFiles} = read(join(root, "top.sfz"))
        expect(includedFiles.some(file => file.endsWith("mid.sfz"))).toBe(true)
        expect(includedFiles.some(file => file.endsWith("curves.sfz"))).toBe(true)
    })
})
