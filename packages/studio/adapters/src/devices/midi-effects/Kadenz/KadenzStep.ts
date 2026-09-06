import {int} from "@opendaw/lib-std"

export type KadenzStep = {
    degree: int      // 0..6, the scale degree the chord is rooted on (I..vii)
    quality: int     // 0 = Auto (the degree's own diatonic quality), else an index into QualityNames
    duration: int    // 1..16 grid units
    inversion: int   // 0..3, added to the device-wide inversion
    rest: boolean
}

export namespace KadenzStep {
    export const MaxSteps: int = 32
    export const MaxDuration: int = 16

    /// WASM CONTRACT: the order mirrors `QUALITY_INTERVALS` in crates/stock-devices/device-chord-common,
    /// so the index is the packed quality value. "Auto" spells the degree's diatonic quality instead.
    export const QualityNames: ReadonlyArray<string> = [
        "Auto", "Maj", "Min", "Dim", "Aug", "Sus2", "Sus4", "Dom7",
        "Min7", "Maj7", "Dim7", "m7b5", "Dom9", "Min9", "Maj9", "Add9"
    ]

    /// The roman numeral of a degree, cased by the quality the current scale gives it. Only used for display.
    export const DegreeNumerals: ReadonlyArray<string> = ["I", "II", "III", "IV", "V", "VI", "VII"]

    // one int32 per step: degree 0..2, quality 3..6, duration-1 7..10, inversion 11..12, rest 13
    export const pack = (step: KadenzStep): int =>
        (step.degree & 0x7)
        | ((step.quality & 0xF) << 3)
        | (((step.duration - 1) & 0xF) << 7)
        | ((step.inversion & 0x3) << 11)
        | ((step.rest ? 1 : 0) << 13)

    export const unpack = (bits: int): KadenzStep => ({
        degree: bits & 0x7,
        quality: (bits >> 3) & 0xF,
        duration: ((bits >> 7) & 0xF) + 1,
        inversion: (bits >> 11) & 0x3,
        rest: ((bits >> 13) & 1) === 1
    })

    export const Default: int = pack({degree: 0, quality: 0, duration: 4, inversion: 0, rest: false})
}
