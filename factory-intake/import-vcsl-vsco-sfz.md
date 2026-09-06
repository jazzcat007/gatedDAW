# VCSL and VSCO 2 CE SFZ Instrument Intake

This intake adds the complete supplied SFZ instrument definitions, not a flattened
collection of one-shot samples. SFZ regions retain their key ranges, velocity
layers, root keys, loops, round robins, and keyswitches wherever OpenDAW's future
SFZ instrument loader supports them.

## Verified upstream scope

| Library | Ref | SFZ instruments | WAV files | License |
| --- | --- | ---: | ---: | --- |
| VCSL | `sfz` branch | 183 | 4,232 | CC0-1.0 |
| VSCO 2 CE | `SFZ` branch / release 1.1.0 | 75 | 3,168 | Confirm upstream distribution terms before publishing |

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

The current factory importer supports standalone audio samples and `.sf2` files;
it cannot load SFZ regions. The Nano sampler is single-sample and must not be
used as a substitute. Add an SFZ instrument loader/catalog type before setting
either manifest entry's `imported` flag to `true`.

At minimum, the loader must support `<control>`, `<global>`, `<group>`, and
`<region>` inheritance; `sample`, `lokey`, `hikey`, `lovel`, `hivel`, `pitch_keycenter`,
`loop_mode`, `loop_start`, `loop_end`, `off_by`, `group`, and `sw_*` opcodes.
Unsupported opcodes must be reported per instrument, never discarded silently.
