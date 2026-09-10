import {describe, it, expect} from "vitest"
import {InstrumentFactories} from "@opendaw/studio-adapters"
import {KEY_RANGE_EXTENSION, withExtendedKeyRange} from "./SfzAttachment"

type Region = InstrumentFactories.SfzRegionAttachment[number]

// Only the fields the widening reads; `file` is never touched, so a cast keeps the fixtures readable.
const region = (keyLo: number, keyHi: number, rootKey = keyLo, velLo = 0, velHi = 127): Region =>
    ({
        file: null, keyLo, keyHi, rootKey, velLo, velHi, loopMode: 0, loopStart: 0, loopEnd: 0,
        attack: 0.001, decay: 0.001, sustain: 1, release: 0.05, volume: 0, pan: 0, tune: 0
    } as unknown as Region)

describe("withExtendedKeyRange", () => {
    it("widens a single narrow region outward in both directions", () => {
        const [only] = withExtendedKeyRange([region(60, 62)])
        expect(only.keyLo).toBe(60 - KEY_RANGE_EXTENSION)
        expect(only.keyHi).toBe(62 + KEY_RANGE_EXTENSION)
    })

    it("leaves rootKey untouched so extended keys stay in tune", () => {
        const [only] = withExtendedKeyRange([region(60, 62, 61)])
        expect(only.rootKey).toBe(61)
    })

    it("does not disturb the interior mapping of a multi-region instrument", () => {
        const extended = withExtendedKeyRange([region(48, 51), region(52, 55), region(56, 59)])
        expect(extended.map(({keyLo, keyHi}) => [keyLo, keyHi])).toEqual([
            [48 - KEY_RANGE_EXTENSION, 51], [52, 55], [56, 59 + KEY_RANGE_EXTENSION]
        ])
    })

    it("extends every velocity layer sharing an outer key, not just the first", () => {
        const extended = withExtendedKeyRange([region(60, 60, 60, 0, 63), region(60, 60, 60, 64, 127)])
        expect(extended.every(({keyLo, keyHi}) =>
            keyLo === 60 - KEY_RANGE_EXTENSION && keyHi === 60 + KEY_RANGE_EXTENSION)).toBe(true)
        expect(extended.map(({velLo, velHi}) => [velLo, velHi])).toEqual([[0, 63], [64, 127]])
    })

    it("clamps to the MIDI range instead of going out of bounds", () => {
        const extended = withExtendedKeyRange([region(4, 4), region(125, 125)])
        expect(extended[0].keyLo).toBe(0)
        expect(extended[1].keyHi).toBe(127)
    })

    it("is a no-op for an instrument already spanning the whole keyboard", () => {
        const extended = withExtendedKeyRange([region(0, 127)])
        expect(extended[0]).toMatchObject({keyLo: 0, keyHi: 127})
    })

    it("returns the input untouched for an empty attachment or a zero width", () => {
        expect(withExtendedKeyRange([])).toEqual([])
        const single = [region(60, 62)]
        expect(withExtendedKeyRange(single, 0)).toBe(single)
    })
})
