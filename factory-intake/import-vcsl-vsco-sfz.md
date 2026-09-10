# VCSL and VSCO 2 CE SFZ Instrument Intake

This intake adds the complete supplied SFZ instrument definitions, not a flattened
collection of one-shot samples. SFZ regions retain their key ranges, velocity
layers, root keys, loops, round robins, and keyswitches wherever OpenDAW's future
SFZ instrument loader supports them.

## Verified upstream scope

| Library | Ref | SFZ instruments | WAV files | License |
| --- | --- | ---: | ---: | --- |
| VCSL | `sfz` branch | 183 | 4,232 | CC0-1.0 |
| VSCO 2 CE | `SFZ` branch / release 1.1.0 | 75 | 3,168 | CC0-1.0 (confirmed via the `LICENSE` file on the `SFZ` branch) |

VCSL states that its collection is CC0 and that it includes much of VSCO 2 CE.
Do not silently deduplicate either library: retain source attribution and let the
catalog surface duplicates as distinct library entries.

## Stage the exact upstream definitions and samples

Run this on the factory-intake host, where sufficient storage is available. The
SFZ files use relative paths, so each checkout must remain intact.

```bash
mkdir -p "$INTAKE/sfz"
git clone --depth 1 --branch sfz https://github.com/sgossner/VCSL.git "$INTAKE/sfz/VCSL"
git clone --depth 1 --branch SFZ https://github.com/sgossner/VSCO-2-CE.git "$INTAKE/sfz/VSCO-2-CE"
```

Validate the checkout before registering it:

```bash
find "$INTAKE/sfz/VCSL" -iname '*.sfz' | wc -l      # 183
find "$INTAKE/sfz/VCSL" -iname '*.wav' | wc -l      # 4232
find "$INTAKE/sfz/VSCO-2-CE" -iname '*.sfz' | wc -l # 75
find "$INTAKE/sfz/VSCO-2-CE" -iname '*.wav' | wc -l # 3168
```

## Required product support

The playable SFZ instrument (`SfzDeviceBox`/`SfzRegionBox`, a composite device — one
tiny WASM voice per region) and its Browser-panel catalog tab now exist: an SFZ tab
in the Browser panel (`SfzBrowser.tsx`) lists whatever `factory/sfz/index.json`
contains, and "Create SFZ Device" fetches the `.sfz` text plus every referenced WAV
over HTTP and builds a live device (`OpenSfzAPI`, `SfzSelection.ts`). The Nano
sampler is single-sample and must not be used as a substitute.

What remains before setting either manifest entry's `imported` flag to `true` is
staging: clone the library, run the importer below to populate
`factory/sfz/index.json` and `factory/sfz/<uuid>/source/...` on the OMV host
(`RUN_SFZ_IMPORTS=1` in `ingest.sh`, or invoke `scripts/import-sfz-instruments.mjs`
directly per library), and confirm the app's Browser panel serves those paths at
`/factory/sfz/...`.

At minimum, the loader must support `<control>`, `<global>`, `<group>`, and
`<region>` inheritance; `sample`, `lokey`, `hikey`, `lovel`, `hivel`, `pitch_keycenter`,
`loop_mode`, `loop_start`, `loop_end`, `off_by`, `group`, and `sw_*` opcodes.
Unsupported opcodes must be reported per instrument, never discarded silently.

## Current importer

The first implementation is available now. It validates each definition, expands
includes, resolves inherited regions, copies every referenced source file into an
offline factory bundle, and writes `sfz/index.json`. It records unsupported
opcodes on each entry; missing samples or zero-region definitions fail the run.

```bash
npm run import-sfz -- "$INTAKE/sfz/VCSL" \
  --root "$FACTORY_ROOT" --library VCSL --license CC0-1.0 \
  --url https://github.com/sgossner/VCSL/tree/sfz

npm run import-sfz -- "$INTAKE/sfz/VSCO-2-CE" \
  --root "$FACTORY_ROOT" --library "VSCO 2 CE" --license CC0-1.0 \
  --url https://github.com/sgossner/VSCO-2-CE/releases/tag/1.1.0
```

Both commands (and the equivalent `RUN_SFZ_IMPORTS=1` block in `ingest.sh`) are idempotent — content-hash UUIDs mean re-running against an already-staged library just skips duplicates, per `manifest.json`'s `importMode: "idempotent-content-uuid"` policy.

Use `--dry-run` first. Round robin, keyswitch, choke groups, and `#include` are
still deliberately unsupported by the playable device — opcodes it can't apply are
recorded per instrument in `unsupportedOpcodes` and surfaced in the Browser tab, not
silently dropped, but a region using only those features will play with whatever
the device does support (e.g. ignoring a round-robin pick, always sounding).
