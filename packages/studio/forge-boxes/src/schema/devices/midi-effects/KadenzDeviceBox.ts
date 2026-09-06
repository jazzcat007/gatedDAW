import {BoxSchema} from "@opendaw/lib-box-forge"
import {Pointers} from "@opendaw/studio-enums"
import {ParameterPointerRules} from "../../std/Defaults"
import {DeviceFactory} from "../../std/DeviceFactory"

export const KadenzDeviceBox: BoxSchema<Pointers> = DeviceFactory.createMidiEffect("KadenzDeviceBox", {
    10: {
        type: "int32", name: "key", pointerRules: ParameterPointerRules,
        value: 0, constraints: {length: 12}, unit: ""
    },
    11: {
        type: "int32", name: "scale-index", pointerRules: ParameterPointerRules,
        value: 0, constraints: {length: 9}, unit: ""
    },
    12: {
        type: "int32", name: "rate-index", pointerRules: ParameterPointerRules,
        value: 3, constraints: {length: 17}, unit: ""
    },
    13: {
        type: "float32", name: "gate", pointerRules: ParameterPointerRules,
        value: 0.9, constraints: {min: 0.0, max: 2.0, scaling: "linear"}, unit: ""
    },
    14: {
        type: "int32", name: "num-notes", pointerRules: ParameterPointerRules,
        value: 3, constraints: {min: 1, max: 6}, unit: ""
    },
    15: {
        type: "int32", name: "inversion", pointerRules: ParameterPointerRules,
        value: 0, constraints: {min: 0, max: 3}, unit: ""
    },
    16: {
        type: "int32", name: "spread", pointerRules: ParameterPointerRules,
        value: 0, constraints: {min: 0, max: 3}, unit: ""
    },
    17: {
        type: "int32", name: "octave", pointerRules: ParameterPointerRules,
        value: 0, constraints: {min: -2, max: 2}, unit: "oct"
    },
    18: {
        type: "float32", name: "strum", pointerRules: ParameterPointerRules,
        value: 0.0, constraints: {min: 0.0, max: 240.0, scaling: "linear"}, unit: ""
    },
    19: {
        type: "float32", name: "velocity", pointerRules: ParameterPointerRules,
        value: 0.8, constraints: "unipolar", unit: "%"
    },
    20: {
        type: "float32", name: "velocity-tilt", pointerRules: ParameterPointerRules,
        value: 0.0, constraints: "bipolar", unit: ""
    },
    21: {type: "int32", name: "length", value: 4, constraints: {min: 1, max: 32}, unit: ""},
    // each int32 packs degree (3 bits), quality (4), duration-1 (4), inversion (2), rest (1).
    // `KadenzStep` packs/unpacks; 384 = degree I, quality Auto, four grid units, the born-default step.
    30: {
        type: "array", name: "steps", length: 32,
        element: {type: "int32", value: 384, constraints: "any", unit: ""}
    }
})
