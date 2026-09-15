# Euclidean Sequencer (first of a sequencer family)

status: superseded-by-implementation
superseded-by: plans/sequencer-program.md
last-reviewed: 2026-09-15

The Euclidean device described below has shipped (native `EuclidDeviceBox`, adapter, editor,
manual, `crates/stock-devices/device-euclid`). This design doc predates that and is kept for
historical context only — do not treat it as current planning. `plans/sequencer-program.md` is the
active plan; it already tracks the one open item this doc's implementation left behind (a
duplicate, unused `EuclidSequencerDeviceBox`/adapter/editor path, `.orphaned` in the tree, that
needs reconciling against the shipped `EuclidDeviceBox` before new sequencer schemas are added).

## Goal

Add generative/pattern-based sequencer devices, starting with a Euclidean rhythm generator, without
reinventing device plumbing that already exists for Arpeggio, Cubed, and Spielwerk.

## Background: what already exists to build on

- **Arpeggio** (MIDI effect, `crates/stock-devices/device-arpeggio`) is the closest architectural
  precedent — a "pull source" MIDI effect wired before an instrument, stepping a musical rate grid,
  scheduling note-on/off with a gate-length fraction, correctly handling automation sub-block splitting
  and transport discontinuity. Roughly 70% of its Rust module (`first_index`, `release_completed`,
  `prune_source`, `ingest`, the `DISCONTINUOUS` handling, the sub-block-splitting loop in
  `process_events`) is generic "rate-grid note generator" machinery with nothing arpeggiator-specific
  about it — only `mode_run` (which note in the held stack plays at this step) is Arpeggio-specific.
- **Cubed** (instrument, `CubedDeviceBox.ts`) proves the box schema can hold a self-contained step
  pattern — an `array` of pattern `object`s, each with a `length` and a 64-element `steps` array (packed
  note/on-off/slide/accent per int32). A Euclidean sequencer's generated on/off pattern is simpler (no
  manual per-step editing needed, since it's algorithmically derived from steps/pulses/rotation), but
  this is proof the schema and instrument-side self-triggering (no input note required) already works
  end to end.
- **Spielwerk** (scriptable MIDI effect) already lists "arpeggiators and step sequencers" and
  "probability-based note filtering" as example uses in its own manual. This is a zero-engine-change
  prototyping ground — the Euclidean algorithm and its musical parameters can be validated as a Spielwerk
  script before committing to a native device.
- **ZeitGeist** (MIDI effect wrapping a shared `Groove` object via `Pointers.Groove`) is the precedent
  for "a device that applies a reusable pattern object," though its groove object is
  humanization/quantize-shaped, not sequencing-shaped.
- The **current** device-adding process (not the proposed future one) is what a new device must follow
  today: schema → generated Box → adapter → Rust/WASM DSP crate → UI editor → manual entry →
  registration in the four dispatch tables (`BoxAdapters.ts`, the processor factory,
  `DeviceEditorFactory.tsx`, `EffectFactories.ts`) → scripting API parity. `plans/loading-devices-at-runtime.md`
  proposes replacing this with folder-based runtime loading, but that work hasn't started; building on
  it now would mean building on a system that doesn't exist yet.
- The Rust/WASM engine migration is active (`plans/wasm-audio/feature-inventory.md`) and Arpeggio's Rust
  module is explicitly "a faithful port" of an older TS processor — new devices should be authored
  directly against the WASM engine, not the legacy TS path.

## Open design decision: does it need a held note?

Two shapes, and they lead to different DSP:

- **Standalone trigger generator** (recommended default). The device stores its own pitch/velocity and
  always fires on Euclidean-pattern steps, with no input note required — closer to how hardware/software
  Euclidean sequencers (Cthulhu, Redux, Pamela's New Workout) actually work, and immediately useful
  feeding a drum instrument with nothing held. An optional incoming note can transpose the fixed pitch,
  mirroring how Arpeggio treats octave range.
- **Gate on held input** (Arpeggio-shaped). Like Arpeggio, but instead of "which note in the stack plays
  this step" it's "does this step have a pulse" — requires a note held the whole time, more useful for
  melodic/chord-gating use cases.

Recommend shipping the standalone generator first — more broadly useful, matches genre convention, and
doesn't block a later held-note mode or a probability-gated variant from reusing the same core. Worth
re-confirming once the Phase 0 prototype is in front of you.

## Phase 0 — Prototype in Spielwerk (no engine changes)

- Write the Bjorklund's-algorithm Euclidean pattern generator as a Spielwerk script (JS), exposing
  steps/pulses/rotation/rate/gate/pitch as declared parameters (Spielwerk already surfaces declared
  parameters as automatable knobs).
- Ship it as a stock Spielwerk example (`spielwerk-examples.ts`, alongside the existing
  `tb-303-sequencer.js`-style examples) — validated, usable immediately, zero core risk.
- Use this to settle the open design decision above and the exact parameter ranges/defaults before
  writing Rust.

## Phase 1 — Extract a shared rate-grid module from Arpeggio

- Pull the generic scheduling machinery out of `crates/stock-devices/device-arpeggio/src/lib.rs` into a
  shared crate (e.g. `crates/stock-devices/device-sequencer-common`, or a `sequencer` module in an
  existing shared crate) — the rate-grid stepping, gate-length-to-duration conversion, retained-note-off
  scheduling, discontinuity handling, and the automation sub-block-splitting loop.
- Refactor Arpeggio to use it; verify its existing test suite
  (`crates/stock-devices/device-arpeggio/tests/arp.rs`) still passes unchanged — this step is a pure
  refactor, not a behavior change.
- This is what makes "several sequencers" cheap instead of copy-pasting ~150 lines of scheduling code
  into every new device crate.

## Phase 2 — Euclidean Sequencer device

- **Schema** (`packages/studio/forge-boxes/src/schema/devices/midi-effects/EuclidSequencerDeviceBox.ts`,
  via `DeviceFactory.createMidiEffect`): `steps` (int, 1-32), `pulses` (int, 0-steps), `rotation` (int,
  0-steps-1), `rate-index` (reuse `ArpeggioDeviceBoxAdapter.RateFractions`' shape), `gate` (float, step
  length fraction), `pitch` (int, MIDI note, standalone mode), `velocity`, and a `probability`/`humanize`
  amount (per-step chance a scheduled pulse actually fires — the first small step toward "generative,"
  not just "programmatic").
- **Algorithm**: Bjorklund's algorithm (E(k, n)) computed from steps+pulses+rotation — small, well-known,
  deterministic (no external dependency needed). Compute the on/off pattern once per parameter change and
  cache it in device state, not per block.
- **Adapter** (`EuclidSequencerDeviceBoxAdapter.ts`): mirrors `ArpeggioDeviceBoxAdapter`'s
  `#wrapParameters` shape.
- **DSP** (`crates/stock-devices/device-euclid/src/lib.rs`): built on the Phase 1 shared module; the only
  Euclidean-specific logic is "does grid step N have a pulse" (array lookup into the cached Bjorklund
  pattern) in place of Arpeggio's `mode_run`.
- **UI** (`EuclidSequencerDeviceEditor.tsx`): ship v1 with knobs (steps/pulses/rotation/rate/gate/pitch),
  matching `ArpeggioDeviceEditor.tsx`'s structure, plus a **read-only circular/linear step-pattern
  preview** so the generated rhythm is visible — this is the one place a Euclidean sequencer really
  benefits from more than knobs, worth the extra UI work even in v1 rather than deferring it. Interactive
  step-toggle editing (breaking strict Euclidean spacing) can come later as a "custom" mode.
- **Registration checklist** (mirrors Arpeggio's actual footprint): `BoxAdapters.ts`, the
  processor/device registry, `DeviceEditorFactory.tsx`, `EffectFactories.ts` (`MidiNamed` list + an
  `EffectFactory` entry with `IconSymbol` and manual URL), `DeviceManualUrls.ts`, a manual page
  (`packages/app/studio/public/manuals/devices/midi/euclid.md`), scripting API parity
  (`packages/studio/scripting/src/impl/devices/MIDIEffects.ts` + its parity test), and Rust unit tests
  mirroring `device-arpeggio/tests/arp.rs`.

## Phase 3+ — the rest of the sequencer family

Once Phase 1's shared module and Phase 2's device pattern both exist, each additional sequencer is
mostly "new pattern logic + new UI," not new plumbing:

- **Probability/trigger sequencer** — per-step % chance to fire, independent of Euclidean spacing —
  genuinely generative (different every pass), a natural sibling to the `probability` field floated
  above.
- **Polymeter/polyrhythm sequencer** — multiple independent-length lanes (e.g. a 5-step and a 7-step
  lane) running concurrently, phasing against each other — the classic generative-through-simple-math
  trick.
- **Turing-machine-style shift-register sequencer** — a classic semi-random hardware concept (a shift
  register with a "randomness" knob biasing how much each cycle mutates from the last) — properly
  generative rather than just probabilistic-on-a-fixed-pattern.
- **Random-walk / Markov melodic sequencer** — generates pitch movement, not just rhythm — a different
  axis of "generative" than the rhythm-focused devices above, and the one most likely to need its own DSP
  shape rather than reusing the Phase 1 module as directly.

Order roughly matches implementation cost — the first three all reuse the Phase 1 rate-grid module
almost unchanged; the melodic one is a bigger, separate design.

## Files touched (Phase 2, using Arpeggio's actual footprint as the checklist)

| File | Purpose |
|---|---|
| `forge-boxes/.../EuclidSequencerDeviceBox.ts` | Schema |
| `boxes/.../EuclidSequencerDeviceBox.ts` (generated) | Box class |
| `adapters/.../EuclidSequencerDeviceBoxAdapter.ts` | Parameter wrapping |
| `crates/stock-devices/device-euclid/src/lib.rs` | DSP (built on Phase 1 shared module) |
| `app/studio/.../EuclidSequencerDeviceEditor.tsx` (+ `.sass`) | UI |
| `BoxAdapters.ts`, processor registry, `DeviceEditorFactory.tsx`, `EffectFactories.ts` | The four dispatch tables |
| `DeviceManualUrls.ts` + manual `.md` | Docs |
| `scripting/.../MIDIEffects.ts` + parity test | Scripting API |

## Open questions

1. Standalone-trigger vs held-note-gate (see above) — recommend standalone, but worth validating in the
   Phase 0 Spielwerk prototype before committing to Rust.
2. Max step count — Cubed caps step patterns at 64; 32 is plenty for a Euclidean pattern (drum-hardware
   convention rarely exceeds 32) but worth confirming against the shared module's fixed-size buffers.
3. Where the Phase 1 shared crate lives and what it's named — needs a decision before Phase 1 starts, not
   blocking Phase 0.
