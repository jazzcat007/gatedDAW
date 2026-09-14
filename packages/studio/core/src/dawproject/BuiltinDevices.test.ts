import {describe, expect, it} from "vitest"
import {panic} from "@opendaw/lib-std"
import {Xml} from "@opendaw/lib-xml"
import {ProjectSchema} from "@opendaw/lib-dawproject"
import {CompressorDeviceBox, GateDeviceBox, MaximizerDeviceBox} from "@opendaw/studio-boxes"
import {DawProject} from "./DawProject"
import {DawProjectImport} from "./DawProjectImporter"

const noResources: DawProject.ResourceProvider = {
    fromPath: () => panic("No resources"),
    fromUUID: () => panic("No resources")
}

const projectXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project version="1.0">
    <Transport>
        <Tempo max="666.0" min="20.0" unit="bpm" value="120.0" id="tempo"/>
        <TimeSignature denominator="4" numerator="4" id="signature"/>
    </Transport>
    <Structure>
        <Track contentType="audio" loaded="true" id="track-0" name="Track">
            <Channel audioChannels="2" destination="master-channel" role="regular" solo="false" id="channel-0">
                <Devices>
                    <Compressor deviceRole="audioFX" deviceName="Comp" loaded="true" id="dev-0">
                        <Threshold unit="decibel" value="-18.0" id="c-thr"/>
                        <Ratio unit="linear" value="4.0" id="c-ratio"/>
                        <Attack unit="seconds" value="0.005" id="c-atk"/>
                        <Release unit="seconds" value="0.25" id="c-rel"/>
                        <InputGain unit="decibel" value="3.0" id="c-in"/>
                        <OutputGain unit="decibel" value="-2.0" id="c-out"/>
                        <AutoMakeup value="true" id="c-auto"/>
                    </Compressor>
                    <NoiseGate deviceRole="audioFX" deviceName="Gate" loaded="true" id="dev-1">
                        <Threshold unit="decibel" value="-40.0" id="g-thr"/>
                        <Range unit="decibel" value="-60.0" id="g-range"/>
                        <Attack unit="seconds" value="0.001" id="g-atk"/>
                        <Release unit="seconds" value="0.1" id="g-rel"/>
                    </NoiseGate>
                    <Limiter deviceRole="audioFX" deviceName="Limit" loaded="true" id="dev-2">
                        <Threshold unit="decibel" value="-6.0" id="l-thr"/>
                    </Limiter>
                </Devices>
                <Volume max="2.0" min="0.0" unit="linear" value="1.0" id="vol-0" name="Volume"/>
            </Channel>
        </Track>
        <Track contentType="audio notes" loaded="true" id="master-track" name="Master">
            <Channel audioChannels="2" role="master" solo="false" id="master-channel">
                <Volume max="2.0" min="0.0" unit="linear" value="1.0" id="master-volume" name="Volume"/>
            </Channel>
        </Track>
    </Structure>
</Project>`

const readBoxes = async () => {
    const {skeleton} = await DawProjectImport.read(Xml.parse(projectXml, ProjectSchema), noResources)
    return skeleton.boxGraph.boxes()
}

describe("DAWproject builtin devices map to native devices", () => {
    it("maps Compressor onto CompressorDeviceBox", async () => {
        const [box] = (await readBoxes()).filter(box => box instanceof CompressorDeviceBox)
        expect(box).toBeDefined()
        expect(box.label.getValue()).toBe("Comp")
        expect(box.threshold.getValue()).toBe(-18.0)
        expect(box.ratio.getValue()).toBe(4.0)
        expect(box.attack.getValue()).toBe(5.0)
        expect(box.release.getValue()).toBe(250.0)
        expect(box.inputgain.getValue()).toBe(3.0)
        expect(box.makeup.getValue()).toBe(-2.0)
        expect(box.automakeup.getValue()).toBe(true)
    })

    it("maps NoiseGate onto GateDeviceBox", async () => {
        const [box] = (await readBoxes()).filter(box => box instanceof GateDeviceBox)
        expect(box).toBeDefined()
        expect(box.label.getValue()).toBe("Gate")
        expect(box.threshold.getValue()).toBe(-40.0)
        expect(box.attack.getValue()).toBe(1.0)
        expect(box.release.getValue()).toBe(100.0)
        expect(box.floor.getValue()).toBe(-60.0)
    })

    it("maps Limiter onto MaximizerDeviceBox", async () => {
        const [box] = (await readBoxes()).filter(box => box instanceof MaximizerDeviceBox)
        expect(box).toBeDefined()
        expect(box.label.getValue()).toBe("Limit")
        expect(box.threshold.getValue()).toBe(-6.0)
    })

    it("clamps values that fall outside the native parameter range", async () => {
        const clampedXml = projectXml.replace('unit="decibel" value="-18.0" id="c-thr"',
            'unit="decibel" value="-90.0" id="c-thr"')
        const {skeleton} = await DawProjectImport.read(Xml.parse(clampedXml, ProjectSchema), noResources)
        const [box] = skeleton.boxGraph.boxes().filter(box => box instanceof CompressorDeviceBox)
        expect(box.threshold.getValue()).toBe(-60.0)
    })

    it("orders the mapped devices as they appear in the chain", async () => {
        const boxes = await readBoxes()
        const indexOf = (type: Function) =>
            boxes.filter(box => box instanceof type).map(box => (box as any).index.getValue())[0]
        expect(indexOf(CompressorDeviceBox)).toBe(0)
        expect(indexOf(GateDeviceBox)).toBe(1)
        expect(indexOf(MaximizerDeviceBox)).toBe(2)
    })
})
