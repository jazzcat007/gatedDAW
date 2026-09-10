import {z} from "zod"

export const SfzInstrumentMetaData = z.object({
    name: z.string(),
    definition: z.string(),
    regions: z.number().int(),
    samples: z.number().int(),
    unsupportedOpcodes: z.array(z.string()),
    license: z.string(),
    url: z.string(),
    origin: z.enum(["openDAW", "import"])
})

export type SfzInstrumentMetaData = z.infer<typeof SfzInstrumentMetaData>
