import {describe, expect, it} from "vitest"
import {limitSfzRegions, MAX_SFZ_REGIONS} from "./SfzAttachment"

type Region = {id: number, keyLo: number, keyHi: number, velLo: number, velHi: number}

const regions = (length: number): ReadonlyArray<Region> => Array.from({length}, (_, id) => ({
    id,
    keyLo: id % 128,
    keyHi: id % 128,
    velLo: Math.floor(id / 128) * 32,
    velHi: Math.min(127, Math.floor(id / 128) * 32 + 31)
}))

describe("limitSfzRegions", () => {
    it("returns small region lists untouched", () => {
        const input = regions(20)
        expect(limitSfzRegions(input, 100)).toBe(input)
    })

    it("never exceeds the hard maximum", () => {
        expect(limitSfzRegions(regions(429), 1_000)).toHaveLength(MAX_SFZ_REGIONS)
    })

    it("honours lower configured limits", () => {
        expect(limitSfzRegions(regions(429), 50)).toHaveLength(50)
    })

    it("samples the full pitch range instead of taking the first entries", () => {
        const selected = limitSfzRegions(regions(429), 100)
        expect(Math.min(...selected.map(region => region.keyLo))).toBe(0)
        expect(Math.max(...selected.map(region => region.keyHi))).toBe(127)
    })

    it("keeps at least one region for every pitch mapping when the limit permits", () => {
        const input = Array.from({length: 320}, (_, id) => ({
            id,
            keyLo: id % 80,
            keyHi: id % 80,
            velLo: Math.floor(id / 80) * 32,
            velHi: Math.floor(id / 80) * 32 + 31
        }))
        const selected = limitSfzRegions(input, 100)
        expect(new Set(selected.map(region => region.keyLo)).size).toBe(80)
    })

    it("leaves no silent gaps when pruning drops whole pitch groups", () => {
        // 128 distinct keys, limit 100 forces evenlySpaced(groups, 100) to drop ~28 keys entirely --
        // exactly the case the region-count/outer-bound tests above don't exercise.
        const selected = limitSfzRegions(regions(429), 100)
        const covered = new Array(128).fill(false)
        selected.forEach(region => {
            for (let key = region.keyLo; key <= region.keyHi; key++) {covered[key] = true}
        })
        expect(covered.every(Boolean)).toBe(true)
    })

    it("keeps surviving distinct key-ranges non-overlapping after gap-closing", () => {
        const selected = limitSfzRegions(regions(429), 100)
        const distinctRanges = Array.from(new Set(selected.map(region => `${region.keyLo}:${region.keyHi}`)))
            .map(pair => {
                const [keyLo, keyHi] = pair.split(":").map(Number)
                return {keyLo, keyHi}
            })
            .sort((a, b) => a.keyLo - b.keyLo)
        for (let i = 0; i < distinctRanges.length - 1; i++) {
            expect(distinctRanges[i + 1].keyLo).toBeGreaterThan(distinctRanges[i].keyHi)
        }
    })

    it("is deterministic", () => {
        const input = regions(429)
        expect(limitSfzRegions(input, 75).map(region => region.id))
            .toEqual(limitSfzRegions(input, 75).map(region => region.id))
    })
})
