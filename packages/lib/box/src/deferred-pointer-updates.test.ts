import {describe, expect, it} from "vitest"
import {Maybe, Option, panic, Procedure, UUID} from "@opendaw/lib-std"
import {Box, BoxConstruct} from "./box"
import {BoxGraph} from "./graph"
import {PointerField} from "./pointer"
import {NoPointers, VertexVisitor} from "./vertex"

// Pointer updates made while a box is constructing are deferred to endTransaction. If the same pointer is
// reassigned later in that transaction the deferred update is replayed after the reassignment, so it must not
// resurrect the address it captured during construction.

enum Pointer {Target = "Target"}

type NodeBoxFields = { 0: PointerField<Pointer.Target> }

class NodeBox extends Box<Pointer.Target, NodeBoxFields> {
    static create(graph: BoxGraph, uuid: UUID.Bytes, constructor?: Procedure<NodeBox>): NodeBox {
        return graph.stageBox(new NodeBox({
            uuid, graph, name: "NodeBox", pointerRules: {accepts: [Pointer.Target], mandatory: false}
        }), constructor)
    }
    private constructor(construct: BoxConstruct<Pointer.Target>) {super(construct)}
    protected initializeFields(): NodeBoxFields {
        return {
            0: PointerField.create({
                parent: this, fieldKey: 0, fieldName: "ref", pointerRules: NoPointers, deprecated: false
            }, Pointer.Target, false)
        }
    }
    accept<R>(_visitor: VertexVisitor<R>): Maybe<R> {return undefined}
    get tags(): Readonly<Record<string, string | number | boolean>> {return {}}
    get ref(): PointerField<Pointer.Target> {return this.getField(0)}
}

const newGraph = (): BoxGraph<any> => new BoxGraph<any>(Option.wrap(
    ((name: string, graph: BoxGraph, uuid: UUID.Bytes, constructor: Procedure<Box>): Box =>
        name === "NodeBox" ? NodeBox.create(graph, uuid, constructor as Procedure<NodeBox>) : panic(name)) as any))

type Recorded = { added: Array<PointerField>, removed: Array<PointerField> }

const watch = (box: NodeBox): Recorded => {
    const recorded: Recorded = {added: [], removed: []}
    box.pointerHub.subscribe({
        onAdded: (pointer: PointerField) => recorded.added.push(pointer),
        onRemoved: (pointer: PointerField) => recorded.removed.push(pointer)
    })
    return recorded
}

describe("pointer reassigned after construction, same transaction", () => {
    it("keeps the reassigned target, not the one captured during construction", () => {
        const graph = newGraph()
        graph.beginTransaction()
        const alpha = NodeBox.create(graph, UUID.generate())
        const beta = NodeBox.create(graph, UUID.generate())
        const source = NodeBox.create(graph, UUID.generate(), box => box.ref.refer(alpha))
        source.ref.refer(beta)
        graph.endTransaction()
        expect(source.ref.targetAddress.unwrap().equals(beta.address)).true
        expect(source.ref.targetVertex.unwrapOrNull()).toBe(beta)
    })

    it("announces the reassigned target to its pointer hub", () => {
        const graph = newGraph()
        graph.beginTransaction()
        const alpha = NodeBox.create(graph, UUID.generate())
        const beta = NodeBox.create(graph, UUID.generate())
        const alphaEvents = watch(alpha)
        const betaEvents = watch(beta)
        const source = NodeBox.create(graph, UUID.generate(), box => box.ref.refer(alpha))
        source.ref.refer(beta)
        graph.endTransaction()
        expect(betaEvents.added.length).toBe(1)
        expect(betaEvents.added[0]).toBe(source.ref)
        expect(beta.pointerHub.incoming().length).toBe(1)
        // alpha was never announced as added, so it must not be announced as removed either
        expect(alphaEvents.added.length).toBe(0)
        expect(alphaEvents.removed.length).toBe(0)
        expect(alpha.pointerHub.incoming().length).toBe(0)
    })

    it("still announces a target that is only set during construction", () => {
        const graph = newGraph()
        graph.beginTransaction()
        const target = NodeBox.create(graph, UUID.generate())
        const targetEvents = watch(target)
        const source = NodeBox.create(graph, UUID.generate(), box => box.ref.refer(target))
        graph.endTransaction()
        expect(source.ref.targetVertex.unwrapOrNull()).toBe(target)
        expect(targetEvents.added.length).toBe(1)
        expect(target.pointerHub.incoming().length).toBe(1)
    })

    it("keeps the last of several reassignments after construction", () => {
        const graph = newGraph()
        graph.beginTransaction()
        const alpha = NodeBox.create(graph, UUID.generate())
        const beta = NodeBox.create(graph, UUID.generate())
        const gamma = NodeBox.create(graph, UUID.generate())
        const gammaEvents = watch(gamma)
        const source = NodeBox.create(graph, UUID.generate(), box => box.ref.refer(alpha))
        source.ref.refer(beta)
        source.ref.refer(gamma)
        graph.endTransaction()
        expect(source.ref.targetVertex.unwrapOrNull()).toBe(gamma)
        expect(gammaEvents.added.length).toBe(1)
        expect(gamma.pointerHub.incoming().length).toBe(1)
    })

    it("clears a pointer that construction set and the same transaction unset", () => {
        const graph = newGraph()
        graph.beginTransaction()
        const alpha = NodeBox.create(graph, UUID.generate())
        const alphaEvents = watch(alpha)
        const source = NodeBox.create(graph, UUID.generate(), box => box.ref.refer(alpha))
        source.ref.defer()
        graph.endTransaction()
        expect(source.ref.isEmpty()).true
        expect(source.ref.targetVertex.isEmpty()).true
        expect(alphaEvents.added.length).toBe(0)
        expect(alpha.pointerHub.incoming().length).toBe(0)
    })
})
