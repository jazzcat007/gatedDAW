# Sequencer Program

## Objective

Build a coherent family of conventional and human-controlled generative sequencers for gatedDAW.
The result should feel like an instrument a musician steers, not an algorithm that replaces the musician.

The program takes inspiration from the musical ideas made successful by modern DAWs and hardware
sequencers: direct pattern entry, independent lane lengths, probability, conditions, chord awareness,
repeat engines, modulation, clip performance, and fast mutation. It does not reproduce another product's
UI, terminology, presets, assets, firmware behavior, or implementation.

The defining workflow is:

```text
write or generate -> constrain -> perform/mutate -> hear immediately -> keep or undo -> capture as notes
```

Generation must always remain bounded, legible, reproducible when desired, and easy to turn into ordinary
editable note data.

## Product principles

### Human authority

- Every generator exposes its musical boundaries: scale, pitch range, density, motion, rhythm, repetition,
  tension, and variation.
- The musician can lock any lane, step, note, or property before generating or mutating.
- Generate is an explicit edit. It writes visible data, is undoable, and never silently changes on playback.
- Evolve is a separate performance behavior. It can vary playback without overwriting the source pattern.
- Commit/capture turns the heard result into normal note events. Nothing remains trapped in a generator.
- Seed, cycle, and variation state are visible. The same project renders the same result unless the musician
  explicitly asks it to change.
- Panic, bypass, reset, and return-to-saved-pattern are always one action away.

### Musical randomness

- Randomness operates on named musical properties rather than an undifferentiated randomize button.
- Amount controls distance from the authored pattern, not merely the number of random values.
- Constraints are applied before emission: scale, chord, range, voice count, density, minimum rests, maximum
  leap, and repetition limits.
- Probability decisions are deterministic hashes of musical identity, seed, cycle, lane, step, and property.
  They do not depend on processor traversal order.
- Mutations can be auditioned, accepted, rejected, and compared with the source.
- Useful accidents are preservable at the smallest practical level: lock one note, one step, one lane, or the
  entire variation.

### One vocabulary across devices

All sequencers should use the same concepts where the music is the same:

- `length`: active steps in a lane;
- `rate`: duration of one step;
- `phase`: musical offset from the project grid;
- `direction`: forward, reverse, ping-pong, pendulum, random-order;
- `gate`: duration relative to a step;
- `chance`: probability that an eligible event plays;
- `condition`: cycle/neighbor/fill rule that makes an event eligible;
- `repeat`: subdivisions emitted within one step;
- `micro-offset`: signed timing displacement after groove;
- `seed`: stable source of variation;
- `cycle`: completed passes through that lane;
- `lock`: exclude this value from mutation;
- `fill`: project performance signal available to conditions and generators.

Names, units, mappings, shortcuts, colors, and gestures should be shared rather than reinvented per device.

## Existing foundation

This plan extends working systems instead of replacing them.

| Capability | Present implementation | Program role |
| --- | --- | --- |
| Arrangement notes | `NoteEventBox`, note regions, piano roll | Final editable/captured representation |
| Session sequencing | audio/note/value clips and clip state machine | Performance and pattern launching |
| Note variation | chance, play-count/play-curve, repeat expansion | First conditional/generative primitives |
| MIDI effects | Arpeggio, Chord, Pitch, Velocity, Zeitgeist | Conventional transformation chain |
| Generated rhythm | native `EuclidDeviceBox` WASM device | First algorithmic sequencer |
| Generated harmony | native `KadenzDeviceBox` progression player | Foundation for harmony-aware sequencing |
| Pattern instrument | Cubed, 16 patterns x 64 steps | Proven direct step-grid and pattern switching UX |
| User-programmed sequencing | Spielwerk | Fast prototyping and advanced user extension |
| Modulation | LFO, Steps, Random, Macro | Parameter motion and performance control |
| Hardware output | MIDI Output, MIDI learn, clock plumbing | External instrument workflow |
| Timing | 960 PPQN, tempo/signature maps, groove, sample-offset events | Shared accurate musical clock |
| Engine | Rust/WASM, fixed-capacity real-time structures | Native production path |

The bundled Spielwerk 303 sequencer is also a useful precedent for seeded pattern generation with length,
scale, octave, slide, accent, and rest constraints. New prototypes should extend that vocabulary instead of
starting from an unrelated scripting convention.

### Cleanup before new work

There are two Euclidean device shapes in the working tree. `EuclidDeviceBox` is the integrated schema, adapter,
editor, scripting facade, WASM registration, manual, and device crate. The untracked
`EuclidSequencerDeviceBox` path duplicates it and must be reconciled before new sequencer schemas are added.
Preserve the integrated box name and project compatibility unless an explicit migration proves necessary.

The older Euclidean plan also describes work that has already landed. Update or archive it after the duplicate
is resolved so it does not remain an incorrect execution guide.

## Product model

The program has four layers. Keeping them separate prevents a universal sequencer from becoming an
unmaintainable collection of modes.

```text
Harmony context + performance state
                 |
Pattern data -> lane evaluators -> note transforms -> instruments/MIDI out
     |                  |                |
 authored/locked     clock/logic       arp, chord, scale, humanize
     |
generate/mutate/capture/commit
```

### Layer 1: ordinary musical data

Note regions and clips remain the canonical interchange and editing format. A generated performance can always
be recorded or committed into this layer.

### Layer 2: reusable pattern data

A pattern contains lanes and step properties but no DSP. It is serializable, copyable, preset-capable, and
editable while stopped. Multiple devices may reference or copy patterns, but v1 should use owned pattern data
to avoid alias-editing ambiguity.

### Layer 3: sequencer devices

Devices interpret pattern data or algorithms and emit notes. Small focused devices compose in the existing MIDI
effect chain. Stateful branching waits for the non-destructive `NoteTimeline` / `NoteFeed` work described in
`midi-composite.md`.

### Layer 4: project context

Harmony, Fill, and performance macros are optional shared sources. A device remains fully functional without
them and declares when it follows them.

## Sequencer catalogue

### Conventional devices

#### Pattern Sequencer

The central general-purpose step sequencer.

- 1-64 steps initially; fixed storage may later grow to 128 after measuring UI and state costs.
- Polyphonic step chords, with a practical voice cap.
- Per-step note, velocity, gate, tie, accent, chance, condition, repeat, and micro-offset.
- Scale-aware keyboard and fold-to-used/fold-to-scale views.
- Record, overdub, erase, step record, and unquantized capture into steps.
- Per-lane start/end, rate, direction, and rotation.
- Pattern bank with quantized switching and duplicate/clear/copy/paste.
- Notes can be dragged out or committed to a clip.

This is the normal sequencer first. It must be excellent without any generative feature enabled.

#### Mono Sequencer

A focused melodic sequencer optimized for a single line.

- Pitch, gate/tie, velocity/accent, slide, octave, chance, condition, repeat, and micro-offset lanes.
- Scale/chord following, maximum leap, pitch range, and configurable note priority.
- Accumulator lane for transposition or another chosen property, resettable by cycle or performance action.
- Legato output with stable note identities and correct note-off handling.
- Independent lane lengths are allowed, but the main note lane remains visually dominant.

Cubed keeps its integrated acid identity; this device emits MIDI and serves any instrument.

#### Drum Sequencer

- Rows map to MIDI notes or Playfield pads.
- Per-row length, rate multiplier, rotation, mute, solo, choke group, and probability bias.
- Step velocity, accent, repeat/ratchet, flam, condition, and micro-offset.
- Record from pads; paint, velocity-drag, and repeat gestures.
- Density and variation macros may target selected rows or the whole pattern.
- Commit to one note clip, preserving pitches and timing.

#### Chord Sequencer

Kadenz is the starting point rather than a second competing device.

- Keep explicit chord-degree steps, quality override, rests, duration, inversion, spread, and strum.
- Add per-step bass, voicing lock, chance, condition, and repeat/arpeggiate mode.
- Add voice-leading strategies with a visible range and maximum movement.
- Publish optional harmony context for followers.
- Record played chords into steps and drag/commit the output to a clip.
- Separate `Generate` (writes steps) from `Evolve` (temporary constrained variations).

#### Arpeggiator 2

Extend or compatibly replace the existing Arpeggio only after common scheduler extraction is proven.

- Pattern modes plus a user-drawn order lane.
- Chord, pitch, octave, velocity, gate, repeat, and micro-offset lanes.
- As-played ordering with stable held-note identity.
- Per-step skip, chance, condition, and ratchet.
- Reset modes: free, transport, bar, chord change, first note.
- Input expression should be preserved when the note event model supports it.

### Human-controlled generative devices

#### Euclid+

Evolve the existing Euclid compatibly.

- Preserve current steps, pulses, rotation, rate, gate, pitch, and velocity fields.
- Add a deliberate parameter migration only by appending fields.
- New controls: chance, accent rotation, repeat mask, cycle mutation amount, seed, and reset mode.
- Optional held-note mode: generated gates trigger the input note/chord; standalone mode remains the default.
- Multi-lane Euclidean rhythms belong in Pattern Sequencer or Drum Sequencer, not inside this compact device.

#### Probability and Conditions

A small note FX for material coming from clips or another sequencer.

- Chance by note, pitch, velocity range, beat position, and cycle.
- Conditions: always, first, not-first, fill, not-fill, previous-played, previous-skipped, every A of B,
  and alternating.
- Deterministic decision identity survives repeated reads and parallel consumers.
- Conditions may gate notes or choose between two outputs once MIDI branching exists.

The corresponding per-step fields belong directly in Pattern/Mono/Drum sequencers; the effect makes the same
language available to ordinary clips.

#### Repeat Engine

- Repeats/ratchets with count, rate, gate, velocity curve, pitch curve, and probability.
- May affect all input notes or only notes matching a beat/pitch/velocity selector.
- Momentary performance override for roll rates.
- Output identities include repeat index so chance and note-off behavior remain deterministic.

#### Stochastic Melody

A bounded melody generator with rhythm and pitch modeled independently.

- Rhythm: density, clustering, rest limits, syncopation, Euclidean bias, and phrase length.
- Pitch: scale/chord source, range, center, maximum leap, contour, repetition, and target-note gravity.
- Memory: order-1 transition model at first; no opaque machine-learning dependency.
- Human steering: Freeze Rhythm, Freeze Pitch, Lock Step, Regenerate Selection, and Mutation Amount.
- `Generate` writes an inspectable pattern. Live Evolve is opt-in, seeded, and capturable.

#### Shift Register

A Turing-style concept implemented from the musical principle, with original naming and UX.

- N-bit or N-cell circular state, mutation probability, range, scale quantization, and pulse extraction.
- Manual state editing and individual locked cells.
- Mutation is clocked and visible; reseed, restore, and capture are immediate.
- Separate pitch and gate interpretations can be combined without hidden coupling.

#### Random Walk

- Walk over scale degrees or a user-authored pool.
- Up/down/stay weights, step sizes, boundaries, attraction point, reset cadence, and seed.
- Optional chord-tone gravity and phrase-end resolution.
- Each step can be pinned; pinned steps become waypoints for generation.
- Generate-to-pattern first; live mode follows after capture and reproducibility are proven.

#### Interlocking Lanes

The original answer to independent-lane/matrix sequencing.

- Separate circular lanes for pitch, octave, velocity, gate, chance, repeat, and modulation values.
- Every lane has independent length, rate multiplier, direction, rotation, and reset divisor.
- A note clock samples the current value from each enabled lane to assemble the event.
- Lanes can be manually drawn, rotated, randomized, Euclidean-filled, or generated within a range.
- The UI explicitly shows when the combined super-cycle repeats.

This feature should follow the simple Pattern and Mono sequencers. It depends on stable lane primitives and would
otherwise force the initial schema to solve every future case.

## Shared harmony system

### Harmony Track

Add a project-level optional timeline containing harmonic events:

- tonic and scale;
- chord root/degree;
- chord quality and extensions;
- inversion/voicing hints;
- optional bass note;
- label and color.

Consumers choose one of:

- `Local`: use device settings;
- `Project scale`: follow tonic/scale only;
- `Project chord`: constrain to the active chord;
- `Publish`: Kadenz/chord sequencer writes or supplies the context.

The first implementation should avoid two simultaneous publishers. Either the Harmony Track owns the data and
Kadenz edits it, or a single selected device publishes into a derived runtime view. Persisted duplicated truth is
not acceptable.

### Harmony API

One shared music-theory module should provide:

- scale membership and degree conversion;
- chord spelling;
- nearest-note quantization with deterministic tie breaking;
- range folding;
- voice-leading cost and voicing candidates;
- tension classification for constrained generation.

Kadenz, Chord, Pattern Sequencer, Random Walk, Stochastic Melody, and scripting must use the same implementation.

## Performance model

### Global performance sources

- `Fill`: momentary/latching project boolean, MIDI mappable.
- `Variation`: bipolar or unipolar macro controlling eligible mutation depths.
- `Density`: optional macro controlling eligible gate probabilities/densities.
- `Energy`: optional macro mapping to velocity, repeat, register, or device-defined targets.
- Scene and clip launch actions.

These are sources. Each device opts into them with explicit amounts; they do not change devices silently.

### Pattern snapshots

Each pattern device gets a small snapshot workflow:

- Source: the authored pattern.
- Variation: the current temporary mutation.
- Accept: make the variation the new source in one undoable edit.
- Revert: discard variation.
- Duplicate: save it to another pattern slot.
- Capture: print emitted notes for a selected number of bars.

### Clip launcher integration

Add in stages:

1. scene launch and stop actions;
2. per-clip launch quantization and legato replace;
3. follow actions after N loops;
4. release actions for momentary performance;
5. capture a launcher performance into the arrangement;
6. controller feedback and mappings.

Sequencer pattern changes should use the same quantization vocabulary as clips.

## Editing and interaction design

### Common layout

Pattern devices use an original three-zone editor:

```text
[pattern/transport header: bank, length, rate, seed, variation, capture]
[primary grid: steps x note/drum/lane content]
[property deck: velocity | gate | chance | condition | repeats | offset]
```

The primary grid stays usable at normal device-panel size. A pop-out editor is appropriate for polyphonic or
multi-lane work, but both views edit the same data and transaction.

### Gestures

- Click toggles or places; drag paints.
- Vertical drag adjusts the cell's primary value.
- Modifier-drag adjusts velocity or a selected property without switching tools.
- Shift constrains; Alt erases/resets; duplicate gestures follow existing gatedDAW conventions.
- One drag gesture is one undo step.
- Multi-selection and property editing work across steps.
- Every non-obvious gesture has a visible command/menu equivalent.
- Keyboard navigation and value entry are first-class, not retrospective accessibility work.

### Generative controls

All generate/mutate dialogs use the same structure:

- Scope: pattern, selection, lane, unlocked steps.
- Preserve: pitches, rhythm, velocities, articulations, downbeats, endpoints.
- Bounds: scale/chord, range, density, motion, repetition, tension.
- Amount: distance from source.
- Seed: visible and rerollable.
- Preview: temporary until Apply; Cancel restores exactly.

For rapid hardware-like operation, the common cases also get direct buttons: mutate, rotate, fill, clear, lock,
accept, and revert.

## Data architecture

### Pattern schema strategy

Do not begin with a maximally generic recursive schema. Start with shared packed step helpers and focused boxes.

Recommended v1 pattern shape:

```text
PatternSequencerDeviceBox
  parameters: selectedPattern, switchQuantize, outputMode, harmonyMode
  patterns[16]
    length
    rateIndex
    direction
    steps[64]
      active / tie / accent / condition / repeats       packed flags
      pitch / octave                                    compact integers
      velocity / gate / chance / microOffset            compact numeric values
```

Polyphonic notes should not be forced into one packed integer. Use a fixed, bounded voice array per step or a
separate event collection after measuring graph-edit and serialization cost. Prototype both representations and
record bundle size, transaction cost, generated-code size, engine binding cost, and UI edit ergonomics before
freezing the schema.

Schema rules:

- Append fields; do not renumber existing fields or pointer enums.
- Generated box files are never hand-edited.
- Every persisted random feature stores its seed and enough state to reproduce playback.
- Pattern data is content, not parameter automation.
- Parameters affecting interpretation are automatable only when real-time changes have defined note-lifecycle
  behavior.
- Fixed maximums must be shared constants across schema, adapters, UI, Rust, scripting, and tests.

### Shared Rust crates/modules

Grow the existing `device-sequencer-common` into narrowly scoped components:

- `clock`: grid iteration, phase, direction, cycle and reset semantics;
- `lifecycle`: retained note-ons, scheduled offs, panic/discontinuity cleanup;
- `decision`: stable hash and probability/condition evaluation;
- `repeat`: sub-event expansion and velocity/pitch curves;
- `pattern`: read-only bounded pattern view supplied by a device binding;
- `harmony`: no-std scale/chord quantization shared with device code where practical.

Do not make one base device with virtual mode switches. Leaf devices should compile only the behavior they need.
The render loop remains allocation-free.

### Note identity and multi-consumer prerequisite

Parallel lanes, selectors, and MIDI composites must build on the planned non-destructive `NoteTimeline` plus
per-consumer `NoteFeed`. Sequential RNG streams are incompatible with repeated or warped reads. The identity
scheme must include source, loop cycle, lane, step, voice, and repeat index where applicable.

The timeline/feed extraction is therefore a dependency for branching Note FX, but not for a standalone Pattern,
Mono, Drum, Euclid, Kadenz, or Stochastic generator.

### Event-model evolution

Current note events have position, duration, pitch, velocity, cents, chance, play count, and play curve. Add new
persisted note fields only when they are useful outside a sequencer.

- Keep step condition/repeat/lock in pattern data initially.
- Keep micro-offset as actual event position when committing.
- Preserve cents on generated/processed notes.
- Add pressure, timbre, per-note pan/gain expression only as part of a separately designed expressive-note/MPE
  project; do not smuggle partial MPE into the sequencer schema.

## Scripting and interchange

### Spielwerk

Prototype algorithms here before native devices:

1. condition evaluator;
2. repeat engine;
3. bounded random walk;
4. shift register;
5. stochastic rhythm/pitch generator.

Bundled examples become executable product experiments. Promote an algorithm to native Rust only after its musical
controls and discontinuity behavior are settled.

### Project scripting API

Every native pattern device exposes:

- pattern selection and pattern count;
- get/set/clear/rotate steps;
- generate/mutate with an explicit seed and options;
- lock state;
- commit/capture action where headless execution is meaningful;
- harmony follow mode;
- all automatable parameters.

Script facade parity tests are required in the same phase as each device, not deferred.

### MIDI and DAWproject

- Commit/capture produces regular note regions/clips and therefore exports through existing MIDI/DAWproject paths.
- Import MIDI into a pattern through an explicit quantize/reduction dialog; preserve the original clip if conversion
  would be lossy.
- Pattern-native metadata does not need a proprietary interchange format in v1.
- External MIDI output must preserve sample-offset scheduling, transport clock, and note cleanup.

## Delivery roadmap

Each phase ends with a usable musical capability, documentation, tests, and a project round trip.

### Phase 0 - reconcile and specify

- Remove or merge the duplicate untracked Euclidean implementation without breaking `EuclidDeviceBox` projects.
- Audit Euclid, Kadenz, Cubed, Arpeggio, note chance/repeats, modulation, clip launcher, and MIDI output.
- Freeze common terminology, reset semantics, rates, directions, condition list, and deterministic seed contract.
- Write test vectors for clock indices, directions, cycle counts, chance, conditions, repeats, and discontinuities.
- Update obsolete Euclidean planning documents.

Exit: one authoritative feature inventory and no duplicate device architecture.

### Phase 1 - shared sequencing primitives

- Extract/complete clock and lifecycle helpers without changing Arpeggio, Euclid, or Kadenz behavior.
- Add deterministic decision hashing and the common condition evaluator.
- Add repeat expansion with bounded output and identity rules.
- Provide TS mirrors only for editor previews and generated-data operations; Rust remains playback authority.
- Test automation splitting, transport stop/start, seek, loops, tempo/signature changes, long gates, overlapping
  repeats, and event buffer limits.

Exit: existing devices pass unchanged and new primitives have native test vectors.

### Phase 2 - Pattern Sequencer MVP

- Monophonic 64-step Pattern Sequencer MIDI FX with 16 patterns.
- Active, pitch, velocity, gate/tie, accent, chance, condition, repeats, and micro-offset.
- Length, rate, direction, rotation, seed, pattern switching, copy/paste, undo, and clear.
- Input step recording and commit to note clip.
- Device editor, pop-out editor if required, manual, presets, scripting, and WASM registration.

Exit: a musician can write a complete deterministic pattern, perform pattern changes, and print it to a clip.

### Phase 3 - human-controlled generation

- Shared generate/mutate preview transaction.
- Locks at property, step, selection, and lane scope.
- Constrained pitch/rhythm/velocity generators.
- Source/Variation/Accept/Revert/Duplicate workflow.
- Variation, Density, and Fill mappings with MIDI learn.
- Capture evolving playback over a selected duration.

Exit: generation is playable, reversible, and capturable; every change stays within explicit musical bounds.

### Phase 4 - drums and repeats

- Drum Sequencer using the same step-property vocabulary.
- Per-row polymeter, rotation, rate multiplier, choke-aware audition, and row targeting.
- Repeat Engine MIDI FX and momentary roll performance control.
- Playfield integration and pad recording.

Exit: complete beat workflow for internal drums and external MIDI hardware.

### Phase 5 - harmony

- Decide and implement the single-source-of-truth Harmony Track model.
- Extract shared harmony/voicing API from Kadenz/Chord code.
- Upgrade Kadenz into the Chord Sequencer workflow.
- Add scale/chord follow to Pattern/Mono generators.
- Add voice-leading preview and generated progression locking.

Exit: rhythm, melody, and chords can follow one editable harmonic structure without destructive rewriting.

### Phase 6 - Mono and Interlocking Lanes

- Focused Mono Sequencer with slide, accumulator, constraints, and chord following.
- General lane runtime: independent length, rate, direction, rotation, reset, lock, and generator.
- Interlocking Lanes device after the common lane runtime is proven in Mono and Drum.
- Super-cycle display and capture.

Exit: deep polymetric melodic sequencing remains understandable and under direct human control.

### Phase 7 - generative device suite

- Probability and Conditions MIDI FX.
- Stochastic Melody.
- Shift Register.
- Random Walk.
- Promote only the prototypes that pass musical playtests and deterministic render tests.

Exit: several distinct generative strategies share one control language and can all commit to ordinary notes.

### Phase 8 - launcher performance

- Scene actions, legato launch, follow actions, release actions, and performance capture.
- Pattern/scene change quantization uses one timing model.
- Controller maps and feedback for grid devices, including an OXI One user mapping through public MIDI behavior.
- Touch layout and keyboard-only workflow.

Exit: sequencers, clips, scenes, and hardware act as one performance system.

### Phase 9 - expressive and modular expansion

- Note-, MIDI-, and audio-driven modulation sources.
- Expressive note/MPE project: pressure, timbre, per-note curves, routing, editing, and capture.
- Curve/MSEG modulation.
- Note Grid only after the pattern, lane, branching, and modulation primitives are stable.

Exit: modular sequencing is composition of proven primitives, not a parallel engine hidden in a patching UI.

## Acceptance criteria for every sequencer

### Musical behavior

- Stable timing through tempo automation, signatures, loop wraps, count-in, seek, and clip launch.
- Correct note-off ordering and no stuck notes after bypass, deletion, pattern switch, stop, or panic.
- Defined reset behavior for transport, bar, pattern, chord, and manual reset.
- Deterministic offline and real-time results for the same project/seed.
- Useful defaults that produce a musical result within one minute.

### Editing

- Every gesture is one coherent undo transaction.
- Copy/paste and duplicate preserve all visible state.
- Pattern edits round-trip through `.od` without loss.
- Schema changes include migration/backward-compatibility tests.
- Commit/capture agrees with audible output at PPQN positions and durations.

### Engine

- No allocation in the render path.
- Fixed buffers have explicit overflow behavior and tests.
- Parameter changes split processing at the update clock where needed.
- Event ordering is total and stable: note-off/choke before note-on at equal time.
- Random decisions do not depend on consumer count, traversal order, block size, or editor visibility.

### Integration

- Factory/browser creation, adapter, editor, WASM linker, manual, preset, scripting API, clipboard, and unknown-box
  fallback are all covered.
- MIDI output and internal instruments behave equivalently modulo device capabilities.
- Accessibility: keyboard editing, focus order, labels, value entry, contrast, and reduced-motion behavior.
- Performance is measured with maximum patterns, dense repeats, and multiple simultaneous sequencers.

## Test matrix

| Level | Required coverage |
| --- | --- |
| Pure Rust | clock, direction, cycle, conditions, hash decisions, repeat expansion, note lifecycle |
| Device Rust | parameter mapping, pattern reads, discontinuity, overflow, automated changes |
| Schema/adapters | creation, constraints, migration, serialization, clipboard, undo |
| WASM parity | adapter mappings, engine binding, real-time/offline agreement |
| UI | grid gestures, locks, preview/apply/cancel, pattern switch, selection, keyboard navigation |
| Scripting | factory and facade parity, step mutation, seeded generation |
| Integration | clip capture, MIDI output, loop/seek/tempo, launcher, project reload |
| Musical fixtures | canonical drum patterns, Euclidean patterns, scales/chords, seeded snapshots |

Block-size invariance deserves a dedicated test: render the same seeded passage with different host quantum
fragmentation and assert identical musical events.

## Scope boundaries

Not part of the first program:

- copying the appearance, labels, screen hierarchy, pad layout, presets, or manuals of another product;
- importing proprietary pattern/project formats;
- CV output from a normal browser without an explicit supported hardware bridge;
- an all-purpose modular Note Grid before the shared primitives exist;
- neural generation whose decisions cannot be explained, bounded, seeded, and reproduced;
- unlimited dynamic event graphs or allocation on the audio thread;
- partial MPE fields without an end-to-end expressive-note design.

## Recommended first release

Call the first user-visible milestone **Patterns & Variations**. It includes:

1. authoritative Euclid cleanup;
2. shared deterministic clock/condition/repeat primitives;
3. Pattern Sequencer MVP;
4. lock-aware Generate and Mutate;
5. Fill, Variation, Accept/Revert, and Capture;
6. complete MIDI Output and clip-commit workflows.

This delivers both a high-quality standard sequencer and the core human-controlled generative loop. Drum,
harmony, polymetric lanes, and more exotic generators then extend a vocabulary users already understand.
