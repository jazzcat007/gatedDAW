import {KadenzStep} from "./KadenzStep"

export type KadenzPreset = {
    readonly name: string
    readonly steps: ReadonlyArray<KadenzStep>
}

const Auto = 0
const Dom7 = 7
const Min7 = 8
const Maj7 = 9

/// One chord lasting four grid units — a bar at the default quarter-note rate.
const bar = (degree: number, quality: number = Auto): KadenzStep =>
    ({degree, quality, duration: 4, inversion: 0, rest: false})

/// Degrees are zero-based, so 0 is I and 5 is vi. Whether a degree sounds major or minor follows the
/// device's scale, which is why the minor progressions read as i-VII-VI-V once the scale is set to Minor.
export namespace KadenzPresets {
    export const All: ReadonlyArray<KadenzPreset> = [
        {name: "I–V–vi–IV", steps: [bar(0), bar(4), bar(5), bar(3)]},
        {name: "I–vi–IV–V", steps: [bar(0), bar(5), bar(3), bar(4)]},
        {name: "vi–IV–I–V", steps: [bar(5), bar(3), bar(0), bar(4)]},
        {name: "ii–V–I", steps: [bar(1, Min7), bar(4, Dom7), bar(0, Maj7)]},
        {
            name: "12-Bar Blues", steps: [
                bar(0, Dom7), bar(0, Dom7), bar(0, Dom7), bar(0, Dom7),
                bar(3, Dom7), bar(3, Dom7), bar(0, Dom7), bar(0, Dom7),
                bar(4, Dom7), bar(3, Dom7), bar(0, Dom7), bar(4, Dom7)
            ]
        },
        {name: "Circle (vi–ii–V–I)", steps: [bar(5), bar(1), bar(4), bar(0)]},
        {name: "Pachelbel", steps: [bar(0), bar(4), bar(5), bar(2), bar(3), bar(0), bar(3), bar(4)]},
        {name: "Andalusian", steps: [bar(0), bar(6), bar(5), bar(4)]},
        {name: "Minor Loop", steps: [bar(0), bar(5), bar(2), bar(6)]}
    ]
}
