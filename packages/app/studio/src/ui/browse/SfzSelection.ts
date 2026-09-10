import {Arrays, asDefined, isAbsent, RuntimeNotifier, UUID} from "@opendaw/lib-std"
import {InstrumentFactories, SfzInstrument} from "@opendaw/studio-adapters"
import {toSfzAttachment} from "@opendaw/studio-core"
import {AudioFileBox} from "@opendaw/studio-boxes"
import {Promises} from "@opendaw/lib-runtime"
import {OpenSfzAPI, SfzManifestRegion} from "@/opendaw-api"
import {HTMLSelection} from "@/ui/HTMLSelection"
import {StudioService} from "@/service/StudioService"
import {ResourceSelection} from "@/ui/browse/ResourceSelection"

// Creating a catalog instrument fetches one small manifest and no audio at all: every region's AudioFileBox
// is built from the importer's server-side probe (sample uuid, filename, duration), and the bytes are pulled
// later by GlobalSampleLoaderManager the first time a note actually needs them.
export class SfzSelection implements ResourceSelection<SfzInstrument> {
    readonly #service: StudioService
    readonly #selection: HTMLSelection

    constructor(service: StudioService, selection: HTMLSelection) {
        this.#service = service
        this.#selection = selection
    }

    async requestDevice(instruments: ReadonlyArray<SfzInstrument>): Promise<void> {
        const [sfz] = instruments
        if (isAbsent(sfz)) {return}
        if (!this.#service.hasProfile) {
            await this.#service.newProject()
            if (!this.#service.hasProfile) {return}
        }
        const {status, value: manifest, error} = await Promises.tryCatch(
            OpenSfzAPI.get().loadRegions(UUID.parse(sfz.uuid)))
        if (status === "rejected") {
            console.warn(`SFZ import: failed to load '${sfz.name}':`, error)
            RuntimeNotifier.notify({message: "Cannot load SFZ instrument.", icon: "Warning"})
            return
        }
        if (manifest.regions.length === 0) {
            RuntimeNotifier.notify({message: "SFZ instrument has no loadable regions.", icon: "Warning"})
            return
        }
        if (manifest.unsupportedOpcodes.length > 0) {
            console.warn(`SFZ import: unsupported opcodes ignored: ${manifest.unsupportedOpcodes.join(", ")}`)
        }
        const {api, editing} = this.#service.project
        editing.modify(() => {
            const attachment = this.#toAttachment(manifest.regions)
            api.createInstrument(InstrumentFactories.Sfz, {attachment})
        })
    }

    #toAttachment(regions: ReadonlyArray<SfzManifestRegion>): InstrumentFactories.SfzRegionAttachment {
        const {boxGraph} = this.#service.project
        const files = UUID.newSet<{uuid: UUID.Bytes, box: AudioFileBox}>(entry => entry.uuid)
        const fileFor = (region: SfzManifestRegion): AudioFileBox => {
            const uuid = UUID.parse(region.sample)
            return files.getOrCreate(uuid, () => ({
                uuid,
                // The sample uuid is the box uuid by design: it is the identity the loader resolves against
                // the catalog's sample store, and the identity a preset must preserve to stay playable.
                box: boxGraph.findBox<AudioFileBox>(uuid).unwrapOrElse(() =>
                    AudioFileBox.create(boxGraph, uuid, box => {
                        box.fileName.setValue(region.fileName)
                        box.startInSeconds.setValue(0.0)
                        box.endInSeconds.setValue(region.durationInSeconds)
                    }))
            })).box
        }
        return regions.map(region => toSfzAttachment({...region, defaultPath: ""}, fileFor(region)))
    }

    async deleteItems(_instruments: ReadonlyArray<SfzInstrument>): Promise<ReadonlyArray<SfzInstrument>> {
        // Every entry here is server-hosted factory content (origin "openDAW"); there is no local SFZ
        // storage yet to delete from.
        return Arrays.empty()
    }

    selected(): ReadonlyArray<SfzInstrument> {
        const selected = this.#selection.getSelected()
        return selected.map(element =>
            JSON.parse(asDefined(element.getAttribute("data-selection"))) as SfzInstrument)
    }
}
