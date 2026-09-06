# Factory Intake Batch Plan

Generated for the openDAW self-hosted factory on 2026-09-06.

## Context

- Repo: `jazzcat007/openDAW`
- Branch: `screwpulp/self-hosted`
- Dev-box intake root: `factory-intake`
- Dev-box factory mirror: `/data/factory`
- OMV factory root: `/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory`
- Production mode: keep `OPENDAW_FACTORY_OFFLINE_ONLY=true`

The 2026-09-02 intake note lists 590 staged samples across 10 categories, 6 SoundFonts, and 9 presets. This checkout currently tracks the preset files only. Before running the imports, make sure the external `factory-intake/samples` and `factory-intake/soundfonts` directories have been restored or synced onto the dev box.

Current OMV catalog baseline from 2026-09-06 verification:

- Samples: 902
- SoundFonts: 7
- Presets: 49
- Demos: 19

## Phase 1 - Preflight

Run from the repo root on a dev box that has Node and ffmpeg installed:

```bash
export FACTORY_ROOT=/data/factory
export OMV_FACTORY_ROOT=/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory

node -v
ffmpeg -version
ffprobe -version

test -d factory-intake/samples
test -d factory-intake/soundfonts
test -d factory-intake/presets
test -d "$FACTORY_ROOT"
test -f "$FACTORY_ROOT/samples/index.json"
test -f "$FACTORY_ROOT/soundfonts/index.json"
test -f "$FACTORY_ROOT/presets/index.json"
```

If `factory-intake/samples` or `factory-intake/soundfonts` is missing, sync the staged intake source onto the dev box before continuing. Do not import directly against production OMV unless that host intentionally has Node and ffmpeg available for this task.

## Phase 2 - SoundFonts

```bash
node scripts/import-soundfonts.mjs factory-intake/soundfonts/GeneralUser-GS \
  --root "$FACTORY_ROOT" \
  --folder "GeneralUser" \
  --license "GPL-3.0" \
  --url "https://github.com/GalleryOfBots/GeneralUser-GS"

node scripts/import-soundfonts.mjs factory-intake/soundfonts/FreePats-GM-Orchestral \
  --root "$FACTORY_ROOT" \
  --folder "FreePats" \
  --license "GPL-3.0" \
  --url "https://github.com/free-pats/FreePats"

node scripts/import-soundfonts.mjs factory-intake/soundfonts/FluidR3-GM \
  --root "$FACTORY_ROOT" \
  --folder "FluidR3" \
  --license "LGPL-3.0" \
  --url "TODO_REPLACE_WITH_SOURCE_URL"

node scripts/import-soundfonts.mjs factory-intake/soundfonts/FreePats-GM-Percussion \
  --root "$FACTORY_ROOT" \
  --folder "FreePats" \
  --license "GPL-3.0" \
  --url "TODO_REPLACE_WITH_SOURCE_URL"

node scripts/import-soundfonts.mjs factory-intake/soundfonts/Famicom-Multichip-Chiptune \
  --root "$FACTORY_ROOT" \
  --folder "Chiptune" \
  --license "CC0" \
  --url "TODO_REPLACE_WITH_SOURCE_URL"

node scripts/import-soundfonts.mjs factory-intake/soundfonts/VintageDreamsWaves \
  --root "$FACTORY_ROOT" \
  --folder "Synth" \
  --license "CC-BY" \
  --url "TODO_REPLACE_WITH_SOURCE_URL"
```

Expected UUID checks from the brief:

- `9575028c-7a1f-489f-9770-fccc8cff2734` - GeneralUser GS
- `f7bf84f9-2ae8-4b5f-9650-97e69aff7e4b` - FreePats GM Orchestral

## Phase 3 - Samples

```bash
node scripts/import-samples.mjs factory-intake/samples/Impulse-Responses \
  --root "$FACTORY_ROOT" \
  --folder "Impulse Responses/AdventureKid"

node scripts/import-samples.mjs factory-intake/samples/Keys \
  --root "$FACTORY_ROOT" \
  --folder "Keys/UIowa"

node scripts/import-samples.mjs factory-intake/samples/Drums \
  --root "$FACTORY_ROOT" \
  --folder "Drums"

node scripts/import-samples.mjs factory-intake/samples/One-Shots \
  --root "$FACTORY_ROOT" \
  --folder "One-Shots"

node scripts/import-samples.mjs factory-intake/samples/Loops \
  --root "$FACTORY_ROOT" \
  --folder "Loops"

node scripts/import-samples.mjs factory-intake/samples/Bass \
  --root "$FACTORY_ROOT" \
  --folder "Bass"

node scripts/import-samples.mjs factory-intake/samples/Synth \
  --root "$FACTORY_ROOT" \
  --folder "Synth"

node scripts/import-samples.mjs factory-intake/samples/Guitar \
  --root "$FACTORY_ROOT" \
  --folder "Guitar"

node scripts/import-samples.mjs factory-intake/samples/Foley \
  --root "$FACTORY_ROOT" \
  --folder "Foley"

node scripts/import-samples.mjs factory-intake/samples/Vocals \
  --root "$FACTORY_ROOT" \
  --folder "Vocals"
```

Expected UUID checks from the brief:

- `f51ed198-f47a-4253-b765-888e0c8d16e6` - Guitar Cab IR
- `0ab1a85f-1d07-4a24-8418-ab5a6b6e3490` - Piano one-shot

## Phase 4 - Presets

```bash
mkdir -p "$FACTORY_ROOT/presets"
rsync -av --checksum factory-intake/presets/*.odp "$FACTORY_ROOT/presets/"
rsync -av --checksum factory-intake/presets/index.json "$FACTORY_ROOT/presets/index.json"
```

Starter preset coverage target:

- Drum bus
- Vocal chain
- Mastering chain
- Lo-fi sampler
- Ambient send
- Guitar cab convolver
- Clean piano
- Orchestral sketch
- Synth bass
- Sidechain-style pump

The acceptance brief mentions four starter preset asset UUIDs, but this batch note only names two SoundFont UUIDs and two sample UUIDs. Add the two missing preset-related UUIDs before treating that criterion as enforceable.

## Phase 5 - Validate Catalogs

```bash
node - <<'NODE'
const {readFileSync, existsSync} = require("node:fs")
const {join} = require("node:path")

const root = process.env.FACTORY_ROOT || "/data/factory"
const required = new Set([
  "9575028c-7a1f-489f-9770-fccc8cff2734",
  "f7bf84f9-2ae8-4b5f-9650-97e69aff7e4b",
  "f51ed198-f47a-4253-b765-888e0c8d16e6",
  "0ab1a85f-1d07-4a24-8418-ab5a6b6e3490"
])

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function collect(folder, key, entries = []) {
  if (Array.isArray(folder[key])) entries.push(...folder[key])
  if (Array.isArray(folder.folders)) folder.folders.forEach(child => collect(child, key, entries))
  return entries
}

function presetsFrom(data) {
  return Array.isArray(data) ? data : (data.presets || [])
}

const samples = collect({folders: readJson(join(root, "samples/index.json")).folders}, "samples")
const soundfonts = collect({folders: readJson(join(root, "soundfonts/index.json")).folders}, "soundfonts")
const presets = presetsFrom(readJson(join(root, "presets/index.json")))
const all = new Map([...samples, ...soundfonts, ...presets].map(entry => [entry.uuid, entry]))
const missing = [...required].filter(uuid => !all.has(uuid))

console.log(JSON.stringify({
  samples: samples.length,
  soundfonts: soundfonts.length,
  presets: presets.length,
  requiredMissing: missing,
  sampleFilesMissing: samples.filter(entry => !existsSync(join(root, "samples", entry.uuid))).length,
  soundfontFilesMissing: soundfonts.filter(entry => !existsSync(join(root, "soundfonts", entry.uuid))).length
}, null, 2))

if (samples.length < 1500) process.exitCode = 1
if (soundfonts.length < 10) process.exitCode = 1
if (presets.length < 19) process.exitCode = 1
if (missing.length > 0) process.exitCode = 1
NODE
```

Acceptance targets:

- `samples/index.json` count increases from 902 to at least 1500
- `soundfonts/index.json` count is at least 10
- `presets/index.json` count is at least 19
- Required UUID list is present after it is completed
- Sample and SoundFont file-missing counts are zero

## Phase 6 - Sync to OMV

From the dev box after the imports pass:

```bash
rsync -av --checksum "$FACTORY_ROOT"/ root@omv:"$OMV_FACTORY_ROOT"/
```

Then verify on OMV:

```bash
docker inspect opendaw \
  --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep '^OPENDAW_FACTORY_OFFLINE_ONLY=true$'

FACTORY_ROOT="$OMV_FACTORY_ROOT" node - <<'NODE'
const {readFileSync} = require("node:fs")
const {join} = require("node:path")
const root = process.env.FACTORY_ROOT

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function collect(folder, key, entries = []) {
  if (Array.isArray(folder[key])) entries.push(...folder[key])
  if (Array.isArray(folder.folders)) folder.folders.forEach(child => collect(child, key, entries))
  return entries
}

function presetsFrom(data) {
  return Array.isArray(data) ? data : (data.presets || [])
}

console.log({
  samples: collect({folders: readJson(join(root, "samples/index.json")).folders}, "samples").length,
  soundfonts: collect({folders: readJson(join(root, "soundfonts/index.json")).folders}, "soundfonts").length,
  presets: presetsFrom(readJson(join(root, "presets/index.json"))).length,
  demos: (readJson(join(root, "demos/projects.json")).tracks || []).length
})
NODE
```

If `/api/factory/summary` has been added by a later server build, this is the intended API check:

```bash
curl -s http://localhost:8789/api/factory/summary | jq '.catalogs[] | {id, count}'
```

On the current checked-out server build, `/api/admin/assets` is the available factory summary endpoint and requires an authenticated admin browser session.
