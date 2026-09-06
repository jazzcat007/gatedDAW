# First Import Batch Plan v2 — OMV Execution

## Context
* Factory root on OMV: `/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory`
* Docker mount: `/data/factory`
* Env: `FACTORY_ASSET_ROOT=/data/factory`, `OPENDAW_FACTORY_OFFLINE_ONLY=true`
* Source staging on OMV: `/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory-intake`
* Verified baseline 2026-09-06: 902 samples, 7 SoundFonts, 49 presets, 19 demos

## Prerequisites
* Node ≥23 and ffmpeg available on execution host
* Write access to factory root
* Source folders present under factory-intake

## Phase 1 — SoundFonts
```bash
FACTORY_ROOT=/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory
INTAKE=/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory-intake

node scripts/import-soundfonts.mjs "$INTAKE/soundfonts/GeneralUser-GS" \
  --root "$FACTORY_ROOT" --folder "GeneralUser" --license "GPL-3.0" --url "https://github.com/GalleryOfBots/GeneralUser-GS"

node scripts/import-soundfonts.mjs "$INTAKE/soundfonts/FreePats-GM-Orchestral" \
  --root "$FACTORY_ROOT" --folder "FreePats" --license "GPL-3.0" --url "https://github.com/free-pats/FreePats"

node scripts/import-soundfonts.mjs "$INTAKE/soundfonts/FluidR3-GM" \
  --root "$FACTORY_ROOT" --folder "FluidR3" --license "LGPL-3.0" --url "https://..."

node scripts/import-soundfonts.mjs "$INTAKE/soundfonts/FreePats-GM-Percussion" \
  --root "$FACTORY_ROOT" --folder "FreePats" --license "GPL-3.0" --url "https://..."

node scripts/import-soundfonts.mjs "$INTAKE/soundfonts/Famicom-Multichip-Chiptune" \
  --root "$FACTORY_ROOT" --folder "Chiptune" --license "CC0" --url "https://..."

node scripts/import-soundfonts.mjs "$INTAKE/soundfonts/VintageDreamsWaves" \
  --root "$FACTORY_ROOT" --folder "Synth" --license "CC-BY" --url "https://..."
```

Verify:
```bash
grep 9575028c-7a1f-489f-9770-fccc8cff2734 "$FACTORY_ROOT/soundfonts/index.json"
grep f7bf84f9-2ae8-4b5f-9650-97e69aff7e4b "$FACTORY_ROOT/soundfonts/index.json"
```

## Phase 2 — Samples
```bash
node scripts/import-samples.mjs "$INTAKE/samples/Impulse-Responses" \
  --root "$FACTORY_ROOT" --folder "Impulse Responses/AdventureKid"

node scripts/import-samples.mjs "$INTAKE/samples/Keys" \
  --root "$FACTORY_ROOT" --folder "Keys/UIowa"

for cat in Drums One-Shots Loops Bass Synth Guitar Foley Vocals; do
  node scripts/import-samples.mjs "$INTAKE/samples/$cat" \
    --root "$FACTORY_ROOT" --folder "$cat"
done
```

Verify:
```bash
grep f51ed198-f47a-4253-b765-888e0c8d16e6 "$FACTORY_ROOT/samples/index.json"
grep 0ab1a85f-1d07-4a24-8418-ab5a6b6e3490 "$FACTORY_ROOT/samples/index.json"
```

## Phase 3 — Presets
```bash
cp "$INTAKE/presets"/*.odp "$FACTORY_ROOT/presets/" 2>/dev/null || true
# Ensure presets/index.json exists and is an array
```

## Phase 4 — Verify
```bash
node -e "const fs=require('fs'); const s=JSON.parse(fs.readFileSync('$FACTORY_ROOT/samples/index.json')); const c=s.folders.reduce((a,f)=>a+(f.samples?.length||0),0); console.log('samples',c);"
node -e "const fs=require('fs'); const s=JSON.parse(fs.readFileSync('$FACTORY_ROOT/soundfonts/index.json')); const c=s.folders.reduce((a,f)=>a+(f.soundfonts?.length||0),0); console.log('soundfonts',c);"
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('$FACTORY_ROOT/presets/index.json')); console.log('presets',Array.isArray(p)?p.length:0);"
```

## Acceptance
* samples ≥ 1,500
* soundfonts ≥ 10
* presets ≥ 19
* Four starter UUIDs present
* OPENDAW_FACTORY_OFFLINE_ONLY remains true
