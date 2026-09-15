import css from "./SfzDeviceEditor.sass?inline"
import {Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {DeviceEditor} from "@/ui/devices/DeviceEditor.tsx"
import {MenuItems} from "@/ui/devices/menu-items.ts"
import {DeviceHost, InstrumentFactories, SfzDeviceBoxAdapter} from "@opendaw/studio-adapters"
import {DevicePeakMeter} from "@/ui/devices/panel/DevicePeakMeter.tsx"
import {Html} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService"
import {Icon} from "@/ui/components/Icon"
import {FlexSpacer} from "@/ui/components/FlexSpacer"
import {IconSymbol} from "@opendaw/studio-enums"
import {SfzImportTrigger} from "./Sfz/SfzImportTrigger"
import {limitSfzRegions, StudioPreferences} from "@opendaw/studio-core"

const className = Html.adoptStyleSheet(css, "editor")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    adapter: SfzDeviceBoxAdapter
    deviceHost: DeviceHost
}

export const SfzDeviceEditor = ({lifecycle, service, adapter, deviceHost}: Construct) => {
    const labelRegionCount: HTMLElement = <span/>
    let regionLimit = StudioPreferences.settings.engine["sfz-region-limit"]
    const pruneButton: HTMLButtonElement = (
        <button onclick={() => {
            const current = adapter.regions.adapters()
            // limitSfzRegions may widen the surviving entries' keyLo/keyHi to close gaps left by the
            // regions it drops (see SfzAttachment.ts) -- wrap each adapter in a plain range record rather
            // than passing adapters directly, since spreading a class instance to apply that override would
            // only copy its own enumerable properties and silently drop everything defined via getters.
            const ranges = current.map(region => ({
                region, keyLo: region.keyLo, keyHi: region.keyHi, velLo: region.velLo, velHi: region.velHi
            }))
            const kept = limitSfzRegions(ranges, regionLimit)
            const keepRegions = new Set(kept.map(entry => entry.region))
            service.project.editing.modify(() => {
                current.filter(region => !keepRegions.has(region)).forEach(region => region.box.delete())
                kept.forEach(({region, keyLo, keyHi}) => {
                    if (region.keyLo !== keyLo) {region.box.keyLo.setValue(keyLo)}
                    if (region.keyHi !== keyHi) {region.box.keyHi.setValue(keyHi)}
                })
            })
        }}/>
    )
    const updateRegionCount = () => {
        const count = adapter.regions.adapters().length
        labelRegionCount.textContent = `${count} region(s)`
        pruneButton.textContent = `Prune to ${regionLimit} regions`
        pruneButton.hidden = count <= regionLimit
    }
    lifecycle.own(adapter.regions.catchupAndSubscribe({
        onAdd: updateRegionCount,
        onRemove: updateRegionCount,
        onReorder: () => {}
    }))
    lifecycle.own(StudioPreferences.catchupAndSubscribe(limit => {
        regionLimit = limit
        updateRegionCount()
    }, "engine", "sfz-region-limit"))
    return (
        <DeviceEditor lifecycle={lifecycle}
                      service={service}
                      adapter={adapter}
                      populateMenu={parent => MenuItems.forAudioUnitInput(parent, service, deviceHost)}
                      populateControls={() => (
                          <div className={className}>
                              <FlexSpacer pixels={2}/>
                              <header>
                                  <Icon symbol={IconSymbol.Sfz}/>
                                  <h1>SFZ</h1>
                              </header>
                              <div className="label">
                                  {labelRegionCount}
                              </div>
                              <button onclick={() => SfzImportTrigger.run(service, adapter)}>
                                  Load SFZ...
                              </button>
                              {pruneButton}
                          </div>
                      )}
                      populateMeter={() => (
                          <DevicePeakMeter lifecycle={lifecycle}
                                           receiver={service.project.liveStreamReceiver}
                                           address={adapter.address}/>
                      )}
                      icon={InstrumentFactories.Sfz.defaultIcon}/>
    )
}
