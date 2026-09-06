import {describe, expect, it} from "vitest"
import {UUID} from "@opendaw/lib-std"
import {ApparatDeviceBox, AudioUnitBox, ChordDeviceBox} from "@opendaw/studio-boxes"
import {ProjectSkeleton} from "@opendaw/studio-adapters"
import {loadFullEngine} from "./helpers/load-full-engine"
import {connectSyncToEngine} from "./helpers/connect-sync"

describe("chord live insert", () => {
    it("accepts adding a ChordDeviceBox after the engine is already synced", async () => {
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

        source.beginTransaction()
        const chord = ChordDeviceBox.create(source, UUID.generate(), box => {
            box.host.refer(unit.midiEffects)
            box.index.setValue(0)
            box.label.setValue("Chord")
        })
        source.endTransaction()

        await expect(sync.settle()).resolves.toBeUndefined()

        const updates = [
            () => chord.key.setValue(7),
            () => chord.scaleIndex.setValue(2),
            () => chord.degree.setValue(-2),
            () => chord.numNotes.setValue(6),
            () => chord.inversion.setValue(2),
            () => chord.spread.setValue(3),
            () => chord.octave.setValue(1),
            () => chord.strum.setValue(120.0),
            () => chord.velocity.setValue(0.5)
        ]
        for (const update of updates) {
            source.beginTransaction()
            update()
            source.endTransaction()
            await expect(sync.settle()).resolves.toBeUndefined()
        }
        sync.close()
    }, 60000)
})
