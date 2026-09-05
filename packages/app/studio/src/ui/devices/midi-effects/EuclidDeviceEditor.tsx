import css from "./EuclidDeviceEditor.sass?inline"
import {DeviceHost, EuclidDeviceBoxAdapter} from "@opendaw/studio-adapters"
import {Lifecycle} from "@opendaw/lib-std"
import {DeviceEditor} from "@/ui/devices/DeviceEditor.tsx"
import {MenuItems} from "@/ui/devices/menu-items.ts"
import {createElement} from "@opendaw/lib-jsx"
import {ControlBuilder} from "@/ui/devices/ControlBuilder.tsx"
import {DeviceMidiMeter} from "@/ui/devices/panel/DeviceMidiMeter.tsx"
import {Html} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService"
import {EffectFactories} from "@opendaw/studio-core"

const className = Html.adoptStyleSheet(css, "EuclidDeviceEditor")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    adapter: EuclidDeviceBoxAdapter
    deviceHost: DeviceHost
}

type PreviewConstruct = Pick<Construct, "lifecycle" | "adapter">

const EuclidPatternPreview = ({lifecycle, adapter}: PreviewConstruct) => {
    const {steps, pulses, rotation} = adapter.namedParameter
    const cells: Array<HTMLDivElement> = []
    return (
        <div className="pattern-preview"
             aria-label="Euclidean pattern preview"
             onInit={() => {
                 const update = () => {
                     const length = Math.max(1, steps.getControlledValue())
                     const triggerCount = Math.min(pulses.getControlledValue(), length)
                     const offset = ((rotation.getControlledValue() % length) + length) % length
                     cells.forEach((cell, index) => {
                         const active = index < length
                             && Math.floor(((index + offset + 1) * triggerCount) / length)
                             !== Math.floor(((index + offset) * triggerCount) / length)
                         cell.classList.toggle("active", active)
                         cell.classList.toggle("hidden", index >= length)
                     })
                 }
                 lifecycle.own(steps.catchupAndSubscribe(update))
                 lifecycle.own(pulses.catchupAndSubscribe(update))
                 lifecycle.own(rotation.catchupAndSubscribe(update))
             }}>
            {Array.from({length: 64}, (_, index) => (
                <div className="step" onInit={cell => cells[index] = cell}/>
            ))}
        </div>
    )
}

export const EuclidDeviceEditor = ({lifecycle, service, adapter, deviceHost}: Construct) => {
    const {project} = service
    const {editing, midiLearning} = project
    return (
        <DeviceEditor lifecycle={lifecycle}
                      service={service}
                      adapter={adapter}
                      populateMenu={parent => MenuItems.forEffectDevice(parent, service, deviceHost, adapter)}
                      populateControls={() => (
                          <div className={className}>
                              <EuclidPatternPreview lifecycle={lifecycle} adapter={adapter}/>
                              {Object.values(adapter.namedParameter).map(parameter => ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter
                              }))}
                          </div>
                      )}
                      populateMeter={() => (
                          <DeviceMidiMeter lifecycle={lifecycle}
                                           receiver={project.liveStreamReceiver}
                                           address={adapter.address}/>
                      )}
                      icon={EffectFactories.MidiNamed.Euclid.defaultIcon}/>
    )
}
