import {describe, expect, it} from "vitest"
import {SfzParser} from "./SfzParser"

describe("SfzParser", () => {
    it("resolves <group> opcodes cascading into each <region>", () => {
        const {regions} = SfzParser.parse(`
            <group> ampeg_attack=0.1 ampeg_release=0.2
            <region> sample=kick.wav lokey=36 hikey=36
            <region> sample=snare.wav lokey=38 hikey=38 ampeg_release=0.5
        `)
        expect(regions).toHaveLength(2)
        expect(regions[0]).toMatchObject({sample: "kick.wav", keyLo: 36, keyHi: 36, attack: 0.1, release: 0.2})
        // A region's own opcode overrides the inherited group value.
        expect(regions[1]).toMatchObject({sample: "snare.wav", attack: 0.1, release: 0.5})
    })

    it("expands a bare key= into lokey, hikey and pitch_keycenter", () => {
        const {regions} = SfzParser.parse("<region> sample=c4.wav key=60")
        expect(regions[0]).toMatchObject({keyLo: 60, keyHi: 60, rootKey: 60})
    })

    it("lets an explicit pitch_keycenter override the key= shorthand", () => {
        const {regions} = SfzParser.parse("<region> sample=c4.wav key=60 pitch_keycenter=62")
        expect(regions[0]).toMatchObject({keyLo: 60, keyHi: 60, rootKey: 62})
    })

    it("prefixes sample paths are captured raw; default_path is carried per-region", () => {
        const {regions} = SfzParser.parse(`
            <group> default_path=samples/
            <region> sample=kick.wav
        `)
        expect(regions[0]).toMatchObject({sample: "kick.wav", defaultPath: "samples/"})
    })

    it("converts ampeg_sustain from a 0-100 percentage into a 0-1 unit", () => {
        const {regions} = SfzParser.parse("<region> sample=pad.wav ampeg_sustain=50")
        expect(regions[0].sustain).toBeCloseTo(0.5)
    })

    it("converts pan from -100..100 into -1..1", () => {
        const {regions} = SfzParser.parse("<region> sample=pad.wav pan=-50")
        expect(regions[0].pan).toBeCloseTo(-0.5)
    })

    it("combines tune (cents) and transpose (semitones) into total cents", () => {
        const {regions} = SfzParser.parse("<region> sample=pad.wav tune=10 transpose=1")
        expect(regions[0].tune).toBeCloseTo(110)
    })

    it("maps loop_continuous to loop mode 1, anything else to 0", () => {
        const {regions} = SfzParser.parse(`
            <region> sample=a.wav loop_mode=loop_continuous loop_start=100 loop_end=2000
            <region> sample=b.wav
        `)
        expect(regions[0]).toMatchObject({loopMode: 1, loopStart: 100, loopEnd: 2000})
        expect(regions[1]).toMatchObject({loopMode: 0})
    })

    it("collects opcodes outside the supported set without dropping the region", () => {
        const {regions, unsupportedOpcodes} = SfzParser.parse(
            "<region> sample=a.wav lorand=0 hirand=0.5 seq_length=2")
        expect(regions).toHaveLength(1)
        expect([...unsupportedOpcodes].sort()).toEqual(["hirand", "lorand", "seq_length"])
    })

    it("ignores // and /* */ comments", () => {
        const {regions} = SfzParser.parse(`
            // a leading comment
            <region> sample=a.wav /* inline */ lokey=10 // trailing
        `)
        expect(regions[0]).toMatchObject({sample: "a.wav", keyLo: 10})
    })

    it("drops a <group>/<master>/<global> with no regions", () => {
        const {regions} = SfzParser.parse("<global> volume=-3 <group> lokey=0")
        expect(regions).toHaveLength(0)
    })

    it("applies velocity range and volume/gain aliasing (gain wins when both are present)", () => {
        const {regions} = SfzParser.parse("<region> sample=a.wav lovel=64 hivel=127 volume=-6 gain=-3")
        expect(regions[0]).toMatchObject({velLo: 64, velHi: 127, volume: -3})
    })

    describe("resolveSamplePath", () => {
        const region = (sample: string, defaultPath: string = "") => {
            const {regions} = SfzParser.parse(defaultPath.length > 0
                ? `<group> default_path="${defaultPath}" <region> sample="${sample}"`
                : `<region> sample="${sample}"`)
            return regions[0]
        }

        it("joins the definition's own directory, default_path and sample", () => {
            const path = SfzParser.resolveSamplePath(
                "Chordophones/Composite Chordophones/Concert Harp.sfz", region("Concert Harp/A1.wav"))
            expect(path).toBe("Chordophones/Composite Chordophones/Concert Harp/A1.wav")
        })

        it("applies default_path relative to the definition's directory", () => {
            const path = SfzParser.resolveSamplePath(
                "Kits/Kit.sfz", region("kick.wav", "samples/"))
            expect(path).toBe("Kits/samples/kick.wav")
        })

        it("normalizes backslashes from Windows-authored SFZ files", () => {
            const path = SfzParser.resolveSamplePath(
                "Kits\\Kit.sfz", region("Samples\\kick.wav"))
            expect(path).toBe("Kits/Samples/kick.wav")
        })

        it("collapses .. segments against the definition's directory", () => {
            const path = SfzParser.resolveSamplePath(
                "Kits/Sub/Kit.sfz", region("../shared/kick.wav"))
            expect(path).toBe("Kits/shared/kick.wav")
        })

        it("handles a definition at the library root", () => {
            const path = SfzParser.resolveSamplePath("Kit.sfz", region("kick.wav"))
            expect(path).toBe("kick.wav")
        })
    })
})
