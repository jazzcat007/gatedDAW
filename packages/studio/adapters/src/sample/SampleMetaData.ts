import {z} from "zod"

export const SampleMetaData = z.object({
    name: z.string(),
    bpm: z.number(),
    duration: z.number(),
    sample_rate: z.number(),
    // "sfz" marks a region sample of the SFZ factory catalog: server-hosted, re-fetchable by content uuid,
    // and deliberately hidden from the local Samples list, which would otherwise fill with thousands of them.
    origin: z.enum(["openDAW", "recording", "import", "sfz"]),
    custom: z.string().optional()
})

export type SampleMetaData = z.infer<typeof SampleMetaData>