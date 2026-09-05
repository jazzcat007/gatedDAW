import {
    ArpeggioDeviceBox,
    ChordDeviceBox,
    EuclidDeviceBox,
    GrooveShuffleBox,
    PitchDeviceBox,
    SpielwerkDeviceBox,
    VelocityDeviceBox,
    ZeitgeistDeviceBox
} from "@opendaw/studio-boxes"
import {Box} from "@opendaw/lib-box"
import {asInstanceOf, bipolar, float, int, panic, unitValue} from "@opendaw/lib-std"
import {
    AnyAudioUnit,
    ArpeggioEffect,
    ChordEffect,
    EuclidEffect,
    MIDIEffects,
    PitchEffect,
    ScriptParameter,
    ScriptSample,
    SpielwerkEffect,
    VelocityEffect,
    ZeitgeistEffect
} from "../../Api"
import {Context} from "../Context"
import {EffectDeviceBox, EffectFacade} from "./EffectChain"
import {Facades} from "../Facades"
import {GrooveShuffleImpl} from "../GrooveShuffleImpl"
import {ScriptSupport} from "./ScriptDevices"
import {MIDIEffectBox} from "./DeviceBoxes"

export abstract class MIDIEffectFacade<B extends EffectDeviceBox = EffectDeviceBox> extends EffectFacade<B> {
    abstract readonly key: keyof MIDIEffects
    get audioUnit(): AnyAudioUnit {return Facades.audioUnitOf(this.context, this.box)}
}

export type AnyMIDIEffectImpl =
    | ArpeggioEffectImpl | ChordEffectImpl | EuclidEffectImpl | PitchEffectImpl | VelocityEffectImpl | ZeitgeistEffectImpl | SpielwerkEffectImpl

export class ArpeggioEffectImpl extends MIDIEffectFacade<ArpeggioDeviceBox> implements ArpeggioEffect {
    readonly key = "Arpeggio" as const
    declare mode: 0 | 1 | 2
    declare octaves: int
    declare rate: int
    declare gate: float
    declare repeat: int
    declare velocity: bipolar

    constructor(context: Context, box: ArpeggioDeviceBox) {
        super(context, box)
        this.bind({
            mode: box.modeIndex, octaves: box.numOctaves, rate: box.rateIndex,
            gate: box.gate, repeat: box.repeat, velocity: box.velocity
        })
    }
}

export class ChordEffectImpl extends MIDIEffectFacade<ChordDeviceBox> implements ChordEffect {
    readonly key = "Chord" as const
    declare keyNote: int
    declare scaleIndex: int
    declare degree: int
    declare numNotes: int
    declare inversion: int
    declare spread: int
    declare octave: int
    declare strum: float
    declare velocity: bipolar

    constructor(context: Context, box: ChordDeviceBox) {
        super(context, box)
        this.bind({
            keyNote: box.key, scaleIndex: box.scaleIndex, degree: box.degree, numNotes: box.numNotes,
            inversion: box.inversion, spread: box.spread, octave: box.octave, strum: box.strum, velocity: box.velocity
        })
    }
}

export class EuclidEffectImpl extends MIDIEffectFacade<EuclidDeviceBox> implements EuclidEffect {
    readonly key = "Euclid" as const
    declare steps: int
    declare pulses: int
    declare rotation: int
    declare rate: int
    declare gate: float
    declare pitch: int
    declare velocity: unitValue

    constructor(context: Context, box: EuclidDeviceBox) {
        super(context, box)
        this.bind({
            steps: box.steps, pulses: box.pulses, rotation: box.rotation, rate: box.rateIndex,
            gate: box.gate, pitch: box.pitch, velocity: box.velocity
        })
    }
}

export class PitchEffectImpl extends MIDIEffectFacade<PitchDeviceBox> implements PitchEffect {
    readonly key = "Pitch" as const
    declare octaves: int
    declare semiTones: int
    declare cents: float

    constructor(context: Context, box: PitchDeviceBox) {
        super(context, box)
        this.bind({octaves: box.octaves, semiTones: box.semiTones, cents: box.cents})
    }
}

export class VelocityEffectImpl extends MIDIEffectFacade<VelocityDeviceBox> implements VelocityEffect {
    readonly key = "Velocity" as const
    declare magnetPosition: unitValue
    declare magnetStrength: unitValue
    declare randomSeed: int
    declare randomAmount: unitValue
    declare offset: bipolar
    declare mix: unitValue

    constructor(context: Context, box: VelocityDeviceBox) {
        super(context, box)
        this.bind({
            magnetPosition: box.magnetPosition, magnetStrength: box.magnetStrength, randomSeed: box.randomSeed,
            randomAmount: box.randomAmount, offset: box.offset, mix: box.mix
        })
    }
}

export class ZeitgeistEffectImpl extends MIDIEffectFacade<ZeitgeistDeviceBox> implements ZeitgeistEffect {
    readonly key = "Zeitgeist" as const

    constructor(context: Context, box: ZeitgeistDeviceBox) {super(context, box)}

    get groove(): GrooveShuffleImpl {
        const grooveBox = this.box.groove.targetVertex.unwrap("Zeitgeist has no groove").box
        return GrooveShuffleImpl.wrap(this.context, asInstanceOf(grooveBox, GrooveShuffleBox))
    }
}

export class SpielwerkEffectImpl extends MIDIEffectFacade<SpielwerkDeviceBox> implements SpielwerkEffect {
    readonly key = "Spielwerk" as const
    readonly #script: ScriptSupport

    constructor(context: Context, box: SpielwerkDeviceBox) {
        super(context, box)
        this.#script = new ScriptSupport(context, box, "spielwerk")
    }

    get code(): string {return this.#script.code}
    set code(source: string) {this.#script.code = source}
    get parameters(): ReadonlyArray<ScriptParameter> {return this.#script.parameters}
    get samples(): ReadonlyArray<ScriptSample> {return this.#script.samples}
    parameter(label: string): ScriptParameter {return this.#script.parameter(label)}
    sample(label: string): ScriptSample {return this.#script.sample(label)}
}

export namespace MIDIEffectImpls {
    export const wrap = (context: Context, box: Box): AnyMIDIEffectImpl => context.facade(box, () => {
        if (box instanceof ArpeggioDeviceBox) {return new ArpeggioEffectImpl(context, box)}
        if (box instanceof ChordDeviceBox) {return new ChordEffectImpl(context, box)}
        if (box instanceof EuclidDeviceBox) {return new EuclidEffectImpl(context, box)}
        if (box instanceof PitchDeviceBox) {return new PitchEffectImpl(context, box)}
        if (box instanceof VelocityDeviceBox) {return new VelocityEffectImpl(context, box)}
        if (box instanceof ZeitgeistDeviceBox) {return new ZeitgeistEffectImpl(context, box)}
        if (box instanceof SpielwerkDeviceBox) {return new SpielwerkEffectImpl(context, box)}
        return panic(`${box.name} is not a supported midi-effect`)
    }) as AnyMIDIEffectImpl

    export const isBox = (box: Box): box is MIDIEffectBox =>
        box instanceof ArpeggioDeviceBox || box instanceof ChordDeviceBox || box instanceof EuclidDeviceBox || box instanceof PitchDeviceBox || box instanceof VelocityDeviceBox
        || box instanceof ZeitgeistDeviceBox || box instanceof SpielwerkDeviceBox
}
