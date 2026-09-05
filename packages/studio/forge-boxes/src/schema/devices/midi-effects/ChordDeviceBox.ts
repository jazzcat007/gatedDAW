import {BoxSchema} from "@opendaw/lib-box-forge"
import {Pointers} from "@opendaw/studio-enums"
import {ParameterPointerRules} from "../../std/Defaults"
import {DeviceFactory} from "../../std/DeviceFactory"

export const ChordDeviceBox: BoxSchema<Pointers> = DeviceFactory.createMidiEffect("ChordDeviceBox", {
    10: {
        type: "int32", name: "key", pointerRules: ParameterPointerRules,
        value: 0, constraints: {length: 12}, unit: ""
    },
    11: {
        type: "int32", name: "scale-index", pointerRules: ParameterPointerRules,
        value: 0, constraints: {length: 9}, unit: ""
    },
    12: {
        type: "int32", name: "degree", pointerRules: ParameterPointerRules,
        value: 0, constraints: {min: -7, max: 7}, unit: ""
    },
    13: {
        type: "int32", name: "num-notes", pointerRules: ParameterPointerRules,
        value: 3, constraints: {min: 1, max: 6}, unit: ""
    },
    14: {
        type: "int32", name: "inversion", pointerRules: ParameterPointerRules,
        value: 0, constraints: {min: 0, max: 3}, unit: ""
    },
    15: {
        type: "int32", name: "spread", pointerRules: ParameterPointerRules,
        value: 0, constraints: {min: 0, max: 3}, unit: ""
    },
    16: {
        type: "int32", name: "octave", pointerRules: ParameterPointerRules,
        value: 0, constraints: {min: -2, max: 2}, unit: "oct"
    },
    17: {
        type: "float32", name: "strum", pointerRules: ParameterPointerRules,
        value: 0.0, constraints: {min: 0.0, max: 240.0, scaling: "linear"}, unit: ""
    },
    18: {
        type: "float32", name: "velocity", pointerRules: ParameterPointerRules,
        value: 0.0, constraints: "bipolar", unit: ""
    }
})
