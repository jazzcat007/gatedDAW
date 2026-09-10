import {AudioFileBox, SfzRegionBox} from "@opendaw/studio-boxes"
import {asInstanceOf, Option, StringMapping, Terminator, UUID, ValueMapping} from "@opendaw/lib-std"
import {Address, BooleanField, Int32Field, StringField} from "@opendaw/lib-box"
import {DeviceAccepts, DeviceHost, InstrumentDeviceBoxAdapter} from "../../../DeviceAdapter"
import {LabeledAudioOutput} from "../../../LabeledAudioOutputsOwner"
import {IndexedBoxAdapter} from "../../../IndexedBoxAdapterCollection"
import {BoxAdaptersContext} from "../../../BoxAdaptersContext"
import {DeviceManualUrls} from "../../../DeviceManualUrls"
import {ParameterAdapterSet} from "../../../ParameterAdapterSet"
import {AudioFileBoxAdapter} from "../../../audio/AudioFileBoxAdapter"
import {TrackType} from "../../../timeline/TrackType"
import {AudioUnitBoxAdapter} from "../../../audio-unit/AudioUnitBoxAdapter"
import {SfzDeviceBoxAdapter} from "../SfzDeviceBoxAdapter"

export class SfzRegionBoxAdapter implements InstrumentDeviceBoxAdapter, IndexedBoxAdapter {
    readonly type = "instrument"
    readonly accepts: DeviceAccepts = false
    readonly manualUrl = DeviceManualUrls.Sfz

    readonly #terminator = new Terminator()

    readonly #context: BoxAdaptersContext
    readonly #box: SfzRegionBox

    readonly #parametric: ParameterAdapterSet
    readonly namedParameter // let typescript infer the type

    #file: Option<AudioFileBoxAdapter> = Option.None

    constructor(context: BoxAdaptersContext, box: SfzRegionBox) {
        this.#context = context
        this.#box = box

        this.#parametric = this.#terminator.own(new ParameterAdapterSet(this.#context))
        this.namedParameter = this.#wrapParameters(box)

        this.#terminator.own(
            this.#box.file.catchupAndSubscribe(pointer => {
                this.#file = pointer.targetVertex.map(({box}) => this.#context.boxAdapters.adapterFor(box, AudioFileBoxAdapter))
                this.#file.unwrapOrNull()?.getOrCreateLoader()
            })
        )
    }

    get box(): SfzRegionBox {return this.#box}
    get uuid(): UUID.Bytes {return this.#box.address.uuid}
    get address(): Address {return this.#box.address}
    get indexField(): Int32Field {return this.#box.regionIndex}
    get keyLo(): number {return this.#box.keyLo.getValue()}
    get keyHi(): number {return this.#box.keyHi.getValue()}
    get rootKey(): number {return this.#box.rootKey.getValue()}
    get velLo(): number {return this.#box.velLo.getValue()}
    get velHi(): number {return this.#box.velHi.getValue()}
    get loopMode(): number {return this.#box.loopMode.getValue()}
    get loopStart(): number {return this.#box.loopStart.getValue()}
    get loopEnd(): number {return this.#box.loopEnd.getValue()}
    get fileLabel(): string {return this.#file.mapOr(file => file.box.fileName.getValue(), "No file")}
    get iconField(): StringField {return this.#box.icon}
    get defaultTrackType(): TrackType {return TrackType.Notes}
    get acceptsMidiEvents(): boolean {return true}
    get labelField(): StringField {return asInstanceOf(this.#box.file.targetVertex.unwrap("file.target").box, AudioFileBox).fileName}
    get enabledField(): BooleanField {return this.#box.enabled}
    get minimizedField(): BooleanField {return this.#box.minimized}

    file(): Option<AudioFileBoxAdapter> {return this.#file}

    device(): SfzDeviceBoxAdapter {
        return this.#context.boxAdapters
            .adapterFor(this.#box.device.targetVertex.unwrap("device.target").box, SfzDeviceBoxAdapter)
    }

    deviceHost(): DeviceHost {return this.device().deviceHost()}
    audioUnitBoxAdapter(): AudioUnitBoxAdapter {return this.deviceHost().audioUnitBoxAdapter()}

    * labeledAudioOutputs(): Iterable<LabeledAudioOutput> {
        yield {
            address: this.address,
            label: this.fileLabel,
            children: () => Option.None
        }
    }

    terminate(): void {this.#terminator.terminate()}

    #wrapParameters(box: SfzRegionBox) {
        return {
            attack: this.#parametric.createParameter(box.attack, ValueMapping.exponential(0.001, 5.0), StringMapping.numeric({
                unit: "s",
                unitPrefix: true,
                fractionDigits: 1
            }), "Attack"),
            decay: this.#parametric.createParameter(box.decay, ValueMapping.exponential(0.001, 5.0), StringMapping.numeric({
                unit: "s",
                unitPrefix: true,
                fractionDigits: 1
            }), "Decay"),
            sustain: this.#parametric.createParameter(box.sustain, ValueMapping.unipolar(), StringMapping.percent(), "Sustain", 1.0),
            release: this.#parametric.createParameter(box.release, ValueMapping.exponential(0.001, 5.0), StringMapping.numeric({
                unit: "s",
                unitPrefix: true,
                fractionDigits: 1
            }), "Release"),
            volume: this.#parametric.createParameter(box.volume, ValueMapping.DefaultDecibel,
                StringMapping.numeric({unit: "dB", fractionDigits: 1}), "Volume"),
            pan: this.#parametric.createParameter(box.pan, ValueMapping.bipolar(), StringMapping.panning, "Pan", 0.5),
            tune: this.#parametric.createParameter(box.tune, ValueMapping.linear(-1200, 1200), StringMapping.numeric({
                unit: "cents",
                bipolar: true,
                fractionDigits: 0
            }), "Tune", 0.0)
        } as const
    }
}
