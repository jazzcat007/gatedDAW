import css from "./SfzView.sass?inline"
import {createElement} from "@opendaw/lib-jsx"
import {Arrays, Exec, Lifecycle, Option} from "@opendaw/lib-std"
import {SfzInstrument} from "@opendaw/studio-adapters"
import {Colors, IconSymbol} from "@opendaw/studio-enums"
import {ContextMenu, MenuItem} from "@opendaw/studio-core"
import {Html} from "@opendaw/lib-dom"
import {DragAndDrop} from "@/ui/DragAndDrop"
import {SfzSelection} from "@/ui/browse/SfzSelection"
import {contextTargets} from "@/ui/browse/ResourceSelection"
import {ResourceMenus} from "@/ui/browse/ResourceMenus"
import {LocalTree} from "@/ui/browse/LocalTree"
import {FileIcon} from "@/ui/browse/FileIcon"
import {StudioService} from "@/service/StudioService"

const className = Html.adoptStyleSheet(css, "Sfz")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    sfzSelection: SfzSelection
    sfz: SfzInstrument
    tree: Option<LocalTree<SfzInstrument>>
    refresh: Exec
}

export const SfzView = ({lifecycle, sfzSelection, sfz, tree, refresh}: Construct) => {
    const {name, regions, samples, unsupportedOpcodes} = sfz
    const hasUnsupported = unsupportedOpcodes.length > 0
    const element: HTMLElement = (
        <div className={className}
             data-selection={JSON.stringify(sfz)}
             draggable>
            <div className="meta">
                <span className="name">
                    <FileIcon/>
                    {name}
                    {hasUnsupported && (
                        <span className="warning"
                              title={`Unsupported opcodes ignored: ${unsupportedOpcodes.join(", ")}`}>{"⚠"}</span>
                    )}
                </span>
                <span style={{textAlign: "right"}}>{regions} region{regions === 1 ? "" : "s"} / {samples} sample{samples === 1 ? "" : "s"}</span>
            </div>
        </div>
    )
    lifecycle.ownAll(
        DragAndDrop.installSource(element, () => ({type: "sfz", sfz})),
        ContextMenu.subscribe(element, collector => {
            const targets = contextTargets(element, sfz, () => sfzSelection.selected())
            collector.addItems(
                MenuItem.header({
                    label: targets.length > 1 ? `${targets.length} SFZ instruments` : name,
                    icon: IconSymbol.Sfz,
                    color: Colors.blue
                }),
                MenuItem.default({label: "Create SFZ Device"})
                    .setTriggerProcedure(() => sfzSelection.requestDevice(targets)),
                ...tree.mapOr(local => ResourceMenus.itemActions(
                        local, sfzSelection, targets, ({uuid}) => uuid, refresh),
                    Arrays.empty<MenuItem>()))
        })
    )
    return element
}
