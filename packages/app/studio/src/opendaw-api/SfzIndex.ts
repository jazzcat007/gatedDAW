import {z} from "zod"
import {SfzInstrument} from "@opendaw/studio-adapters"

// The folder tree published to factory/sfz/index.json by scripts/import-sfz-instruments.mjs. Its top-level
// key is "instruments", not "soundfonts"/"samples" — the importer groups every region-bearing .sfz file it
// validates under one folder per source library (e.g. "VCSL"), flat, not mirroring the library's own subfolders.
export type SfzIndexEntry = Omit<SfzInstrument, "origin">

export type SfzIndexFolder = {
    readonly name: string
    readonly folders?: ReadonlyArray<SfzIndexFolder>
    readonly instruments?: ReadonlyArray<SfzIndexEntry>
}

export type SfzIndex = {
    readonly version: 1
    readonly updatedAt?: string
    readonly folders: ReadonlyArray<SfzIndexFolder>
}

export namespace SfzIndex {
    const Entry = SfzInstrument.omit({origin: true})

    export const folderSchema: z.ZodType<SfzIndexFolder> = z.lazy(() => z.object({
        name: z.string().min(1),
        folders: z.array(folderSchema).optional(),
        instruments: z.array(Entry).optional()
    }))

    export const schema: z.ZodType<SfzIndex> = z.object({
        version: z.literal(1),
        updatedAt: z.string().optional(),
        folders: z.array(folderSchema)
    })

    export const asSfzInstrument = (entry: SfzIndexEntry): SfzInstrument => ({...entry, origin: "openDAW"})

    export const flatten = (index: SfzIndex): ReadonlyArray<SfzInstrument> => {
        const instruments: Array<SfzInstrument> = []
        const collect = (folder: SfzIndexFolder): void => {
            folder.instruments?.forEach(entry => instruments.push(asSfzInstrument(entry)))
            folder.folders?.forEach(collect)
        }
        index.folders.forEach(collect)
        return instruments
    }
}
