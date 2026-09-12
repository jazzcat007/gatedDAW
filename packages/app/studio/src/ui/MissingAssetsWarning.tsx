import css from "./MissingAssetsWarning.sass?inline"
import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {IconSymbol} from "@opendaw/studio-enums"
import {Icon} from "@/ui/components/Icon"
import {MissingAssetEntry} from "@opendaw/studio-core"

const className = Html.adoptStyleSheet(css, "MissingAssetsWarning")

type Construct = {
    anchor: HTMLElement
    entries: ReadonlyArray<MissingAssetEntry>
    // Resolves one entry (browses for a replacement, imports it); the caller removes the row on success.
    onResolve: (entry: MissingAssetEntry) => Promise<boolean>
}

// Deliberately re-created (not patched in place) whenever the entry list changes — Footer.tsx just swaps
// the whole panel out, which keeps this a plain, stateless render function like LatencyWarning.
export const MissingAssetsWarning = ({anchor, entries, onResolve}: Construct) => {
    const rect = anchor.getBoundingClientRect()
    return (
        <div className={className} style={{
            left: `${rect.left}px`,
            bottom: `${window.innerHeight - rect.top + 10}px`
        }}>
            <div className="header">
                <Icon symbol={IconSymbol.Warning}/>
                <span>{entries.length} missing asset{entries.length === 1 ? "" : "s"}</span>
            </div>
            <div className="list">
                {entries.map(entry => {
                    const button: HTMLElement = <button>Browse…</button>
                    button.onclick = async () => {
                        button.setAttribute("disabled", "")
                        const resolved = await onResolve(entry)
                        if (!resolved) {button.removeAttribute("disabled")}
                    }
                    return (
                        <div className="row">
                            <span className="name" title={entry.fileName}>{entry.fileName}</span>
                            <span className="kind">{entry.kind}</span>
                            {button}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
