import css from "./SfzBrowser.sass?inline"
import {DefaultObservableValue, Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {OpenSfzAPI} from "@/opendaw-api"
import {StudioService} from "@/service/StudioService.ts"
import {SfzView} from "@/ui/browse/SfzView"
import {AssetLocation} from "@/ui/browse/AssetLocation"
import {HTMLSelection} from "@/ui/HTMLSelection"
import {SfzSelection} from "@/ui/browse/SfzSelection"
import {ResourceBrowser} from "@/ui/browse/ResourceBrowser"
import {SfzInstrument} from "@opendaw/studio-adapters"
import {SfzIndex, SfzIndexFolder} from "@/opendaw-api/SfzIndex"
import {ResourceBrowserConfig} from "@/ui/browse/ResourceBrowserConfig"
import {ResourceFolder} from "@/ui/browse/ResourceFolder"

const className = Html.adoptStyleSheet(css, "SfzBrowser")

const toResourceFolder = (folder: SfzIndexFolder): ResourceFolder<SfzInstrument> => ({
    name: folder.name,
    folders: folder.folders?.map(toResourceFolder) ?? [],
    items: folder.instruments?.map(SfzIndex.asSfzInstrument) ?? []
})

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    background?: boolean
    fontSize?: string // em
}

const location = new DefaultObservableValue(AssetLocation.OpenDAW)
const expandedKeys = new Set<string>()

// Server-hosted factory catalog only — there is no local/user-imported SFZ storage yet (unlike Soundfont's
// SoundfontStorage), so fetchLocal always reports empty and fetchLocalTree is omitted.
export const SfzBrowser = ({lifecycle, service, background, fontSize}: Construct) => {
    const config: ResourceBrowserConfig<SfzInstrument> = {
        name: "sfz",
        headers: [
            {label: "Name"},
            {label: "Regions", align: "right"}
        ],
        fetchOnline: async () => ({
            name: "",
            folders: (await OpenSfzAPI.get().tree()).folders.map(toResourceFolder),
            items: []
        }),
        expandedKeys,
        fetchLocal: async () => [],
        dragType: "sfz",
        renderEntry: ({lifecycle: entryLifecycle, service: entryService, selection, item, tree, refresh}) => (
            <SfzView
                lifecycle={entryLifecycle}
                service={entryService}
                sfzSelection={selection as SfzSelection}
                sfz={item}
                tree={tree}
                refresh={refresh}
            />
        ),
        resolveEntryName: (sfz: SfzInstrument) => sfz.name,
        resolveEntryUuid: (sfz: SfzInstrument) => sfz.uuid,
        createSelection: (svc: StudioService, htmlSelection: HTMLSelection) => new SfzSelection(svc, htmlSelection),
        importSignal: "import-sfz"
    }
    return (
        <ResourceBrowser
            lifecycle={lifecycle}
            service={service}
            config={config}
            className={className}
            background={background}
            fontSize={fontSize}
            location={location}
        />
    )
}
