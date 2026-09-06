import {int, Mulberry32} from "@opendaw/lib-std"
import {KadenzStep} from "./KadenzStep"

export type KadenzCadence = "authentic" | "plagal" | "half" | "deceptive"

export type KadenzGenerateOptions = {
    readonly length: int
    readonly seed: int
    readonly cadence: KadenzCadence
    readonly seventhChance: number
    readonly borrowedChance: number
    readonly barsPerChord: int
}

/// The three harmonic functions and the degrees that serve them (zero-based, so 0 is I). A progression is a
/// walk over functions, and the degree is then drawn from the chosen function's members — the classic
/// tonic → predominant → dominant → tonic motion, which is what makes generated output sound purposeful
/// rather than random. Weights are hand-authored from common-practice convention; deriving them from a
/// corpus (e.g. When-in-Rome) would be an offline refinement, not a runtime one.
const Tonic = [0, 5, 2]
const Predominant = [1, 3]
const Dominant = [4, 6]

type Fn = "T" | "PD" | "D"

/// Transition weights out of each function. Tonic can restate itself or move on; a predominant strongly
/// prefers the dominant; a dominant resolves.
const Transitions: Readonly<Record<Fn, ReadonlyArray<readonly [Fn, number]>>> = {
    T: [["T", 0.2], ["PD", 0.5], ["D", 0.3]],
    PD: [["PD", 0.15], ["D", 0.85]],
    D: [["T", 0.75], ["D", 0.25]]
}

/// The sevenths a degree takes when the roll asks for one, by function: dominants become Dom7, predominants
/// Min7, tonics Maj7. Leaving quality at Auto keeps the degree's plain diatonic triad.
const seventhFor = (fn: Fn): int => fn === "D" ? 7 : fn === "PD" ? 8 : 9

const membersOf = (fn: Fn): ReadonlyArray<int> => fn === "T" ? Tonic : fn === "PD" ? Predominant : Dominant

const pickFunction = (random: Mulberry32, from: Fn): Fn => {
    const roll = random.uniform()
    let accumulated = 0.0
    for (const [next, weight] of Transitions[from]) {
        accumulated += weight
        if (roll < accumulated) {return next}
    }
    return Transitions[from][Transitions[from].length - 1][0]
}

/// The final one or two chords, which is what actually makes a progression sound finished.
const cadenceOf = (cadence: KadenzCadence): ReadonlyArray<int> => {
    switch (cadence) {
        case "authentic": return [4, 0]
        case "plagal": return [3, 0]
        case "half": return [4]
        case "deceptive": return [4, 5]
    }
}

export namespace KadenzGenerator {
    export const Default: KadenzGenerateOptions = {
        length: 8, seed: 1, cadence: "authentic", seventhChance: 0.25, borrowedChance: 0.1, barsPerChord: 4
    }

    /// Walk the functional grammar for `length` chords, ending on the chosen cadence. Deterministic: the
    /// same seed always yields the same progression, so a generated result can be reproduced and shared.
    export const steps = (options: KadenzGenerateOptions): ReadonlyArray<KadenzStep> => {
        const random = new Mulberry32(options.seed)
        const length = Math.max(1, Math.min(options.length, KadenzStep.MaxSteps))
        const duration = Math.max(1, Math.min(options.barsPerChord, KadenzStep.MaxDuration))
        const cadence = cadenceOf(options.cadence)
        const walked = Math.max(0, length - cadence.length)
        const steps: Array<KadenzStep> = []
        let fn: Fn = "T"
        for (let index = 0; index < walked; index++) {
            const degree = random.nextElement(membersOf(fn))
            const seventh = random.uniform() < options.seventhChance
            // A borrowed chord keeps the degree but spells it with the opposite mode's colour, which is the
            // cheapest way to leave the scale without losing the progression's function.
            const borrowed = random.uniform() < options.borrowedChance
            const quality = seventh ? seventhFor(fn) : borrowed ? (fn === "D" ? 7 : 2) : 0
            steps.push({degree, quality, duration, inversion: 0, rest: false})
            fn = pickFunction(random, fn)
        }
        for (const degree of cadence.slice(0, length - steps.length)) {
            steps.push({degree, quality: 0, duration, inversion: 0, rest: false})
        }
        return steps
    }
}
