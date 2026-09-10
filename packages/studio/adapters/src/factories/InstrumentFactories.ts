import {
    ApparatDeviceBox,
    AudioFileBox,
    BoxIO,
    CubedDeviceBox,
    NeonDeviceBox,
    MIDIOutputDeviceBox,
    NanoDeviceBox,
    PlayfieldDeviceBox,
    PlayfieldSampleBox,
    SoundfontDeviceBox,
    SoundfontFileBox,
    SfzDeviceBox,
    SfzRegionBox,
    TapeDeviceBox,
    VaporisateurDeviceBox
} from "@opendaw/studio-boxes"
import {byte, int, isDefined, UUID} from "@opendaw/lib-std"
import {ClassicWaveform} from "@opendaw/lib-dsp"
import {BoxGraph, Field} from "@opendaw/lib-box"
import {IconSymbol, Pointers, VoicingMode} from "@opendaw/studio-enums"
import {DeviceManualUrls} from "../DeviceManualUrls"
import {InstrumentFactory} from "./InstrumentFactory"
import {TrackType} from "../timeline/TrackType"

export namespace InstrumentFactories {
    export const Tape: InstrumentFactory<void, TapeDeviceBox> = {
        defaultName: "Tape",
        defaultIcon: IconSymbol.Tape,
        briefDescription: "Audio Player",
        description: "Plays audio regions & clips",
        manualPage: DeviceManualUrls.Tape,
        trackType: TrackType.Audio,
        create: (boxGraph: BoxGraph,
                 host: Field<Pointers.InstrumentHost | Pointers.AudioOutput>,
                 name: string,
                 icon: IconSymbol,
                 _attachment?: void): TapeDeviceBox => TapeDeviceBox.create(boxGraph, UUID.generate(), box => {
            box.label.setValue(name)
            box.icon.setValue(IconSymbol.toName(icon))
            box.flutter.setValue(0.2)
            box.wow.setValue(0.05)
            box.noise.setValue(0.02)
            box.saturation.setValue(0.5)
            box.host.refer(host)
        })
    }

    export const Nano: InstrumentFactory<AudioFileBox, NanoDeviceBox> = {
        defaultName: "Nano",
        defaultIcon: IconSymbol.NanoWave,
        briefDescription: "Simple Sampler",
        description: "Simple sampler",
        manualPage: DeviceManualUrls.Nano,
        trackType: TrackType.Notes,
        create: (boxGraph: BoxGraph,
                 host: Field<Pointers.InstrumentHost | Pointers.AudioOutput>,
                 name: string,
                 icon: IconSymbol,
                 attachment?: AudioFileBox): NanoDeviceBox => NanoDeviceBox.create(boxGraph, UUID.generate(), box => {
            box.label.setValue(name)
            box.icon.setValue(IconSymbol.toName(icon))
            if (isDefined(attachment)) {box.file.refer(attachment)}
            box.host.refer(host)
        })
    }

    export type PlayfieldAttachment = ReadonlyArray<{
        note: byte
        uuid: UUID.Bytes
        name: string
        durationInSeconds: number
        exclude: boolean
    }>

    export const Playfield: InstrumentFactory<PlayfieldAttachment, PlayfieldDeviceBox> = {
        defaultName: "Playfield",
        defaultIcon: IconSymbol.Playfield,
        briefDescription: "Drum Machine",
        description: "Drum computer",
        manualPage: DeviceManualUrls.Playfield,
        trackType: TrackType.Notes,
        create: (boxGraph: BoxGraph,
                 host: Field<Pointers.InstrumentHost | Pointers.AudioOutput>,
                 name: string,
                 icon: IconSymbol,
                 attachment?: PlayfieldAttachment): PlayfieldDeviceBox => {
            const deviceBox = PlayfieldDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue(name)
                box.icon.setValue(IconSymbol.toName(icon))
                box.host.refer(host)
            })
            if (isDefined(attachment)) {
                attachment.filter(({note, uuid, name, durationInSeconds, exclude}) => {
                    const fileBox = useAudioFile(boxGraph, uuid, name, durationInSeconds)
                    PlayfieldSampleBox.create(boxGraph, UUID.generate(), box => {
                        box.device.refer(deviceBox.samples)
                        box.file.refer(fileBox)
                        box.index.setValue(note)
                        box.exclude.setValue(exclude)
                    })
                })
            }
            return deviceBox
        }
    }

    export const Neon: InstrumentFactory<void, NeonDeviceBox> = {
        defaultName: "Neon",
        defaultIcon: IconSymbol.Neon,
        briefDescription: "CZ-style Synth",
        description: "CZ-style phase distortion synthesizer",
        manualPage: DeviceManualUrls.Neon,
        trackType: TrackType.Notes,
        create: (boxGraph: BoxGraph<BoxIO.TypeMap>,
                 host: Field<Pointers.InstrumentHost | Pointers.AudioOutput>,
                 name: string,
                 icon: IconSymbol,
                 _attachment?: void): NeonDeviceBox =>
            NeonDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue(name)
                box.icon.setValue(IconSymbol.toName(icon))
                // The init tone: line 1 saw, DCW fully open, organ-style DCA (full until note-off, short
                // release stage). Envelope array order: line1 pitch/DCW/DCA, line2 pitch/DCW/DCA.
                for (const line of [0, 1]) {
                    const dcw = box.envelopes.fields()[line * 3 + 1]
                    dcw.rate1.setInitValue(99)
                    dcw.level1.setInitValue(99)
                    dcw.sustain.setInitValue(1)
                    dcw.end.setInitValue(2)
                    dcw.rate2.setInitValue(99)
                    const dca = box.envelopes.fields()[line * 3 + 2]
                    dca.rate1.setInitValue(99)
                    dca.level1.setInitValue(99)
                    dca.sustain.setInitValue(1)
                    dca.end.setInitValue(2)
                    dca.rate2.setInitValue(70)
                }
                box.host.refer(host)
            })
    }

    export const Cubed: InstrumentFactory<void, CubedDeviceBox> = {
        defaultName: "Cubed",
        defaultIcon: IconSymbol.Cube,
        briefDescription: "303-style Synth",
        description: "Acid bassline synthesizer",
        manualPage: "manuals/devices/instruments/cubed",
        trackType: TrackType.Notes,
        create: (boxGraph: BoxGraph<BoxIO.TypeMap>,
                 host: Field<Pointers.InstrumentHost | Pointers.AudioOutput>,
                 name: string,
                 icon: IconSymbol,
                 _attachment?: void): CubedDeviceBox =>
            CubedDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue(name)
                box.icon.setValue(IconSymbol.toName(icon))
                box.host.refer(host)
            })
    }

    export const Vaporisateur: InstrumentFactory<void, VaporisateurDeviceBox> = {
        defaultName: "Vaporisateur",
        defaultIcon: IconSymbol.Vaporisateur,
        briefDescription: "Subtractive Synth",
        description: "Classic subtractive synthesizer",
        manualPage: DeviceManualUrls.Vaporisateur,
        trackType: TrackType.Notes,
        create: (boxGraph: BoxGraph<BoxIO.TypeMap>,
                 host: Field<Pointers.InstrumentHost | Pointers.AudioOutput>,
                 name: string,
                 icon: IconSymbol,
                 _attachment?: void): VaporisateurDeviceBox =>
            VaporisateurDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue(name)
                box.icon.setValue(IconSymbol.toName(icon))
                box.cutoff.setInitValue(8000.0)
                box.resonance.setInitValue(0.1)
                box.attack.setInitValue(0.005)
                box.decay.setInitValue(0.100)
                box.sustain.setInitValue(0.5)
                box.release.setInitValue(0.5)
                box.voicingMode.setInitValue(VoicingMode.Polyphonic)
                box.lfo.rate.setInitValue(1.0)
                box.oscillators.fields()[0].waveform.setInitValue(ClassicWaveform.saw)
                box.oscillators.fields()[0].volume.setInitValue(-6.0)
                box.oscillators.fields()[1].volume.setInitValue(Number.NEGATIVE_INFINITY)
                box.oscillators.fields()[1].waveform.setInitValue(ClassicWaveform.square)
                box.host.refer(host)
                box.version.setValue(2) // for removing the -15db in voice and extended osc
            })
    }

    export const MIDIOutput: InstrumentFactory<void, MIDIOutputDeviceBox> = {
        defaultName: "MIDIOutput",
        defaultIcon: IconSymbol.Midi,
        briefDescription: "Send MIDI",
        description: "MIDI Output",
        manualPage: DeviceManualUrls.MIDIOutput,
        trackType: TrackType.Notes,
        create: (boxGraph: BoxGraph<BoxIO.TypeMap>,
                 host: Field<Pointers.InstrumentHost | Pointers.AudioOutput>,
                 name: string,
                 icon: IconSymbol,
                 _attachment?: void): MIDIOutputDeviceBox =>
            MIDIOutputDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue(name)
                box.icon.setValue(IconSymbol.toName(icon))
                box.host.refer(host)
            })
    }

    export const Soundfont: InstrumentFactory<SoundfontFileBox, SoundfontDeviceBox> = {
        defaultName: "Soundfont",
        defaultIcon: IconSymbol.SoundFont,
        briefDescription: "Soundfont Player",
        description: "Soundfont Player",
        manualPage: DeviceManualUrls.Soundfont,
        trackType: TrackType.Notes,
        create: (boxGraph: BoxGraph<BoxIO.TypeMap>,
                 host: Field<Pointers.InstrumentHost | Pointers.AudioOutput>,
                 name: string,
                 icon: IconSymbol,
                 attachment?: SoundfontFileBox): SoundfontDeviceBox =>
            SoundfontDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue(name)
                box.icon.setValue(IconSymbol.toName(icon))
                if (isDefined(attachment)) {box.file.refer(attachment)}
                box.host.refer(host)
            })
    }

    export type SfzRegionAttachment = ReadonlyArray<{
        file: AudioFileBox
        keyLo: byte, keyHi: byte, rootKey: byte, velLo: byte, velHi: byte
        loopMode: int, loopStart: int, loopEnd: int
        attack: number, decay: number, sustain: number, release: number
        volume: number, pan: number, tune: number
    }>

    export const Sfz: InstrumentFactory<SfzRegionAttachment, SfzDeviceBox> = {
        defaultName: "SFZ",
        defaultIcon: IconSymbol.Sfz,
        briefDescription: "SFZ Sampler",
        description: "Multi-sample instrument from an SFZ definition",
        manualPage: DeviceManualUrls.Sfz,
        trackType: TrackType.Notes,
        create: (boxGraph: BoxGraph,
                 host: Field<Pointers.InstrumentHost | Pointers.AudioOutput>,
                 name: string,
                 icon: IconSymbol,
                 attachment?: SfzRegionAttachment): SfzDeviceBox => {
            const deviceBox = SfzDeviceBox.create(boxGraph, UUID.generate(), box => {
                box.label.setValue(name)
                box.icon.setValue(IconSymbol.toName(icon))
                box.host.refer(host)
            })
            if (isDefined(attachment)) {
                attachment.forEach((region, index) => {
                    SfzRegionBox.create(boxGraph, UUID.generate(), box => {
                        box.device.refer(deviceBox.regions)
                        box.file.refer(region.file)
                        box.regionIndex.setValue(index)
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
            return deviceBox
        }
    }

    export const Apparat: InstrumentFactory<void, ApparatDeviceBox> = {
        defaultName: "Apparat",
        defaultIcon: IconSymbol.Code,
        briefDescription: "Scriptable Instrument",
        description: "User-scripted instrument",
        manualPage: DeviceManualUrls.Apparat,
        trackType: TrackType.Notes,
        create: (boxGraph: BoxGraph,
                 host: Field<Pointers.InstrumentHost | Pointers.AudioOutput>,
                 name: string,
                 icon: IconSymbol): ApparatDeviceBox => ApparatDeviceBox.create(boxGraph, UUID.generate(), box => {
            box.label.setValue(name)
            box.icon.setValue(IconSymbol.toName(icon))
            box.host.refer(host)
        })
    }

    export const Named = {Apparat, Cubed, Neon, MIDIOutput, Nano, Playfield, Sfz, Soundfont, Tape, Vaporisateur}
    export type Keys = keyof typeof Named

    const useAudioFile = (boxGraph: BoxGraph, fileUUID: UUID.Bytes, name: string, duration: number) =>
        boxGraph.findBox<AudioFileBox>(fileUUID)
            .unwrapOrElse(() => AudioFileBox.create(boxGraph, fileUUID, box => {
                box.fileName.setValue(name)
                box.endInSeconds.setValue(duration)
            }))

    const useSoundfontFile = (boxGraph: BoxGraph, fileUUID: UUID.Bytes, name: string) =>
        boxGraph.findBox<SoundfontFileBox>(fileUUID)
            .unwrapOrElse(() => SoundfontFileBox.create(boxGraph, fileUUID, box => box.fileName.setValue(name)))
}