import {SfzDeviceBox, SfzRegionBox} from "@opendaw/studio-boxes"
import {Address, BooleanField, StringField} from "@opendaw/lib-box"
import {Pointers} from "@opendaw/studio-enums"
import {Option, UUID} from "@opendaw/lib-std"
import {DeviceHost, Devices, InstrumentDeviceBoxAdapter} from "../../DeviceAdapter"
import {BoxAdaptersContext} from "../../BoxAdaptersContext"
import {DeviceManualUrls} from "../../DeviceManualUrls"
import {IndexedBoxAdapterCollection} from "../../IndexedBoxAdapterCollection"
import {SfzRegionBoxAdapter} from "./Sfz/SfzRegionBoxAdapter"
import {TrackType} from "../../timeline/TrackType"
import {AudioUnitBoxAdapter} from "../../audio-unit/AudioUnitBoxAdapter"
import {LabeledAudioOutput, LabeledAudioOutputsOwner} from "../../LabeledAudioOutputsOwner"
import {InstrumentFactories} from "../../factories/InstrumentFactories"

export class SfzDeviceBoxAdapter implements InstrumentDeviceBoxAdapter, LabeledAudioOutputsOwner {
    readonly type = "instrument"
    readonly accepts = "midi"
    readonly manualUrl = DeviceManualUrls.Sfz

    readonly #context: BoxAdaptersContext
    readonly #box: SfzDeviceBox

    readonly #regions: IndexedBoxAdapterCollection<SfzRegionBoxAdapter, Pointers.Sample>

    constructor(context: BoxAdaptersContext, box: SfzDeviceBox) {
        this.#context = context
        this.#box = box

        this.#regions = IndexedBoxAdapterCollection.create(
            box.regions, box => context.boxAdapters.adapterFor(box, SfzRegionBoxAdapter), Pointers.Sample)
    }

    reset(): void {this.#regions.adapters().forEach(adapter => adapter.box.delete())}

    // Appends regions parsed from an SFZ definition after any already present (mirrors PlayfieldDeviceBoxAdapter.chop).
    load(regions: InstrumentFactories.SfzRegionAttachment): void {
        const startIndex = this.#regions.adapters().length
        regions.forEach((region, offset) => {
            SfzRegionBox.create(this.#context.boxGraph, UUID.generate(), box => {
                box.device.refer(this.#box.regions)
                box.file.refer(region.file)
                box.regionIndex.setValue(startIndex + offset)
                box.keyLo.setValue(region.keyLo)
                box.keyHi.setValue(region.keyHi)
                box.rootKey.setValue(region.rootKey)
                box.velLo.setValue(region.velLo)
                box.velHi.setValue(region.velHi)
                box.loopMode.setValue(region.loopMode)
                box.loopStart.setValue(region.loopStart)
                box.loopEnd.setValue(region.loopEnd)
                box.attack.setValue(region.attack)
                box.decay.setValue(region.decay)
                box.sustain.setValue(region.sustain)
                box.release.setValue(region.release)
                box.volume.setValue(region.volume)
                box.pan.setValue(region.pan)
                box.tune.setValue(region.tune)
            })
        })
    }

    get box(): SfzDeviceBox {return this.#box}
    get uuid(): UUID.Bytes {return this.#box.address.uuid}
    get address(): Address {return this.#box.address}
    get labelField(): StringField {return this.#box.label}
    get iconField(): StringField {return this.#box.icon}
    get defaultTrackType(): TrackType {return TrackType.Notes}
    get enabledField(): BooleanField {return this.#box.enabled}
    get minimizedField(): BooleanField {return this.#box.minimized}
    get acceptsMidiEvents(): boolean {return true}
    get regions(): IndexedBoxAdapterCollection<SfzRegionBoxAdapter, Pointers.Sample> {return this.#regions}
    get context(): BoxAdaptersContext {return this.#context}

    deviceHost(): DeviceHost {
        return this.#context.boxAdapters
            .adapterFor(this.#box.host.targetVertex.unwrap("no device-host").box, Devices.isHost)
    }

    audioUnitBoxAdapter(): AudioUnitBoxAdapter {return this.deviceHost().audioUnitBoxAdapter()}

    * labeledAudioOutputs(): Iterable<LabeledAudioOutput> {
        yield {
            address: this.address,
            label: this.labelField.getValue(),
            children: () => Option.None
        }
        for (const region of this.#regions.adapters()) {
            yield {
                address: region.address,
                label: region.fileLabel,
                children: () => Option.None
            }
        }
    }

    terminate(): void {}
}
