# Non-Orchestral Factory Catalog Expansion (CC0-only)

Goal: fill the hosted factory's SFZ catalog beyond the orchestral core (VCSL + VSCO 2 CE)
with diverse, eclectic instruments covering rock, folk, pop, urban, R&B, funk, EDM and
industrial. Hard constraint from the user: **CC0 / public-domain sources only** — no CC-BY,
no GPL, no "free for personal use". Drum content must additionally be usable as **openDAW
drum-machine (Playfield) kits**, not just melodic SFZ instruments.

## Where the content comes from

Two CC0-heavy ecosystems, both SFZ-native:

- **`sfzinstruments` GitHub org + site** (sfzinstruments.github.io) — curated index of free
  SFZ libraries; nearly all Karoryfer Samples libraries are CC0. Libraries live as git
  repos, matching the existing `ingest.sh` clone flow.
- **FreePats project** (freepats.zenvoid.org) — licensing is **per bank** (CC0 or GPLv3+);
  each must be checked before inclusion. The General MIDI sound set and the FSS steel-string
  acoustic guitar are GPL → excluded.

All libraries below ship (or have a variant that ships) **SFZ + WAV** — required, since the
importer probes WAVs and rejects non-WAV samples (that rejection is now loud, per PR #13).

## Tier 1 — recommended batch (the genre spine)

### Drums (~8 GB raw) — imported as SFZ instruments AND baked as Playfield kits
| Library | License | Size | Character / genre |
|---|---|---|---|
| Virtuosity Drums (Versilian/Karoryfer) | CC0 | 1.1 GB | jazz/funk kit, 6 mic positions, deep articulations |
| Swirly Drums (Karoryfer) | CC0 | 1.6 GB | punk/indie kit + brushed percussion (folk/pop) |
| Big Rusty Drums (Karoryfer) | CC0 | 2.3 GB | oversized 1980s Polish kit (big rock) |
| Gogodze Phu Vol II (Karoryfer) | CC0 | 133 MB | lo-fi↔hi-fi adjustable character (urban/lo-fi beats) |
| Frankensnare (Karoryfer) | CC0 | 900 MB | snare drums tiny→huge (industrial / sound design) |
| Unruly Drums (Karoryfer) | CC0 | 2 GB | every drum including the kick is a snare (industrial/odd) |
| TR-808 (zynthian/TR808-fischer, Michael Fischer 1994 set) | CC0 | ~12 MB | 116 original 808 samples, SFZ-mapped (urban/R&B/EDM cornerstone) |

### Guitars (~1.1 GB raw) — rock / pop / folk
| Library | License | Size | Character |
|---|---|---|---|
| Black and Green Guitars (Karoryfer) | CC0 | 500 MB | hollowbody pair: Gretsch Anniversary + Hofner Club |
| Shinyguitar (Karoryfer) | CC0 | 352 MB | black archtop (jazz/pop) |
| Emilyguitar (Karoryfer) | CC0 | ~? | general-purpose acoustic guitar |
| FSBS Clean E-Guitar #1, #2 Jazz, Direct (FreePats) | CC0 | ~700 MB | clean/jazz/direct tones — **Direct pairs with openDAW's NeuralAmp device** (amp-sim chain in-app) |

### Basses (~1.9 GB raw) — funk / R&B / pop / rock
| Library | License | Size | Character |
|---|---|---|---|
| Black and Blue Basses (Karoryfer) | CC0 | 961 MB | pair of 5-string basses |
| Fashionbass (Karoryfer) | CC0 | 302 MB | Jazz-style bass |
| Growlybass (Karoryfer) | CC0 | 160 MB | Squier Jazz bass (R&B/hip-hop friendly) |
| Pastabass (Karoryfer) | CC0 | 301 MB | Squier Bass VI (baritone/surf/pop) |
| Swagbass (Karoryfer) | CC0 | 138 MB | character bass |
| Ergo electric upright (Karoryfer) | CC0 | ? | solid-mahogany piezo upright (jazz/folk) |
| Electric Bass YR pick + finger (FreePats) | CC0 | ~2-5 MB each | Yamaha RBX, both articulations |

### Folk / world (~0.4 GB raw)
| Library | License | Size | Character |
|---|---|---|---|
| ganjo (itsclipping) | CC0 | 23 MB | 6-string guitar banjo |
| Etherealwinds Harp II CE (Versilian) | CC0 | 200 MB | folk lever harp (distinct from VCSL's concert harp) |
| Horse Pulse (Karoryfer) | CC0 | 180 MB | pizzicato bass tagelharpa (Nordic folk) |
| Button Accordion HN (FreePats) | CC0 | 5.7 MB | Hohner button accordion |
| Mandolin onsets (ferrosintesis, CC0 Rust crate) | CC0 | small | 10 pitch zones × 4 round robins — packaging is a crate, needs re-wrapping |
| FreePats jaw harp, ukulele, bagpipe, kalimba | CC0/GPL — verify per bank | small | check each bank page before inclusion |

### Synths / EDM / keys
| Library | License | Size | Character |
|---|---|---|---|
| Minifreak Pads (SHLD Music) | CC0 | 265 MB | 5 atmospheric soundscapes (EDM/cinematic) |
| Wavestate Pads (SHLD Music) | CC0 | 160 MB | 3 hybrid VA/digital soundscapes |
| Lately Bass, Synth Bass #1/#2 (FreePats) | CC0 | 1-4 MB each | TX81Z-sim + ZynAddSubFX + DX7 basses (EDM/pop) |
| Caveman Cosmonaut (Karoryfer) | CC0 | ? | 1983 transistor organ as synth (retro/odd) |
| Cowsynth (Karoryfer) | CC0 | ? | bagpipe samples as oscillators (industrial-adjacent weird) |
| Scarypiano (Karoryfer) | CC0 | ? | detuned horror piano (industrial/cinematic) |
| Splendid Grand Piano (AKAI) | Public domain | ? | pop piano alternative |
| Ethan Winer Collection | Public domain | 17 MB | small eclectic grab-bag |
| FreePats synth lead / pad / brass / strings / effects banks | verify per bank | small | GM-style synth filler if CC0 |

### Explicitly excluded (violates CC0-only)
Salamander Grand Piano (CC-BY) · MuldjordKit, DRS Kit, Naked Drums (CC-BY-4.0) ·
Salamander Drumkit / Sam's Sonor (CC-BY-SA) · Kay 5-String Banjo (GPL) · FreePats FSS
steel-string acoustic (GPL) · FreePats General MIDI set (GPLv3+) · Rickenbacker 4001
(CC-BY-NC-SA) · TKDrums G1/L1 (freemium) · Game Boy / MFB Tanzbar kits (license unstated) ·
all Karoryfer commercial libraries (Glockenskull, Secret Agent, Snowkiss, Surfkiss,
Baconwulf, Beefowulf, Nanfo, …) · all Wave Alchemy / Samples From Mars (commercial).

## Pipeline part 1 — importer ingest (extends the existing flow)

Same mechanism as VCSL/VSCO 2 CE in `factory-intake/ingest.sh`, new sources:

- `sfzinstruments/*` and `zynthian/TR808-fischer` repos: plain `git clone --depth 1` of the
  default branch (verify each repo actually packages WAV rather than FLAC in its release;
  some repos keep WAV only in release zips, not the checkout — if so, download+unzip the
  release instead of cloning).
- FreePats banks: tarball downloads from freepats.zenvoid.org (SFZ WAV variant, never the
  FLAC variant), extracted into `$INTAKE_ROOT/sfz/<bank>` — needs a small `curl + unzip`
  step in `ingest.sh` rather than git.
- Importer call shape is unchanged:
  `node scripts/import-sfz-instruments.mjs <intake-path> --library "<Name>" --license "CC0-1.0" --url <source-url>`
- **All of this rides the same importer re-run as PR #13** — anything run with the new
  importer code gets `regions.json` + sample-store links automatically. Adding libraries
  after #13 is deployed is fine too; a re-run is per-library and additive.
- Disk note: Tier 1 totals ~12 GB raw; the importer hardlinks unique WAVs into
  `factory/sfz/samples/`, so the store grows by roughly the deduped total. Check OMV volume
  headroom first.

## Pipeline part 2 — drum kits as Playfield presets (new baking path)

The user requirement: drums usable from **openDAW's drum machine**, not only as melodic
SFZ instruments. Playfield is the drum machine: an instrument device holding indexed
`PlayfieldSampleBox` pads, each referencing an `AudioFileBox` (`PlayfieldDeviceBoxAdapter`,
`packages/studio/adapters/src/devices/instruments/PlayfieldDeviceBoxAdapter.ts`).

Design — extend the offline baking pipeline (`scripts/bake-sfz-presets.ts`):

1. Kit libraries flow through the importer normally → each kit's regions.json is the
   source of truth for `key` → sample uuid/duration/filename.
2. A new **kit baker** reads a kit's regions.json and emits a factory **preset** (same
   `factory/presets/` + index.json idempotent merge as the instrument baker) that, when
   applied, builds:
   - one `PlayfieldDeviceBox` on an instrument unit,
   - one `PlayfieldSampleBox` per drum articulation, `box.index` = GM+ key slot
     (kick C1, snare D1, hats F#1/A#1…, following the `sfzinstruments/mappings`
     conventions), each `box.file` referencing an
   - `AudioFileBox` **keyed by the sample-store UUID** — the same identity contract the
     lazy loader resolves, so kits preload zero bytes and stream pads on first trigger.
3. Mapping details to decide at implementation time:
   - **Velocity layers / round robins**: a Playfield pad holds one sample. Bake one pad
     per articulation using a representative layer (loudest layer, round robin #1). Kits
     with distinct RR layers could optionally produce extra presets ("- Soft" variants)
     rather than trying to cram layers into one pad.
   - **Multi-mic kits** (Virtuosity): use the main/overhead mix; per-mic variants later if
     anyone wants them.
   - **TR-808**: 116 samples map almost 1:1 to pads — the easiest, highest-value kit bake.
4. Both SFZ-instrument presets and Playfield-kit presets can coexist per library; the
   browser's preset grouping (needs `PresetMeta` grouping from the lazy-samples plan)
   should show kits under a "Drum Kits" group.

## Open decisions for the user

1. **Batch scope**: all of Tier 1 (~12 GB raw) vs a leaner first cut (drop Unruly Drums /
   Frankensnare until industrial is wanted). Volume headroom on the OMV server decides.
2. **Kit pad layout**: GM+ keymapping as the default (compatible with existing MIDI files
   and the Euclid/Kadenz sequencers), or a curated 16-pad layout per kit?
3. **Velocity layers**: single representative sample per pad (recommended to start) or
   baked soft/loud kit variants?
4. FreePats per-bank license verification happens during batch building; anything that
   turns out GPL is dropped silently rather than argued about.