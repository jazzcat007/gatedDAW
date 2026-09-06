import css from "./KadenzDeviceEditor.sass?inline"
import {DeviceHost, KadenzDeviceBoxAdapter} from "@opendaw/studio-adapters"
import {Lifecycle} from "@opendaw/lib-std"
import {DeviceEditor} from "@/ui/devices/DeviceEditor.tsx"
import {MenuItems} from "@/ui/devices/menu-items.ts"
import {createElement} from "@opendaw/lib-jsx"
import {ControlBuilder} from "@/ui/devices/ControlBuilder.tsx"
import {DeviceMidiMeter} from "@/ui/devices/panel/DeviceMidiMeter.tsx"
import {Html} from "@opendaw/lib-dom"
import {StudioService} from "@/service/StudioService"
import {EffectFactories} from "@opendaw/studio-core"
import {ProgressionGrid} from "@/ui/devices/midi-effects/Kadenz/ProgressionGrid.tsx"
import {ProgressionControls} from "@/ui/devices/midi-effects/Kadenz/ProgressionControls.tsx"

const className = Html.adoptStyleSheet(css, "KadenzDeviceEditor")

type Construct = {
    lifecycle: Lifecycle
    service: StudioService
    adapter: KadenzDeviceBoxAdapter
    deviceHost: DeviceHost
}

export const KadenzDeviceEditor = ({lifecycle, service, adapter, deviceHost}: Construct) => {
    const {key, scaleIndex, rate, gate, numNotes, inversion, spread, octave, strum, velocity, velocityTilt} =
        adapter.namedParameter
    const {project} = service
    const {editing, midiLearning} = project
    const knob = (parameter: typeof key) =>
        ControlBuilder.createKnob({lifecycle, editing, midiLearning, adapter, parameter})
    return (
        <DeviceEditor lifecycle={lifecycle}
                      service={service}
                      adapter={adapter}
                      populateMenu={parent => MenuItems.forEffectDevice(parent, service, deviceHost, adapter)}
                      populateControls={() => (
                          <div className={className}>
                              <div className="knobs">
                                  {knob(key)}
                                  {knob(scaleIndex)}
                                  {knob(rate)}
                                  {knob(gate)}
                                  {knob(numNotes)}
                                  {knob(inversion)}
                                  {knob(spread)}
                                  {knob(octave)}
                                  {knob(strum)}
                                  {knob(velocity)}
                                  {knob(velocityTilt)}
                              </div>
                              <ProgressionControls lifecycle={lifecycle} editing={editing} adapter={adapter}/>
                              <ProgressionGrid lifecycle={lifecycle} editing={editing} adapter={adapter}/>
                          </div>
                      )}
                      populateMeter={() => (
                          <DeviceMidiMeter lifecycle={lifecycle}
                                           receiver={project.liveStreamReceiver}
                                           address={adapter.address}/>
                      )}
                      icon={EffectFactories.MidiNamed.Kadenz.defaultIcon}/>
    )
}
