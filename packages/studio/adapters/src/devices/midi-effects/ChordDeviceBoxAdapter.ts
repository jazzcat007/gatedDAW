import {ChordDeviceBox} from "@opendaw/studio-boxes"
import {Pointers} from "@opendaw/studio-enums"
import {Address, BooleanField, Int32Field, PointerField, StringField} from "@opendaw/lib-box"
import {StringMapping, UUID, ValueMapping} from "@opendaw/lib-std"
import {DeviceHost, Devices, MidiEffectDeviceAdapter} from "../../DeviceAdapter"
import {BoxAdaptersContext} from "../../BoxAdaptersContext"
import {DeviceManualUrls} from "../../DeviceManualUrls"
import {ParameterAdapterSet} from "../../ParameterAdapterSet"
import {AudioUnitBoxAdapter} from "../../audio-unit/AudioUnitBoxAdapter"

export class ChordDeviceBoxAdapter implements MidiEffectDeviceAdapter {
    static KeyNames: ReadonlyArray<string> =
        ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    // WASM CONTRACT: the order mirrors `SCALES` in crates/stock-devices/device-chord, so the index is the
    // scaleIndex parameter value. All seven-tone, since the device spells chords by stacking scale thirds.
    static ScaleNames: ReadonlyArray<string> =
        ["Major", "Minor", "Harm Minor", "Mel Minor", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Locrian"]

    readonly type = "midi-effect"
    readonly accepts = "midi"
    readonly manualUrl = DeviceManualUrls.Chord

    readonly #context: BoxAdaptersContext
    readonly #box: ChordDeviceBox
    readonly #parametric: ParameterAdapterSet
    readonly namedParameter // let typescript infer the type

    constructor(context: BoxAdaptersContext, box: ChordDeviceBox) {
        this.#context = context
        this.#box = box
        this.#parametric = new ParameterAdapterSet(this.#context)
        this.namedParameter = this.#wrapParameters(box)
    }

    get box(): ChordDeviceBox {return this.#box}
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

    #wrapParameters(box: ChordDeviceBox) {
        return {
            key: this.#parametric.createParameter(
                box.key,
                ValueMapping.linearInteger(0, ChordDeviceBoxAdapter.KeyNames.length - 1),
                StringMapping.indices("", ChordDeviceBoxAdapter.KeyNames), "Key"),
            scaleIndex: this.#parametric.createParameter(
                box.scaleIndex,
                ValueMapping.linearInteger(0, ChordDeviceBoxAdapter.ScaleNames.length - 1),
                StringMapping.indices("", ChordDeviceBoxAdapter.ScaleNames), "Scale"),
            degree: this.#parametric.createParameter(
                box.degree,
                ValueMapping.linearInteger(-7, 7),
                StringMapping.numeric({unit: "", fractionDigits: 0}), "Degree"),
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
                ValueMapping.bipolar(),
                StringMapping.percent({fractionDigits: 0, bipolar: true}), "Velocity")
        } as const
    }
}
