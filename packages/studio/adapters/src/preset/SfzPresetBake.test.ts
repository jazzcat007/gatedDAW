import {describe, expect, it} from "vitest"
import {asInstanceOf, isDefined, Option, UUID} from "@opendaw/lib-std"
import {AudioFileBox, CaptureMidiBox, SfzDeviceBox, SfzRegionBox} from "@opendaw/studio-boxes"
import {AudioUnitType, IconSymbol} from "@opendaw/studio-enums"
import {AudioUnitFactory} from "../factories/AudioUnitFactory"
import {InstrumentFactories} from "../factories/InstrumentFactories"
import {ProjectSkeleton} from "../project/ProjectSkeleton"
import {PresetDecoder} from "./PresetDecoder"
import {PresetEncoder} from "./PresetEncoder"

// Pins the offline SFZ preset baking (scripts/bake-sfz-presets.ts) round trip. PresetDecoder gives
// AudioFileBox special treatment — it KEEPS its UUID across encode/decode — and that is the entire
// contract the lazy sample loader depends on: the .odp references audio by the sample-store UUID, so
// applying the preset fetches no bytes and the first playback resolves them. If these come back
// regenerated, lazy loading breaks.

// Same numeric surface as the importer's factory/sfz/<uuid>/regions.json manifest.
type ManifestRegion = {
    sample: string, fileName: string, durationInSeconds: number,
    keyLo: number, keyHi: number, rootKey: number, velLo: number, velHi: number,
    loopMode: number, loopStart: number, loopEnd: number,
    attack: number, decay: number, sustain: number, release: number,
    volume: number, pan: number, tune: number
}

const SAMPLE_A = "1b9a1e0c-6f53-4a99-9a46-e3f7b0a67a01"
const SAMPLE_B = "d93f8d54-0f11-4bb0-8f4f-6a51aa09b8c4"

// Three regions share SAMPLE_A (bake must dedupe to one AudioFileBox), one uses SAMPLE_B.
const REGIONS: ReadonlyArray<ManifestRegion> = [
    {sample: SAMPLE_A, fileName: "KSHarp_E1_f1.wav", durationInSeconds: 2.418,
        keyLo: 28, keyHi: 29, rootKey: 28, velLo: 0, velHi: 127,
        loopMode: 0, loopStart: 0, loopEnd: 0,
        attack: 0.001, decay: 0.001, sustain: 1, release: 0.05, volume: 0, pan: 0, tune: 0},
    {sample: SAMPLE_A, fileName: "KSHarp_E1_f1.wav", durationInSeconds: 2.418,
        keyLo: 30, keyHi: 31, rootKey: 30, velLo: 60, velHi: 127,
        loopMode: 1, loopStart: 100, loopEnd: 200,
        attack: 0.01, decay: 0.02, sustain: 0.5, release: 0.3, volume: -3.5, pan: 0.25, tune: -50},
    {sample: SAMPLE_A, fileName: "KSHarp_E1_f1.wav", durationInSeconds: 2.418,
        keyLo: 32, keyHi: 33, rootKey: 32, velLo: 0, velHi: 59,
        loopMode: 0, loopStart: 0, loopEnd: 0,
        attack: 0.005, decay: 0.2, sustain: 0.75, release: 0.9, volume: 1.5, pan: -0.75, tune: 25},
    {sample: SAMPLE_B, fileName: "KSHarp_E2_f1.wav", durationInSeconds: 2.105,
        keyLo: 34, keyHi: 35, rootKey: 34, velLo: 0, velHi: 127,
        loopMode: 0, loopStart: 0, loopEnd: 0,
        attack: 0.002, decay: 0.01, sustain: 0.9, release: 0.15, volume: -1, pan: 0.5, tune: 100}
]

// Mirrors studio-core's toSfzAttachment (packages/studio/core/src/sfz/SfzAttachment.ts). This package
// sits below studio-core, so the shared helper isn't importable here — keep the rounding in lockstep.
const toAttachment = (region: ManifestRegion, file: AudioFileBox): InstrumentFactories.SfzRegionAttachment[number] => ({
    file,
    keyLo: Math.round(region.keyLo), keyHi: Math.round(region.keyHi), rootKey: Math.round(region.rootKey),
    velLo: Math.round(region.velLo), velHi: Math.round(region.velHi),
    loopMode: region.loopMode, loopStart: Math.round(region.loopStart), loopEnd: Math.round(region.loopEnd),
    attack: region.attack, decay: region.decay, sustain: region.sustain, release: region.release,
    volume: region.volume, pan: region.pan, tune: region.tune
})

// Same shape of graph scripts/bake-sfz-presets.ts builds: instrument unit with MIDI capture, one
// AudioFileBox per unique sample keyed by the sample-store UUID, regions attached to one Sfz device.
const bakePreset = (name: string, regions: ReadonlyArray<ManifestRegion>): ArrayBuffer => {
    const source = ProjectSkeleton.empty({createDefaultUser: false, createOutputMaximizer: false})
    const {boxGraph} = source
    boxGraph.beginTransaction()
    const capture = CaptureMidiBox.create(boxGraph, UUID.generate())
    const unit = AudioUnitFactory.create(source, AudioUnitType.Instrument, Option.wrap(capture), 1)
    const files = new Map<string, AudioFileBox>()
    const attachment = regions.map(region => {
        const existing = files.get(region.sample)
        const file = isDefined(existing) ? existing : AudioFileBox.create(boxGraph, UUID.parse(region.sample), box => {
            box.startInSeconds.setValue(0)
            box.endInSeconds.setValue(region.durationInSeconds)
            box.fileName.setValue(region.fileName)
        })
        files.set(region.sample, file)
        return toAttachment(region, file)
    })
    InstrumentFactories.Sfz.create(boxGraph, unit.input, name, IconSymbol.Sfz, attachment)
    boxGraph.endTransaction()
    return PresetEncoder.encode(unit, {includeTimeline: false}) as ArrayBuffer
}

describe("SFZ preset baking round trip", () => {
    it("preserves sample UUIDs, dedupes shared samples, and carries every region field", () => {
        const presetBytes = bakePreset("Test Sfz", REGIONS)
        const target = ProjectSkeleton.empty({createDefaultUser: false, createOutputMaximizer: false})
        target.boxGraph.beginTransaction()
        const units = PresetDecoder.decode(presetBytes, target)
        target.boxGraph.endTransaction()
        expect(units.length).toBe(1)

        const devices = target.boxGraph.boxes().filter(box => box instanceof SfzDeviceBox)
        expect(devices.length).toBe(1)

        // The AudioFileBoxes keep their UUIDs — lazy loading resolves audio through these.
        const files = target.boxGraph.boxes().filter(box => box instanceof AudioFileBox)
        expect(files.length).toBe(2)
        const fileUuids = files.map(file => UUID.toString(file.address.uuid))
        expect(fileUuids).toContain(SAMPLE_A)
        expect(fileUuids).toContain(SAMPLE_B)

        const regionsByIndex = target.boxGraph.boxes()
            .filter(box => box instanceof SfzRegionBox)
            .map(box => asInstanceOf(box, SfzRegionBox))
            .sort((a, b) => a.regionIndex.getValue() - b.regionIndex.getValue())
        expect(regionsByIndex.length).toBe(REGIONS.length)

        regionsByIndex.forEach((regionBox, index) => {
            const expected = REGIONS[index]
            expect(regionBox.keyLo.getValue()).toBe(expected.keyLo)
            expect(regionBox.keyHi.getValue()).toBe(expected.keyHi)
            expect(regionBox.rootKey.getValue()).toBe(expected.rootKey)
            expect(regionBox.velLo.getValue()).toBe(expected.velLo)
            expect(regionBox.velHi.getValue()).toBe(expected.velHi)
            expect(regionBox.loopMode.getValue()).toBe(expected.loopMode)
            expect(regionBox.loopStart.getValue()).toBe(expected.loopStart)
            expect(regionBox.loopEnd.getValue()).toBe(expected.loopEnd)
            expect(regionBox.attack.getValue()).toBeCloseTo(expected.attack, 7)
            expect(regionBox.decay.getValue()).toBeCloseTo(expected.decay, 7)
            expect(regionBox.sustain.getValue()).toBeCloseTo(expected.sustain, 7)
            expect(regionBox.release.getValue()).toBeCloseTo(expected.release, 7)
            expect(regionBox.volume.getValue()).toBeCloseTo(expected.volume, 7)
            expect(regionBox.pan.getValue()).toBeCloseTo(expected.pan, 7)
            expect(regionBox.tune.getValue()).toBeCloseTo(expected.tune, 7)
            const file = asInstanceOf(regionBox.file.targetVertex.unwrap("region file").box, AudioFileBox)
            expect(UUID.toString(file.address.uuid)).toBe(expected.sample)
            expect(file.endInSeconds.getValue()).toBeCloseTo(expected.durationInSeconds, 7)
            expect(file.fileName.getValue()).toBe(expected.fileName)
        })
    })
})