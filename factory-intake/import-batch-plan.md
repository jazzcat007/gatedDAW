# First Import Batch Plan — 2026-09-06

## Objective
Grow the self-hosted factory from verified baseline to a usable starter studio:
* Samples ≥ 1,500 entries
* SoundFonts ≥ 10 entries
* Presets ≥ 19 entries
* All starter preset asset UUIDs present

## Baseline
Verified 2026-09-06 OMV:
* Mount: /dev/sdb1 XFS, 17T total, 16T free
* Factory volume: /data/factory
* OPENDAW_FACTORY_OFFLINE_ONLY=true
* Samples: 902 entries, 0 missing
* SoundFonts: 7 entries, 0 missing
* Presets: 49 entries
* Demos: 19 tracks, 0 missing

Staged intake as of 2026-09-02:
* Samples: 590 files across Bass/Drums/Foley/Guitar/Impulse Responses/Keys/Loops/One-Shots/Synth/Vocals
* SoundFonts: 6 catalogs, 6 .sf2 files
* Presets: 9 .odp files

## Phase 1 — SoundFonts
Run on dev box with Node + ffmpeg, then rsync to OMV.

```bash
# GeneralUser GS
node scripts/import-soundfonts.mjs factory-intake/soundfonts/GeneralUser-GS \
  --folder "GeneralUser" --license "GPL-3.0" --url "https://github.com/GalleryOfBots/GeneralUser-GS"

# FreePats GM Orchestral
node scripts/import-soundfonts.mjs factory-intake/soundfonts/FreePats-GM-Orchestral \
  --folder "FreePats" --license "GPL-3.0" --url "https://github.com/free-pats/FreePats"

# FluidR3-GM
node scripts/import-soundfonts.mjs factory-intake/soundfonts/FluidR3-GM \
  --folder "FluidR3" --license "LGPL-3.0" --url "https://..."

# FreePats GM Percussion
node scripts/import-soundfonts.mjs factory-intake/soundfonts/FreePats-GM-Percussion \
  --folder "FreePats" --license "GPL-3.0" --url "https://..."

# Famicom Multichip Chiptune
node scripts/import-soundfonts.mjs factory-intake/soundfonts/Famicom-Multichip-Chiptune \
  --folder "Chiptune" --license "CC0" --url "https://..."

# Vintage Dreams Waves
node scripts/import-soundfonts.mjs factory-intake/soundfonts/VintageDreamsWaves \
  --folder "Synth" --license "CC-BY" --url "https://..."
```

Verification UUIDs:
* 9575028c-7a1f-489f-9770-fccc8cff2734 — GeneralUser GS v2.0.3.sf2
* f7bf84f9-2ae8-4b5f-9650-97e69aff7e4b — FreePats GM Orchestral

## Phase 2 — Samples
```bash
node scripts/import-samples.mjs factory-intake/samples/Impulse-Responses \
  --root /data/factory --folder "Impulse Responses/AdventureKid"

node scripts/import-samples.mjs factory-intake/samples/Keys \
  --root /data/factory --folder "Keys/UIowa"

node scripts/import-samples.mjs factory-intake/samples/Drums \
  --root /data/factory --folder "Drums"

node scripts/import-samples.mjs factory-intake/samples/One-Shots \
  --root /data/factory --folder "One-Shots"

node scripts/import-samples.mjs factory-intake/samples/Loops \
  --root /data/factory --folder "Loops"

node scripts/import-samples.mjs factory-intake/samples/Bass \
  --root /data/factory --folder "Bass"

node scripts/import-samples.mjs factory-intake/samples/Synth \
  --root /data/factory --folder "Synth"

node scripts/import-samples.mjs factory-intake/samples/Guitar \
  --root /data/factory --folder "Guitar"

node scripts/import-samples.mjs factory-intake/samples/Foley \
  --root /data/factory --folder "Foley"

node scripts/import-samples.mjs factory-intake/samples/Vocals \
  --root /data/factory --folder "Vocals"
```

Verification UUIDs:
* f51ed198-f47a-4253-b765-888e0c8d16e6 — AK-SPKRS_ModUk_001.wav
* 0ab1a85f-1d07-4a24-8418-ab5a6b6e3490 — Piano.mf.C4.aiff

## Phase 3 — Presets
Copy staged presets to factory:
```bash
cp factory-intake/presets/*.odp /data/factory/presets/
```
Ensure presets/index.json is updated. Target starter set:
* drum bus
* vocal chain
* mastering chain
* lo-fi sampler
* ambient send
* guitar cab convolver
* clean piano
* orchestral sketch
* synth bass
* sidechain-style pump

## Phase 4 — Sync to OMV
```bash
rsync -av --checksum /data/factory/ root@omv:/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory/
```

## Phase 5 — Verify
```bash
curl -s http://localhost:8789/api/factory/summary | jq '.catalogs[] | {id, count}'
grep 9575028c-7a1f-489f-9770-fccc8cff2734 /data/factory/soundfonts/index.json
grep f7bf84f9-2ae8-4b5f-9650-97e69aff7e4b /data/factory/soundfonts/index.json
grep f51ed198-f47a-4253-b765-888e0c8d16e6 /data/factory/samples/index.json
grep 0ab1a85f-1d07-4a24-8418-ab5a6b6e3490 /data/factory/samples/index.json
```

## Acceptance
* samples/index.json count ≥ 1,500
* soundfonts/index.json count ≥ 10
* presets/index.json count ≥ 19
* All four starter preset asset UUIDs present
* OPENDAW_FACTORY_OFFLINE_ONLY remains true
