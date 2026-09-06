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
    return (
        <div className="pattern-preview"
             aria-label="Euclidean pattern preview"
             onInit={element => {
                 const cells = Array.from({length: 64}, () => {
                     const cell = document.createElement("div")
                     cell.className = "step"
                     element.appendChild(cell)
                     return cell
                 })
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
             }}/>
    )
}

export const EuclidDeviceEditor = ({lifecycle, service, adapter, deviceHost}: Construct) => {
    const {project} = service
    const {editing, midiLearning} = project
    const {steps, pulses, rotation, rate, gate, pitch, velocity} = adapter.namedParameter
    return (
        <DeviceEditor lifecycle={lifecycle}
                      service={service}
                      adapter={adapter}
                      populateMenu={parent => MenuItems.forEffectDevice(parent, service, deviceHost, adapter)}
                      populateControls={() => (
                          <div className={className}>
                              <EuclidPatternPreview lifecycle={lifecycle} adapter={adapter}/>
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter: steps
                              })}
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter: pulses
                              })}
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter: rotation
                              })}
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter: rate
                              })}
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter: gate
                              })}
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter: pitch
                              })}
                              {ControlBuilder.createKnob({
                                  lifecycle,
                                  editing,
                                  midiLearning,
                                  adapter,
                                  parameter: velocity
                              })}
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
