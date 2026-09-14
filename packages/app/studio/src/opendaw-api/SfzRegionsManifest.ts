import {z} from "zod"

// Published per instrument as factory/sfz/<uuid>/regions.json by scripts/import-sfz-instruments.mjs. The
// importer resolves every sample path, content-addresses it and probes its duration from the WAV header, so
// the browser can build a complete region graph without fetching a single byte of audio. The numeric fields
// are SfzParsedRegion's, already derived — see scripts/lib/sfz-parse.mjs and the parity test that pins them.
export const SfzManifestRegion = z.object({
    sample: z.string().min(1),
    fileName: z.string().min(1),
    durationInSeconds: z.number().nonnegative(),
    sampleRate: z.number().positive(),
    channels: z.number().positive(),
    keyLo: z.number(),
    keyHi: z.number(),
    rootKey: z.number(),
    velLo: z.number(),
    velHi: z.number(),
    loopMode: z.number(),
    loopStart: z.number(),
    loopEnd: z.number(),
    attack: z.number(),
    decay: z.number(),
    sustain: z.number(),
    release: z.number(),
    volume: z.number(),
    pan: z.number(),
    tune: z.number()
})

export type SfzManifestRegion = z.infer<typeof SfzManifestRegion>

export const SfzRegionsManifest = z.object({
    version: z.literal(1),
    regions: z.array(SfzManifestRegion),
    unsupportedOpcodes: z.array(z.string())
})

export type SfzRegionsManifest = z.infer<typeof SfzRegionsManifest>
