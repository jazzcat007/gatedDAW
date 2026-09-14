# Native SFZ Instrument Support

## Goal

Make an SFZ definition plus its audio files a first-class, offline-capable factory
instrument. This is the prerequisite for exposing the complete VCSL and VSCO 2 CE
libraries as instruments while retaining their authored key, velocity, loop,
round-robin, and keyswitch mappings.

The initial import targets are documented in
`factory-intake/import-vcsl-vsco-sfz.md`: 183 VCSL definitions and 75 VSCO 2 CE
definitions. Do not replace this work with batch conversion to single-sample Nano
presets.

## Product shape

- Add an `SFZ` instrument alongside `Soundfont` and `Nano` in the device menu.
- Add an `sfz` factory catalog containing one immutable definition file and its
  referenced WAV files per instrument. The factory must serve files locally in
  `OPENDAW_FACTORY_OFFLINE_ONLY` mode.
- The Browser displays SFZ entries by library and source license. Dragging an
  entry onto a notes track creates an SFZ device that references that catalog
  entry.
- Keep an import report for every definition: referenced files, resolved files,
  unsupported opcodes, and errors. An incomplete definition is unavailable rather
  than silently producing a partial instrument.

## Engine scope

Build the device through the existing compiled-device path: forge box schema,
adapter/factory, Rust/WASM processor, engine-module registration, UI editor, and
factory asset loading handshake. Do not base it on the parked runtime-device plan.

First release supports the SFZ features actually needed by VCSL/VSCO:

- inheritance through `<control>`, `<global>`, `<master>`, `<group>`, and
  `<region>`;
- relative `sample=` paths and `default_path=`;
- `lokey`, `hikey`, `key`, `lovel`, `hivel`, and `pitch_keycenter`;
- `loop_mode`, `loop_start`, and `loop_end`;
- `group`, `off_by`, `off_mode`, and `polyphony` for choke groups;
- `seq_length`/`seq_position` and `lorand`/`hirand` for round robins;
- `sw_lokey`, `sw_hikey`, `sw_last`, `sw_default`, `sw_down`, and `sw_up` for
  keyswitch articulations;
- amplitude envelope, gain/volume, pan, tune, transpose, and trigger handling.

Regions are selected at note-on using key, velocity, keyswitch, and sequence
state; their PCM must be preloaded or streamed without allocating in the audio
callback. Preserve the source sample rate and interpolation behaviour as a device
quality setting. Stereo samples, loop points, release samples, and choke groups
must be tested explicitly.

## Delivery phases

1. **Catalog and parser.** Define the on-disk SFZ catalog/index schema, write a
   deterministic importer/validator, and implement parsing plus inheritance in
   TypeScript with fixtures taken from VCSL and VSCO. Publish an opcode coverage
   report before importing either library.
2. **Playable core.** Add the device box, factory, adapter, WASM sample-load
   handshake, voice allocator, key/velocity region selection, pitch, envelope,
   looping, and stereo output. Ship a small CC0 fixture library first.
3. **Articulations.** Add round robin, choking, keyswitching, and release-trigger
   support; validate representative VCSL and VSCO instruments against a reference
   SFZ player.
4. **Factory integration.** Stage, validate, and publish all VCSL and VSCO
   definitions; preserve source URLs/licenses and retain a per-instrument failure
   report. Do not mark a library imported until every referenced sample resolves.
5. **Usability and performance.** Add an editor showing active articulation and
   region count, a preload/stream memory policy, cache eviction, import progress,
   and regression tests for large-library startup and Live Room asset transfer.

## Acceptance criteria

- Every supported source definition is one browsable instrument, not one preset
  per WAV file.
- All referenced samples resolve locally with no runtime network request.
- A test matrix covers sustain, looped, velocity-layered, round-robin, keyswitched,
  and choke-group instruments from both libraries.
- The importer fails loudly on an unsupported opcode or missing sample and records
  the instrument and source line responsible.
- Factory metadata preserves library, upstream revision, license, and source URL.
