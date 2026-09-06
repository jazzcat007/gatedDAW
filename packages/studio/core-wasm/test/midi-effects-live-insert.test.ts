import {describe, expect, it} from "vitest"
import {UUID} from "@opendaw/lib-std"
import {
    ApparatDeviceBox,
    ArpeggioDeviceBox,
    AudioUnitBox,
    ChordDeviceBox,
    EuclidDeviceBox,
    GrooveShuffleBox,
    KadenzDeviceBox,
    PitchDeviceBox,
    SpielwerkDeviceBox,
    VelocityDeviceBox,
    ZeitgeistDeviceBox
} from "@opendaw/studio-boxes"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {loadFullEngine} from "./helpers/load-full-engine"
import {connectSyncToEngine} from "./helpers/connect-sync"

describe("midi effects live insert", () => {
    it("accepts adding every stock MIDI effect after the engine is already synced", async () => {
        const {boxGraph: source, mandatoryBoxes: {rootBox, primaryAudioBusBox}} =
            ProjectSkeleton.empty({createOutputMaximizer: false, createDefaultUser: false})
        source.beginTransaction()
        const unit = AudioUnitBox.create(source, UUID.generate(), box => {
            box.collection.refer(rootBox.audioUnits)
            box.output.refer(primaryAudioBusBox.input)
            box.index.setValue(1)
        })
        ApparatDeviceBox.create(source, UUID.generate(), box => box.host.refer(unit.input))
        source.endTransaction()

        const {engine, memory} = await loadFullEngine()
        const sync = connectSyncToEngine(engine, memory, source)
        await sync.settle()
        engine.bind()

        const cases: ReadonlyArray<readonly [string, (index: number) => void]> = [
            ["Arpeggio", index => ArpeggioDeviceBox.create(source, UUID.generate(), box => {
                box.host.refer(unit.midiEffects)
                box.index.setValue(index)
                box.label.setValue("Arpeggio")
            })],
            ["Chord", index => ChordDeviceBox.create(source, UUID.generate(), box => {
                box.host.refer(unit.midiEffects)
                box.index.setValue(index)
                box.label.setValue("Chord")
            })],
            ["Euclid", index => EuclidDeviceBox.create(source, UUID.generate(), box => {
                box.host.refer(unit.midiEffects)
                box.index.setValue(index)
                box.label.setValue("Euclid")
            })],
            ["Kadenz", index => KadenzDeviceBox.create(source, UUID.generate(), box => {
                box.host.refer(unit.midiEffects)
                box.index.setValue(index)
                box.label.setValue("Kadenz")
            })],
            ["Pitch", index => PitchDeviceBox.create(source, UUID.generate(), box => {
                box.host.refer(unit.midiEffects)
                box.index.setValue(index)
                box.label.setValue("Pitch")
            })],
            ["Velocity", index => VelocityDeviceBox.create(source, UUID.generate(), box => {
                box.host.refer(unit.midiEffects)
                box.index.setValue(index)
                box.label.setValue("Velocity")
            })],
            ["Zeitgeist", index => {
                const groove = GrooveShuffleBox.create(source, UUID.generate(), grooveBox => {
                    grooveBox.label.setValue("Shuffle")
                    grooveBox.duration.setValue(480)
                })
                ZeitgeistDeviceBox.create(source, UUID.generate(), box => {
                    box.host.refer(unit.midiEffects)
                    box.groove.refer(groove)
                    box.index.setValue(index)
                    box.label.setValue("Zeitgeist")
                })
            }],
            ["Spielwerk", index => SpielwerkDeviceBox.create(source, UUID.generate(), box => {
                box.host.refer(unit.midiEffects)
                box.index.setValue(index)
                box.label.setValue("Spielwerk")
            })]
        ]

        for (const [label, create] of cases) {
            source.beginTransaction()
            create(cases.findIndex(([name]) => name === label))
            source.endTransaction()
            await expect(sync.settle(), label).resolves.toBeUndefined()
        }
        sync.close()
    }, 60000)
})
