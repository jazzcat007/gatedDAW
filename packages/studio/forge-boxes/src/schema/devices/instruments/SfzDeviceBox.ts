import {BoxSchema, deprecated} from "@opendaw/lib-box-forge"
import {Pointers} from "@opendaw/studio-enums"
import {DeviceFactory} from "../../std/DeviceFactory"
import {ParameterPointerRules, UnipolarConstraints} from "../../std/Defaults"

export const SfzDeviceBox: BoxSchema<Pointers> = DeviceFactory.createInstrument("SfzDeviceBox", "notes", {
    10: {type: "field", name: "regions", pointerRules: {accepts: [Pointers.Sample], mandatory: false}}
})

export const SfzRegionBox: BoxSchema<Pointers> = {
    type: "box",
    class: {
        name: "SfzRegionBox",
        fields: {
            10: {type: "pointer", name: "device", pointerType: Pointers.Sample, mandatory: true},
            11: {type: "pointer", name: "file", pointerType: Pointers.AudioFile, mandatory: true},
            20: {type: "string", name: "label", deprecated},
            21: {type: "string", name: "icon"},
            22: {type: "boolean", name: "enabled", value: true},
            23: {type: "boolean", name: "minimized", value: false},
            30: {type: "int32", name: "region-index", value: 0, constraints: {min: 0, max: 65535}, unit: ""},
            31: {type: "int32", name: "key-lo", value: 0, constraints: {min: 0, max: 127}, unit: ""},
            32: {type: "int32", name: "key-hi", value: 127, constraints: {min: 0, max: 127}, unit: ""},
            33: {type: "int32", name: "root-key", value: 60, constraints: {min: 0, max: 127}, unit: ""},
            34: {type: "int32", name: "vel-lo", value: 0, constraints: {min: 0, max: 127}, unit: ""},
            35: {type: "int32", name: "vel-hi", value: 127, constraints: {min: 0, max: 127}, unit: ""},
            36: {type: "int32", name: "loop-mode", value: 0, constraints: {length: 2}, unit: ""},
            37: {type: "int32", name: "loop-start", value: 0, constraints: {min: 0, max: 2147483647}, unit: ""},
            38: {type: "int32", name: "loop-end", value: 0, constraints: {min: 0, max: 2147483647}, unit: ""},
            40: {
                type: "float32", name: "attack", pointerRules: ParameterPointerRules,
                value: 0.001, constraints: {min: 0.001, max: 5.0, scaling: "exponential"}, unit: "s"
            },
            41: {
                type: "float32", name: "decay", pointerRules: ParameterPointerRules,
                value: 0.001, constraints: {min: 0.001, max: 5.0, scaling: "exponential"}, unit: "s"
            },
            42: {type: "float32", name: "sustain", pointerRules: ParameterPointerRules, value: 1.0, ...UnipolarConstraints},
            43: {
                type: "float32", name: "release", pointerRules: ParameterPointerRules,
                value: 0.05, constraints: {min: 0.001, max: 5.0, scaling: "exponential"}, unit: "s"
            },
            44: {
                type: "float32", name: "volume", pointerRules: ParameterPointerRules,
                value: 0.0, constraints: "decibel", unit: "dB"
            },
            45: {type: "float32", name: "pan", pointerRules: ParameterPointerRules, constraints: "bipolar", unit: ""},
            46: {
                type: "float32", name: "tune", pointerRules: ParameterPointerRules,
                value: 0.0, constraints: {min: -1200, max: 1200, scaling: "linear"}, unit: "ct"
            }
        }
    },
    pointerRules: {accepts: [Pointers.Editing, Pointers.SideChain, Pointers.Selection], mandatory: false},
    tags: {type: "device", "device-type": "instrument", content: "notes", copyable: false}
}
