import css from "./ProgressionGrid.sass?inline"
import {clamp, Editing, int, Lifecycle, Terminator} from "@opendaw/lib-std"
import {createElement, replaceChildren} from "@opendaw/lib-jsx"
import {Events, Html} from "@opendaw/lib-dom"
import {KadenzDeviceBoxAdapter, KadenzStep} from "@opendaw/studio-adapters"

const className = Html.adoptStyleSheet(css, "KadenzProgressionGrid")

type Construct = {
    lifecycle: Lifecycle
    editing: Editing
    adapter: KadenzDeviceBoxAdapter
}

/// One column per active progression step, one row per property. Each cell binds straight to its own packed
/// field and is dragged vertically to change, mirroring `CubedDeviceEditor/PatternGrid`.
export const ProgressionGrid = ({lifecycle, editing, adapter}: Construct) => {
    const box = adapter.box
    const readStep = (index: int): KadenzStep => KadenzStep.unpack(box.steps.getField(index).getValue())
    const writeStep = (index: int, mutate: (step: KadenzStep) => void) => editing.modify(() => {
        const field = box.steps.getField(index)
        const step = KadenzStep.unpack(field.getValue())
        mutate(step)
        field.setValue(KadenzStep.pack(step))
    })
    const element: HTMLElement = <div className={className}/>
    const inner = lifecycle.own(new Terminator())
    const rebuild = () => {
        inner.terminate()
        const length = clamp(box.length.getValue(), 1, KadenzStep.MaxSteps)
        element.style.setProperty("--columns", String(length))
        const onChange = (index: int, observer: () => void) =>
            inner.own(box.steps.getField(index).subscribe(observer))
        /// A cell the user drags vertically through an integer range.
        const dragCell = (index: int, extra: string, range: int,
                          read: (step: KadenzStep) => int,
                          write: (step: KadenzStep, value: int) => void,
                          label: (step: KadenzStep) => string): HTMLElement => {
            const cell: HTMLElement = <div className={`cell ${extra}`}/>
            const render = () => {
                const step = readStep(index)
                cell.textContent = label(step)
                cell.classList.toggle("resting", step.rest)
            }
            onChange(index, render)
            render()
            inner.own(Events.subscribe(cell, "pointerdown", (event: PointerEvent) => {
                if (event.button !== 0) {return}
                const startY = event.clientY
                const startValue = read(readStep(index))
                let lastValue = startValue
                const move = Events.subscribe(window, "pointermove", (moveEvent: PointerEvent) => {
                    const value = clamp(startValue + Math.round((startY - moveEvent.clientY) / 8), 0, range - 1)
                    if (value !== lastValue) {
                        lastValue = value
                        writeStep(index, step => write(step, value))
                    }
                })
                const up = Events.subscribe(window, "pointerup", () => {
                    move.terminate()
                    up.terminate()
                })
            }))
            return cell
        }
        const degreeCell = (index: int) => dragCell(index, "degree", 7,
            step => step.degree, (step, value) => step.degree = value,
            step => KadenzStep.DegreeNumerals[step.degree])
        const qualityCell = (index: int) => dragCell(index, "quality", KadenzStep.QualityNames.length,
            step => step.quality, (step, value) => step.quality = value,
            step => KadenzStep.QualityNames[step.quality])
        const barsCell = (index: int) => dragCell(index, "bars", KadenzStep.MaxDuration,
            step => step.duration - 1, (step, value) => step.duration = value + 1,
            step => String(step.duration))
        const restCell = (index: int): HTMLElement => {
            const cell: HTMLElement = <div className="cell rest"/>
            const render = () => {
                const step = readStep(index)
                cell.classList.toggle("on", step.rest)
                cell.textContent = step.rest ? "—" : "♪"
            }
            onChange(index, render)
            render()
            inner.own(Events.subscribe(cell, "click", () => writeStep(index, step => step.rest = !step.rest)))
            return cell
        }
        const row = (label: string, cell: (index: int) => HTMLElement): ReadonlyArray<HTMLElement> => [
            <div className="header">{label}</div>,
            ...Array.from({length}, (_, column) => cell(column))
        ]
        replaceChildren(element,
            <div className="corner"/>,
            ...Array.from({length}, (_, column) => <div className="index">{String(column + 1)}</div>),
            ...row("Chord", degreeCell),
            ...row("Quality", qualityCell),
            ...row("Bars", barsCell),
            ...row("Play", restCell))
    }
    lifecycle.own(box.length.catchupAndSubscribe(rebuild))
    return element
}
