import css from "./ProgressionControls.sass?inline"
import {clamp, DefaultObservableValue, Editing, Lifecycle} from "@opendaw/lib-std"
import {createElement} from "@opendaw/lib-jsx"
import {Html} from "@opendaw/lib-dom"
import {
    KadenzDeviceBoxAdapter,
    KadenzGenerateOptions,
    KadenzGenerator,
    KadenzPresets,
    KadenzStep
} from "@opendaw/studio-adapters"
import {MenuItem} from "@opendaw/studio-core"
import {MenuButton} from "@/ui/components/MenuButton"
import {NumberInput} from "@/ui/components/NumberInput"
import {Button} from "@/ui/components/Button"
import {EditWrapper} from "@/ui/wrapper/EditWrapper"
import {Colors, IconSymbol} from "@opendaw/studio-enums"

const className = Html.adoptStyleSheet(css, "KadenzProgressionControls")

type Construct = {
    lifecycle: Lifecycle
    editing: Editing
    adapter: KadenzDeviceBoxAdapter
}

export const ProgressionControls = ({lifecycle, editing, adapter}: Construct) => {
    // Every seed change gives a different progression, so the button re-rolls rather than repeating itself.
    const options = lifecycle.own(new DefaultObservableValue<KadenzGenerateOptions>(KadenzGenerator.Default))
    const generate = () => {
        const current = options.getValue()
        const next: KadenzGenerateOptions = {...current, seed: current.seed + 1}
        options.setValue(next)
        editing.modify(() => adapter.generateProgression(next))
    }
    return (
        <div className={className}>
            <div className="field">
                <label>Steps</label>
                <NumberInput lifecycle={lifecycle}
                             guard={{guard: value => clamp(value, 1, KadenzStep.MaxSteps)}}
                             model={EditWrapper.forValue(editing, adapter.box.length)}/>
            </div>
            <div className="field">
                <MenuButton root={MenuItem.root().setRuntimeChildrenProcedure(parent => {
                    parent.addMenuItem(MenuItem.header({label: "Progressions", icon: IconSymbol.Piano}))
                    KadenzPresets.All.forEach(preset => parent.addMenuItem(MenuItem.default({label: preset.name})
                        .setTriggerProcedure(() => editing.modify(() => adapter.writeProgression(preset.steps)))))
                })} appearance={{framed: true}}>Presets</MenuButton>
                <Button lifecycle={lifecycle}
                        onClick={generate}
                        appearance={{framed: true, color: Colors.orange}}>Generate</Button>
            </div>
        </div>
    )
}
