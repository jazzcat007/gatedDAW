import {beforeEach, describe, expect, it, vi} from "vitest"
import {isDefined, RuntimeNotification, RuntimeNotifier, UUID} from "@opendaw/lib-std"
import {PPQN, TimeBase} from "@opendaw/lib-dsp"
import {AudioFileBox, AudioRegionBox, TrackBox, ValueEventCollectionBox} from "@opendaw/studio-boxes"
import {ProjectSkeleton, Sample, TrackType} from "@opendaw/studio-adapters"
import {AssetService} from "./AssetService"
import {FilePickerAcceptTypes} from "./FilePickerAcceptTypes"

vi.mock("@opendaw/lib-dom", async importOriginal => {
    const actual = await importOriginal<typeof import("@opendaw/lib-dom")>()
    return {...actual, Files: {open: vi.fn()}}
})
import {Files} from "@opendaw/lib-dom"

const fakeFile = (name: string): File => ({name, arrayBuffer: async () => new ArrayBuffer(4)}) as unknown as File

// Reproduces live error 1096 (TypeError: Failed to fetch). Opening a project runs replaceMissingFiles, which
// awaits the stock catalog over the network. A rejected fetch escaped all the way out of
// ProjectProfileService.load, leaving the "Loading..." monolog on screen forever. The catalog must not be
// degraded to an empty list either: every stock asset would then look missing and open a browse dialog.

if (!isDefined(Reflect.get(globalThis, "AudioWorkletNode"))) {
    Reflect.set(globalThis, "AudioWorkletNode", class {})
}

const approvals: Array<string> = []
RuntimeNotifier.install({
    info: async () => {},
    approve: async (request: RuntimeNotification.ApproveRequest) => {
        approvals.push(request.message)
        return false
    },
    progress: () => ({message: "", terminate: () => {}}),
    notify: () => {}
})

class TestSampleService extends AssetService<Sample, void> {
    protected readonly nameSingular: string = "Sample"
    protected readonly namePlural: string = "Samples"
    protected readonly boxType = AudioFileBox
    protected readonly filePickerOptions: FilePickerOptions = FilePickerAcceptTypes.WavFiles

    constructor(readonly catalog: () => Promise<ReadonlyArray<Sample>>,
                private readonly onImport: () => Promise<Sample> = () => Promise.reject("not expected")) {super()}

    async importFile(): Promise<Sample> {return this.onImport()}

    protected async collectAllFiles(): Promise<ReadonlyArray<Sample>> {return this.catalog()}
}

const createGraphWithMissingFile = () => {
    const {boxGraph, mandatoryBoxes: {primaryAudioUnitBox}} =
        ProjectSkeleton.empty({createDefaultUser: true, createOutputMaximizer: false})
    boxGraph.beginTransaction()
    const trackBox = TrackBox.create(boxGraph, UUID.generate(), box => {
        box.type.setValue(TrackType.Audio)
        box.tracks.refer(primaryAudioUnitBox.tracks)
        box.target.refer(primaryAudioUnitBox)
    })
    const audioFileBox = AudioFileBox.create(boxGraph, UUID.generate(), box => {
        box.fileName.setValue("missing.wav")
        box.endInSeconds.setValue(1.0)
    })
    const events = ValueEventCollectionBox.create(boxGraph, UUID.generate())
    AudioRegionBox.create(boxGraph, UUID.generate(), box => {
        box.position.setValue(0)
        box.duration.setValue(PPQN.Bar)
        box.loopDuration.setValue(PPQN.Bar)
        box.timeBase.setValue(TimeBase.Musical)
        box.regions.refer(trackBox.regions)
        box.file.refer(audioFileBox)
        box.events.refer(events.owners)
    })
    boxGraph.endTransaction()
    return boxGraph
}

const manager = {invalidate: () => {}}

describe("replaceMissingFiles with an unreachable catalog (live error 1096)", () => {
    it("resolves instead of rejecting when the catalog fetch fails", async () => {
        approvals.length = 0
        const service = new TestSampleService(() => Promise.reject(new TypeError("Failed to fetch")))
        await expect(service.replaceMissingFiles(createGraphWithMissingFile(), manager)).resolves.toEqual([])
    })

    it("does not report stock assets as missing when the catalog is unreachable", async () => {
        approvals.length = 0
        const service = new TestSampleService(() => Promise.reject(new TypeError("Failed to fetch")))
        await service.replaceMissingFiles(createGraphWithMissingFile(), manager)
        expect(approvals).toEqual([])
    })

    it("still asks about a genuinely missing file when the catalog is reachable", async () => {
        approvals.length = 0
        const service = new TestSampleService(() => Promise.resolve([]))
        await service.replaceMissingFiles(createGraphWithMissingFile(), manager)
        expect(approvals).toHaveLength(1)
        expect(approvals[0]).toContain("missing.wav")
    })
})

// The actual DrawnIn-style regression: a project referencing many unavailable samples used to block behind
// one "Missing Asset" confirm dialog per file before the project was even visible. `prompt: false` is what
// ProjectProfileService now uses to open the workspace first and resolve assets in the background instead.
describe("replaceMissingFiles with prompt: false", () => {
    beforeEach(() => {approvals.length = 0})

    it("never shows a dialog, and reports every missing file instead", async () => {
        const service = new TestSampleService(() => Promise.resolve([]))
        const missing = await service.replaceMissingFiles(createGraphWithMissingFile(), manager, {prompt: false})
        expect(approvals).toEqual([])
        expect(missing).toHaveLength(1)
        expect(missing[0].fileName).toBe("missing.wav")
    })

    it("reports nothing missing when every referenced file is actually available", async () => {
        const graph = createGraphWithMissingFile()
        const [box] = graph.boxes().filter(candidate => candidate instanceof AudioFileBox)
        const service = new TestSampleService(async () => [{uuid: UUID.toString(box.address.uuid)} as Sample])
        const missing = await service.replaceMissingFiles(graph, manager, {prompt: false})
        expect(missing).toEqual([])
    })

    it("still returns [] (not undefined) when the catalog is unreachable", async () => {
        const service = new TestSampleService(() => Promise.reject(new TypeError("Failed to fetch")))
        const missing = await service.replaceMissingFiles(createGraphWithMissingFile(), manager, {prompt: false})
        expect(missing).toEqual([])
        expect(approvals).toEqual([])
    })
})

describe("resolveOne", () => {
    beforeEach(() => {
        approvals.length = 0
        vi.mocked(Files.open).mockReset()
    })

    it("imports the browsed file and invalidates the loader entry on success", async () => {
        vi.mocked(Files.open).mockResolvedValueOnce([fakeFile("replacement.wav")])
        const service = new TestSampleService(() => Promise.resolve([]),
            async () => ({name: "replacement.wav"}) as Sample)
        const invalidated: Array<string> = []
        const uuid = UUID.generate()
        const resolved = await service.resolveOne(uuid, "missing.wav", {
            invalidate: id => invalidated.push(UUID.toString(id))
        })
        expect(resolved).toBe(true)
        expect(invalidated).toEqual([UUID.toString(uuid)])
    })

    it("returns false without invalidating anything when the user cancels the file picker", async () => {
        vi.mocked(Files.open).mockResolvedValueOnce([])
        const service = new TestSampleService(() => Promise.resolve([]))
        const invalidated: Array<string> = []
        const resolved = await service.resolveOne(UUID.generate(), "missing.wav", {
            invalidate: id => invalidated.push(UUID.toString(id))
        })
        expect(resolved).toBe(false)
        expect(invalidated).toEqual([])
    })

    it("returns false when the import itself fails", async () => {
        vi.mocked(Files.open).mockResolvedValueOnce([fakeFile("bad.wav")])
        const service = new TestSampleService(() => Promise.resolve([]), () => Promise.reject("boom"))
        const resolved = await service.resolveOne(UUID.generate(), "missing.wav", {invalidate: () => {}})
        expect(resolved).toBe(false)
    })
})
