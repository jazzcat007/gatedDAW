import {UUID} from "@opendaw/lib-std"
import {SfzInstrumentMetaData} from "./SfzInstrumentMetaData"
import {z} from "zod"

export const SfzInstrument = SfzInstrumentMetaData.extend({
    uuid: UUID.zType(z)
})

export type SfzInstrument = z.infer<typeof SfzInstrument>
