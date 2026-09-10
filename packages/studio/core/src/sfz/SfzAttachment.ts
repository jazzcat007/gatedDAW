import {AudioFileBox} from "@opendaw/studio-boxes"
import {InstrumentFactories} from "@opendaw/studio-adapters"
import {SfzParsedRegion} from "./SfzParser"

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
