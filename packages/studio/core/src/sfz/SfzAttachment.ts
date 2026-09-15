import {AudioFileBox} from "@opendaw/studio-boxes"
import {InstrumentFactories} from "@opendaw/studio-adapters"
import {SfzParsedRegion} from "./SfzParser"

export const MAX_SFZ_REGIONS = InstrumentFactories.MaxSfzRegions

type SfzRegionRange = Pick<SfzParsedRegion, "keyLo" | "keyHi" | "velLo" | "velHi">

// Keeps a representative cross-section instead of truncating the file, which would commonly retain only the
// bass notes. One middle-velocity region is retained for every authored pitch mapping whenever the budget permits;
// remaining slots are spread across its other velocity layers. Original order is preserved for SFZ precedence.
export const limitSfzRegions = <T extends SfzRegionRange>(regions: ReadonlyArray<T>, requestedLimit: number): ReadonlyArray<T> => {
    const limit = Math.max(1, Math.min(MAX_SFZ_REGIONS, Math.floor(requestedLimit)))
    if (regions.length <= limit) {return regions}
    const sorted = regions.map((region, index) => ({region, index})).sort((a, b) => {
        // Lexicographic by (keyLo, keyHi), not by their sum: a sum-based order can interleave two distinct
        // ranges that happen to add up the same (e.g. 0-30 and 10-20), which would break the assumption
        // below that every run of identical (keyLo, keyHi) entries in `sorted` is contiguous.
        const keyOrder = a.region.keyLo - b.region.keyLo || a.region.keyHi - b.region.keyHi
        if (keyOrder !== 0) {return keyOrder}
        const velocityOrder = a.region.velLo + a.region.velHi - b.region.velLo - b.region.velHi
        return velocityOrder !== 0 ? velocityOrder : a.index - b.index
    })
    const evenlySpaced = <U>(values: ReadonlyArray<U>, count: number): ReadonlyArray<U> => {
        if (count <= 0) {return []}
        if (count === 1) {return [values[Math.floor(values.length / 2)]]}
        return Array.from({length: count}, (_, index) =>
            values[Math.round(index * (values.length - 1) / (count - 1))])
    }
    const pitchGroups = new Map<string, Array<typeof sorted[number]>>()
    sorted.forEach(entry => {
        const pitchRange = `${entry.region.keyLo}:${entry.region.keyHi}`
        const group = pitchGroups.get(pitchRange)
        if (group === undefined) {pitchGroups.set(pitchRange, [entry])}
        else {group.push(entry)}
    })
    const groups = Array.from(pitchGroups.values())
    const selected = new Set<number>()
    const representative = (group: ReadonlyArray<typeof sorted[number]>) => group.reduce((closest, entry) =>
        Math.abs(entry.region.velLo + entry.region.velHi - 127)
        < Math.abs(closest.region.velLo + closest.region.velHi - 127) ? entry : closest)
    const representativeGroups = groups.length <= limit ? groups : evenlySpaced(groups, limit)
    representativeGroups.forEach(group => selected.add(representative(group).index))
    const remaining = sorted.filter(entry => !selected.has(entry.index))
    evenlySpaced(remaining, limit - selected.size).forEach(entry => selected.add(entry.index))
    // Dropping whole pitch groups (evenlySpaced(groups, ...) above) leaves the keys those groups used to
    // cover with no region at all -- audibly silent/missing notes, not just fewer velocity layers. Close
    // those holes by widening each surviving distinct key-range to the midpoint of the gap to its nearest
    // surviving neighbor, so the retained regions tile the original span with no gaps (and no overlaps).
    // Velocity-layer siblings of the same key-range move together since they share identical bounds.
    // Keyed by original region index (not by keyLo/keyHi value) so two unrelated groups whose boundaries
    // happen to share a numeric key value can never be confused with one another.
    const override = new Map<number, {keyLo: number, keyHi: number}>()
    const distinctKeyGroups: Array<{keyLo: number, keyHi: number, indices: number[]}> = []
    sorted.forEach(entry => {
        if (!selected.has(entry.index)) {return}
        const last = distinctKeyGroups[distinctKeyGroups.length - 1]
        if (last !== undefined && last.keyLo === entry.region.keyLo && last.keyHi === entry.region.keyHi) {
            last.indices.push(entry.index)
        } else {
            distinctKeyGroups.push({keyLo: entry.region.keyLo, keyHi: entry.region.keyHi, indices: [entry.index]})
        }
    })
    const setKeyHi = (group: typeof distinctKeyGroups[number], keyHi: number) =>
        group.indices.forEach(index => override.set(index, {keyLo: override.get(index)?.keyLo ?? group.keyLo, keyHi}))
    const setKeyLo = (group: typeof distinctKeyGroups[number], keyLo: number) =>
        group.indices.forEach(index => override.set(index, {keyLo, keyHi: override.get(index)?.keyHi ?? group.keyHi}))
    for (let i = 0; i < distinctKeyGroups.length - 1; i++) {
        const current = distinctKeyGroups[i]
        const next = distinctKeyGroups[i + 1]
        if (next.keyLo <= current.keyHi) {continue}
        const midpoint = Math.floor((current.keyHi + next.keyLo) / 2)
        setKeyHi(current, midpoint)
        setKeyLo(next, midpoint + 1)
    }
    const result: T[] = []
    regions.forEach((region, index) => {
        if (!selected.has(index)) {return}
        const change = override.get(index)
        result.push(change === undefined ? region : {...region, keyLo: change.keyLo, keyHi: change.keyHi})
    })
    return result
}

// Shared by the local file-picker import (SfzImportTrigger) and the factory-catalog import (SfzSelection) —
// both end up with a resolved AudioFileBox per region and need the same box-attachment shape.
export const toSfzAttachment = (region: SfzParsedRegion, file: AudioFileBox): InstrumentFactories.SfzRegionAttachment[number] => ({
    file,
    keyLo: Math.round(region.keyLo),
    keyHi: Math.round(region.keyHi),
    rootKey: Math.round(region.rootKey),
    velLo: Math.round(region.velLo),
    velHi: Math.round(region.velHi),
    loopMode: region.loopMode,
    loopStart: Math.round(region.loopStart),
    loopEnd: Math.round(region.loopEnd),
    attack: region.attack,
    decay: region.decay,
    sustain: region.sustain,
    release: region.release,
    volume: region.volume,
    pan: region.pan,
    tune: region.tune
})

// How far past an instrument's authored range playing still sounds like the instrument. An octave of
// pitch-shifting on a sampled note is the usual limit before formants smear badly, and most catalog
// entries map far less than that (VCSL's toy train whistle covers a handful of keys), so without this
// most of the keyboard is silent with nothing on screen to explain why.
export const KEY_RANGE_EXTENSION = 12

// Widens only the outermost regions, and only outward: an instrument's interior mapping is deliberate and
// must not be disturbed, but its edges are where the author simply stopped sampling. Every region sharing
// the outer key keeps its own velocity layer, so a velocity-split edge stays intact. `rootKey` is left
// alone on purpose — the engine pitch-shifts relative to the true root, so extended keys stay in tune.
export const withExtendedKeyRange = (attachment: InstrumentFactories.SfzRegionAttachment,
                                     semitones: number = KEY_RANGE_EXTENSION)
    : InstrumentFactories.SfzRegionAttachment => {
    if (attachment.length === 0 || semitones <= 0) {return attachment}
    const lowest = attachment.reduce((min, region) => Math.min(min, region.keyLo), 127)
    const highest = attachment.reduce((max, region) => Math.max(max, region.keyHi), 0)
    return attachment.map(region => ({
        ...region,
        keyLo: region.keyLo === lowest ? Math.max(0, lowest - semitones) : region.keyLo,
        keyHi: region.keyHi === highest ? Math.min(127, highest + semitones) : region.keyHi
    }))
}
