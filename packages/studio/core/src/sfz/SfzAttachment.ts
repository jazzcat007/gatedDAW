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
