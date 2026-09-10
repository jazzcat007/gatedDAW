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

const className = Html.adoptStyleSheet(css, "editor")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    adapter: SfzDeviceBoxAdapter
    deviceHost: DeviceHost
}

export const SfzDeviceEditor = ({lifecycle, service, adapter, deviceHost}: Construct) => {
    const labelRegionCount: HTMLElement = <span/>
    const updateRegionCount = () => labelRegionCount.textContent = `${adapter.regions.adapters().length} region(s)`
    lifecycle.own(adapter.regions.catchupAndSubscribe({
        onAdd: updateRegionCount,
        onRemove: updateRegionCount,
        onReorder: () => {}
    }))
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
