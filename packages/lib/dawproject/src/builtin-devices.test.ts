import {describe, expect, it} from "vitest"
import {asInstanceOf} from "@opendaw/lib-std"
import {Xml} from "@opendaw/lib-xml"
import {
    CompressorSchema,
    EqualizerSchema,
    LimiterSchema,
    NoiseGateSchema,
    ProjectSchema,
    RealParameterSchema,
    TrackSchema,
    Unit
} from "./"

const projectWith = (devices: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Project version="1.0">
    <Structure>
        <Track contentType="audio" loaded="true" id="t1" name="Track">
            <Channel audioChannels="2" role="regular" id="c1">
                <Devices>${devices}</Devices>
            </Channel>
        </Track>
    </Structure>
</Project>`

const parseDevices = (devices: string) =>
    asInstanceOf(Xml.parse(projectWith(devices), ProjectSchema).structure[0], TrackSchema).channel?.devices ?? []

describe("builtin device schemas", () => {
    it("parses a Compressor", () => {
        const [device] = parseDevices(`
            <Compressor deviceRole="audioFX" deviceName="Comp" loaded="true" id="d1">
                <Threshold unit="decibel" value="-18.5" id="p1"/>
                <Ratio unit="linear" value="4.0" id="p2"/>
                <Attack unit="seconds" value="0.005" id="p3"/>
                <Release unit="seconds" value="0.25" id="p4"/>
                <InputGain unit="decibel" value="3.0" id="p5"/>
                <OutputGain unit="decibel" value="-2.0" id="p6"/>
                <AutoMakeup value="true" id="p7"/>
            </Compressor>`)
        const compressor = asInstanceOf(device, CompressorSchema)
        expect(compressor.deviceName).toBe("Comp")
        expect(compressor.threshold?.value).toBe(-18.5)
        expect(compressor.threshold?.unit).toBe(Unit.DECIBEL)
        expect(compressor.ratio?.value).toBe(4.0)
        expect(compressor.attack?.value).toBe(0.005)
        expect(compressor.attack?.unit).toBe(Unit.SECONDS)
        expect(compressor.release?.value).toBe(0.25)
        expect(compressor.inputGain?.value).toBe(3.0)
        expect(compressor.outputGain?.value).toBe(-2.0)
        expect(compressor.autoMakeup?.value).toBe(true)
    })

    it("parses a NoiseGate", () => {
        const [device] = parseDevices(`
            <NoiseGate deviceRole="audioFX" deviceName="Gate" loaded="true" id="d1">
                <Threshold unit="decibel" value="-40.0" id="p1"/>
                <Range unit="decibel" value="-60.0" id="p2"/>
                <Ratio unit="linear" value="10.0" id="p3"/>
                <Attack unit="seconds" value="0.001" id="p4"/>
                <Release unit="seconds" value="0.1" id="p5"/>
            </NoiseGate>`)
        const gate = asInstanceOf(device, NoiseGateSchema)
        expect(gate.threshold?.value).toBe(-40.0)
        expect(gate.range?.value).toBe(-60.0)
        expect(gate.ratio?.value).toBe(10.0)
        expect(gate.attack?.value).toBe(0.001)
        expect(gate.release?.value).toBe(0.1)
    })

    it("parses a Limiter", () => {
        const [device] = parseDevices(`
            <Limiter deviceRole="audioFX" deviceName="Limit" loaded="true" id="d1">
                <Threshold unit="decibel" value="-6.0" id="p1"/>
                <Attack unit="seconds" value="0.002" id="p2"/>
                <Release unit="seconds" value="0.05" id="p3"/>
                <InputGain unit="decibel" value="1.0" id="p4"/>
                <OutputGain unit="decibel" value="-1.0" id="p5"/>
            </Limiter>`)
        const limiter = asInstanceOf(device, LimiterSchema)
        expect(limiter.threshold?.value).toBe(-6.0)
        expect(limiter.attack?.value).toBe(0.002)
        expect(limiter.release?.value).toBe(0.05)
        expect(limiter.inputGain?.value).toBe(1.0)
        expect(limiter.outputGain?.value).toBe(-1.0)
    })

    it("parses Equalizer gains alongside its bands", () => {
        const [device] = parseDevices(`
            <Equalizer deviceRole="audioFX" deviceName="EQ+" loaded="true" id="d1">
                <Band type="bell" order="2">
                    <Freq unit="hertz" value="1000.0" id="p1"/>
                </Band>
                <InputGain unit="decibel" value="2.0" id="p2"/>
                <OutputGain unit="decibel" value="-3.0" id="p3"/>
            </Equalizer>`)
        const equalizer = asInstanceOf(device, EqualizerSchema)
        expect(equalizer.bands.length).toBe(1)
        expect(equalizer.inputGain?.value).toBe(2.0)
        expect(equalizer.outputGain?.value).toBe(-3.0)
    })

    it("keeps distinct device types apart in one chain", () => {
        const devices = parseDevices(`
            <Compressor deviceRole="audioFX" loaded="true" id="d1"/>
            <NoiseGate deviceRole="audioFX" loaded="true" id="d2"/>
            <Limiter deviceRole="audioFX" loaded="true" id="d3"/>`)
        expect(devices.length).toBe(3)
        expect(devices[0] instanceof CompressorSchema).true
        expect(devices[1] instanceof NoiseGateSchema).true
        expect(devices[2] instanceof LimiterSchema).true
    })

    it("serializes a Compressor back to its spec element name", () => {
        const compressor = Xml.element({
            id: "d1",
            deviceRole: "audioFX",
            deviceName: "Comp",
            loaded: true,
            threshold: Xml.element({id: "p1", value: -12.0, unit: Unit.DECIBEL}, RealParameterSchema)
        }, CompressorSchema)
        const xml = Xml.pretty(Xml.toElement("Compressor", compressor))
        expect(xml).toContain("<Compressor")
        expect(xml).toContain("<Threshold")
        const parsed = Xml.parse(xml, CompressorSchema)
        expect(parsed.deviceName).toBe("Comp")
        expect(parsed.threshold?.value).toBe(-12.0)
    })
})
