import {KadenzDeviceBox} from "@opendaw/studio-boxes"
import {Pointers} from "@opendaw/studio-enums"
import {Address, BooleanField, Int32Field, PointerField, StringField} from "@opendaw/lib-box"
import {clamp, int, StringMapping, UUID, ValueMapping} from "@opendaw/lib-std"
import {Fraction} from "@opendaw/lib-dsp"
import {DeviceHost, Devices, MidiEffectDeviceAdapter} from "../../DeviceAdapter"
import {BoxAdaptersContext} from "../../BoxAdaptersContext"
import {DeviceManualUrls} from "../../DeviceManualUrls"
import {ParameterAdapterSet} from "../../ParameterAdapterSet"
import {AudioUnitBoxAdapter} from "../../audio-unit/AudioUnitBoxAdapter"
import {KadenzStep} from "./Kadenz/KadenzStep"
import {KadenzGenerateOptions, KadenzGenerator} from "./Kadenz/KadenzGenerator"

export class KadenzDeviceBoxAdapter implements MidiEffectDeviceAdapter {
    static KeyNames: ReadonlyArray<string> =
        ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    // WASM CONTRACT: the order mirrors `SCALES` in crates/stock-devices/device-chord-common, so the index is
    // the scaleIndex parameter value. All seven-tone, since a degree spells its chord by stacking thirds.
    static ScaleNames: ReadonlyArray<string> =
        ["Major", "Minor", "Harm Minor", "Mel Minor", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Locrian"]

    static RateFractions = Fraction.builder()
        .add([1, 1]).add([1, 2]).add([1, 3]).add([1, 4])
        .add([3, 16]).add([1, 6]).add([1, 8]).add([3, 32])
        .add([1, 12]).add([1, 16]).add([3, 64]).add([1, 24])
        .add([1, 32]).add([1, 48]).add([1, 64])
        .add([1, 96]).add([1, 128])
        .asDescendingArray()

    static RateStringMapping = StringMapping.indices("", this.RateFractions.map(([n, d]) => `${n}/${d}`))

    readonly type = "midi-effect"
    readonly accepts = "midi"
    readonly manualUrl = DeviceManualUrls.Kadenz

    readonly #context: BoxAdaptersContext
    readonly #box: KadenzDeviceBox
    readonly #parametric: ParameterAdapterSet
    readonly namedParameter // let typescript infer the type

    constructor(context: BoxAdaptersContext, box: KadenzDeviceBox) {
        this.#context = context
        this.#box = box
        this.#parametric = new ParameterAdapterSet(this.#context)
        this.namedParameter = this.#wrapParameters(box)
    }

    get box(): KadenzDeviceBox {return this.#box}
    get uuid(): UUID.Bytes {return this.#box.address.uuid}
    get address(): Address {return this.#box.address}
    get indexField(): Int32Field {return this.#box.index}
    get labelField(): StringField {return this.#box.label}
    get enabledField(): BooleanField {return this.#box.enabled}
    get minimizedField(): BooleanField {return this.#box.minimized}
    get host(): PointerField<Pointers.MIDIEffectHost> {return this.#box.host}

    deviceHost(): DeviceHost {
        return this.#context.boxAdapters
            .adapterFor(this.#box.host.targetVertex.unwrap("no device-host").box, Devices.isHost)
    }

    audioUnitBoxAdapter(): AudioUnitBoxAdapter {return this.deviceHost().audioUnitBoxAdapter()}

    terminate(): void {this.#parametric.terminate()}

    get length(): int {return this.#box.length.getValue()}

    readStep(index: int): KadenzStep {
        return KadenzStep.unpack(this.#box.steps.getField(index).getValue())
    }

    writeStep(index: int, step: KadenzStep): void {
        this.#box.steps.getField(index).setValue(KadenzStep.pack(step))
    }

    readProgression(): ReadonlyArray<KadenzStep> {
        return this.#box.steps.fields().slice(0, this.length).map(field => KadenzStep.unpack(field.getValue()))
    }

    /// Replace the whole progression, padding the unused slots with the born default so a shortened
    /// progression leaves no stale steps behind. Call inside an `editing.modify` transaction.
    writeProgression(steps: ReadonlyArray<KadenzStep>): void {
        const fields = this.#box.steps.fields()
        const used = Math.min(steps.length, fields.length)
        fields.forEach((field, index) =>
            field.setValue(index < used ? KadenzStep.pack(steps[index]) : KadenzStep.Default))
        this.#box.length.setValue(clamp(used, 1, fields.length))
    }

    generateProgression(options: KadenzGenerateOptions = KadenzGenerator.Default): void {
        this.writeProgression(KadenzGenerator.steps(options))
    }

    #wrapParameters(box: KadenzDeviceBox) {
        return {
            key: this.#parametric.createParameter(
                box.key,
                ValueMapping.linearInteger(0, KadenzDeviceBoxAdapter.KeyNames.length - 1),
                StringMapping.indices("", KadenzDeviceBoxAdapter.KeyNames), "Key"),
            scaleIndex: this.#parametric.createParameter(
                box.scaleIndex,
                ValueMapping.linearInteger(0, KadenzDeviceBoxAdapter.ScaleNames.length - 1),
                StringMapping.indices("", KadenzDeviceBoxAdapter.ScaleNames), "Scale"),
            rate: this.#parametric.createParameter(
                box.rateIndex,
                ValueMapping.linearInteger(0, KadenzDeviceBoxAdapter.RateFractions.length - 1),
                KadenzDeviceBoxAdapter.RateStringMapping, "Rate"),
            gate: this.#parametric.createParameter(
                box.gate,
                ValueMapping.linear(0.0, 2.0),
                StringMapping.percent({fractionDigits: 0}), "Gate"),
            numNotes: this.#parametric.createParameter(
                box.numNotes,
                ValueMapping.linearInteger(1, 6),
                StringMapping.numeric({unit: "", fractionDigits: 0}), "Notes"),
            inversion: this.#parametric.createParameter(
                box.inversion,
                ValueMapping.linearInteger(0, 3),
                StringMapping.numeric({unit: "", fractionDigits: 0}), "Inversion"),
            spread: this.#parametric.createParameter(
                box.spread,
                ValueMapping.linearInteger(0, 3),
                StringMapping.numeric({unit: "", fractionDigits: 0}), "Spread"),
            octave: this.#parametric.createParameter(
                box.octave,
                ValueMapping.linearInteger(-2, 2),
                StringMapping.numeric({unit: "oct", fractionDigits: 0}), "Octave"),
            strum: this.#parametric.createParameter(
                box.strum,
                ValueMapping.linear(0.0, 240.0),
                StringMapping.numeric({unit: "p", fractionDigits: 0}), "Strum"),
            velocity: this.#parametric.createParameter(
                box.velocity,
                ValueMapping.unipolar(),
                StringMapping.percent({fractionDigits: 0}), "Velocity"),
            velocityTilt: this.#parametric.createParameter(
                box.velocityTilt,
                ValueMapping.bipolar(),
                StringMapping.percent({fractionDigits: 0, bipolar: true}), "Tilt")
        } as const
    }
}
