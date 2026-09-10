import {Sample, SfzInstrument, Soundfont} from "@opendaw/studio-adapters"
import {ProjectMeta} from "@opendaw/studio-core"

export type StudioSignal =
    | { type: "reset-peaks" }
    | { type: "import-sample", sample: Sample }
    | { type: "import-soundfont", soundfont: Soundfont }
    | { type: "import-sfz", sfz: SfzInstrument }
    | { type: "delete-project", meta: ProjectMeta }