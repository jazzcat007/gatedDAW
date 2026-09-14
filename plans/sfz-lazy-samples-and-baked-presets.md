# SFZ — Lazy Sample Loading & Server-Baked Presets

## Goal

Two connected outcomes:

1. **Creating an SFZ instrument from the catalog should be near-instant**, instead of downloading and
   importing every referenced WAV up front. A 54-region instrument currently fetches 54 WAVs before the
   device appears.
2. **The SFZ device's preset list should be populated**, instead of showing "No presets available".

Both reduce to the same underlying change: make an SFZ instrument's samples *referenced* rather than
*materialised* at creation time. Once a region's `AudioFileBox` can exist without its bytes, on-demand
loading and pre-baked presets both fall out of machinery openDAW already has.

Guiding constraint for this plan: **do the work on the server** (at catalog-staging time, on the OMV host)
wherever it doesn't cost end-user runtime performance. The browser should receive resolved data, not raw
data plus a job.

## What already exists (do not rebuild)

The investigation behind this plan found more standing infrastructure than expected. Four load-bearing
facts:

**Sample loading is already lazy and already content-addressed.**
`GlobalSampleLoaderManager` (`packages/studio/core/src/samples/GlobalSampleLoaderManager.ts`) only fetches a
sample's bytes when something calls `getOrCreate(uuid)` / `getAudioData(uuid)` — i.e. on real playback or
waveform need. Until then an `AudioFileBox` is inert metadata. Resolution order is: in-memory `#cache` →
`SampleStorage` (OPFS) → `#fetchFromApi` → `SampleProvider.fetch`. Nothing about that needs changing.

**Presets already reference audio by stable UUID rather than embedding it.**
`PresetDecoder.replaceAudioUnit` (`packages/studio/adapters/src/preset/PresetDecoder.ts:206-239`) gives
`AudioFileBox` and `SoundfontFileBox` special treatment: they **keep their UUID** across encode/decode
(every other box gets a fresh one) and are skipped entirely if already present in the target graph. The
dependency walk uses `stopAtResources: true`. So a `.odp` preset is already a *reference* to audio, and
applying one never fetches bytes.

**The preset format is already generic over device type.**
`InstrumentPresetMeta.device` is typed `InstrumentFactories.Keys`, and `Sfz` is a valid key. A `.odp` in
`/factory/presets/` with `device: "Sfz"` appears in the SFZ device's pager via
`PresetService.presetsFor("instrument", "Sfz")`. No schema or plumbing change is needed to *have* SFZ
presets — only to *produce* them.

**`.odp` generation works in plain Node.**
This is the finding that makes server-side baking viable. `PresetEncoder.encode()` needs a live `BoxGraph`,
but `packages/studio/adapters/src/preset/PresetDecoder.replaceAudioUnit.test.ts:92-96` builds one under
vitest (Node) with `ProjectSkeleton.empty({createDefaultUser: false, createOutputMaximizer: false})`,
creates an `AudioUnitBox` + device + `AudioFileBox` with an explicit `endInSeconds`, and calls
`PresetEncoder.encode(unit, {includeTimeline: true})`. No DOM, no headless browser. A Node script can build
exactly the graph `InstrumentFactories.Sfz.create` builds and serialise it.

## What moves to the server

Today the browser does four jobs per catalog instrument that the importer is already better placed to do.
The importer *already parses every `.sfz`* — it has to, to find and validate samples — and then throws that
work away, publishing only counts.

| Job | Today | Proposed |
|---|---|---|
| Parse `.sfz` text | Browser fetches text, runs `SfzParser.parse` | Importer publishes resolved `regions.json` |
| Resolve sample paths | Browser, via `SfzParser.resolveSamplePath` | Importer, once, at staging time |
| Learn sample duration | Browser, by downloading + decoding the WAV | Importer, by reading the 44-byte WAV header |
| Assemble a playable instrument | Browser, per click | Importer, once, as a `.odp` preset |

Beyond speed, moving the parse server-side removes a live maintenance hazard. The tokenizer regex exists in
**two** places — `packages/studio/core/src/sfz/SfzParser.ts` and `scripts/import-sfz-instruments.mjs` — and
PR #11 had to fix the identical bug in both. Driving catalog content off the importer's single parse means
that class of divergence stops affecting the 258-instrument surface. The client parser stays, but only for
the local "Load SFZ…" file picker, where the server genuinely cannot see the file.

Catalog scale, from `factory-intake/manifest.json`: VCSL is 183 instruments / 4232 WAVs, VSCO 2 CE is
75 / 3168 — **258 instruments, ~7400 WAVs**.

## Design

### 1. Content-addressed sample store (server)

The importer currently copies each instrument's samples to
`factory/sfz/<instrument-uuid>/source/<path-relative-to-library-root>`. Samples shared between instruments
in the same library — common in keyswitch sets — are copied once per instrument.

Add a flat, content-addressed store alongside it:

```
factory/sfz/samples/<sample-uuid>          # the WAV bytes, no extension (mirrors /factory/samples/<uuid>)
```

`<sample-uuid>` is the existing `contentUuid()` helper (sha256 → UUIDv4-shaped) over the WAV bytes. Two
consequences worth having:

- **Dedupe.** One copy per unique WAV instead of one per referencing instrument. Use hardlinks
  (`link()`, same filesystem) so this costs no additional bytes over the existing `source/` tree.
- **Zero client-side lookup.** The fetch URL is a pure function of the UUID, so the browser needs no
  UUID→path index at all. The server's directory layout *is* the index.

Keep the existing `source/` tree as-is. It stays the human-inspectable, license-auditable copy, and the
local file-picker path is unaffected.

### 2. Resolved per-instrument manifest (server)

New file per instrument:

```
factory/sfz/<instrument-uuid>/regions.json
```

```jsonc
{
  "version": 1,
  "regions": [
    {
      "sample": "b3f1…-…",        // sample-store UUID
      "fileName": "KSHarp_E1_f1.wav",
      "durationInSeconds": 2.418,
      "sampleRate": 44100,
      "channels": 2,
      "keyLo": 28, "keyHi": 29, "rootKey": 28,
      "velLo": 0, "velHi": 127,
      "loopMode": 0, "loopStart": 0, "loopEnd": 0,
      "attack": 0.001, "decay": 0.001, "sustain": 1, "release": 0.05,
      "volume": 0, "pan": 0, "tune": 0
    }
  ],
  "unsupportedOpcodes": ["ampeg_hold"]
}
```

The numeric fields are exactly `SfzParsedRegion` minus `sample`/`defaultPath` (already resolved), so the
client maps straight through `toSfzAttachment` with no interpretation. Emitting the *derived* values —
`sustain` already unit-scaled, `tune` already in cents, `keyLo`/`keyHi` already defaulted from `key` — keeps
the two parsers from having to agree on opcode semantics as well as tokenisation.

`durationInSeconds` is the field that unlocks everything else: with it, an `AudioFileBox` can be created
complete, without a download. Read it from the WAV header (`fmt ` + `data` chunk sizes), not by decoding.

`index.json` stays lean — it is the browse listing and is fetched on every studio load. Per-sample detail
belongs in `regions.json`, fetched once per device creation. `SfzIndex.schema` is `version: z.literal(1)`;
no bump is needed since nothing in `index.json` changes shape.

### 3. Baked instrument presets (server)

A Node script builds each instrument's box graph and serialises it:

```
factory/presets/<preset-uuid>.odp        # PresetEncoder.encode(audioUnitBox, {includeTimeline: false})
factory/presets/index.json               # + one InstrumentPresetMeta per baked instrument
```

Recipe, following `PresetDecoder.replaceAudioUnit.test.ts`:

1. `ProjectSkeleton.empty({createDefaultUser: false, createOutputMaximizer: false})`
2. `AudioUnitBox.create(...)` with `type: AudioUnitType.Instrument`, `collection.refer(rootBox.audioUnits)`,
   `output.refer(primaryAudioBusBox.input)`
3. One `AudioFileBox.create(boxGraph, sampleUuid, …)` per *unique* sample in `regions.json`, with
   `fileName` and `endInSeconds` from the manifest — **the box UUID must be the sample-store UUID**, since
   that is the identity `PresetDecoder` preserves and `SampleProvider` will later resolve
4. `InstrumentFactories.Sfz.create(boxGraph, unit.input, name, IconSymbol.Sfz, attachment)` with the
   attachment array built via `toSfzAttachment(region, file)`
5. `PresetEncoder.encode(unit, {includeTimeline: false})` → write `.odp`
6. Append `{category: "instrument", device: "Sfz", uuid, name, description, created, modified}` to the
   preset index

The preset UUID should be derived (e.g. `contentUuid` over the instrument UUID) rather than random, so
re-running the script is idempotent — matching the importer's existing `importMode:
"idempotent-content-uuid"` policy.

This script needs built `@opendaw/lib-box`, `@opendaw/studio-boxes`, `@opendaw/studio-adapters` and
`@opendaw/studio-core`, so unlike `import-sfz-instruments.mjs` (dependency-free) it must run from a built
checkout. It belongs in `scripts/bake-sfz-presets.ts`, run via the repo's existing TS runner rather than as
a bare `.mjs`.

### 4. Client: a sample provider and a thinner import path

Two changes, both small.

**`SfzSampleProvider`** — new, `packages/app/studio/src/opendaw-api/` — implementing `SampleProvider`:
fetch `/factory/sfz/samples/<uuid>`, decode via `WavFile.decodeFloats`, return
`[AudioData, SampleMetaData]` with `origin: "sfz"`. Structurally the tail of `OpenSampleAPI.load`
(`OpenSampleAPI.ts:50-88`) minus the index lookup, since the URL needs no index.

Wire it in `packages/app/studio/src/boot.ts:121-123`. `ChainedSampleProvider` takes a single `#cloud`
fetcher plus an optional peer, so compose at the cloud slot: try `OpenSampleAPI` when the UUID is in its
(memoized) index, else `SfzSampleProvider`. Checking index membership first avoids a rejected fetch per
sample and costs no network after the first load.

**`SfzSelection.#loadAttachment`** — rewrite to consume `regions.json`:

```
fetch regions.json
  → for each unique sample: AudioFileBox.create(boxGraph, sampleUuid, {fileName, endInSeconds})
      (or reuse via boxGraph.findBox — the UUID is stable and may already be present)
  → attachment = regions.map(region => toSfzAttachment(region, fileFor(region.sample)))
  → api.createInstrument(InstrumentFactories.Sfz, {attachment})
```

No `loadDefinition`, no `SfzParser.parse`, no `loadSample`, no `sampleService.importFile`, no per-region
failure counting — a region can no longer "fail" at creation time, because nothing is fetched. The
`RuntimeNotifier.progress` dialog and the "N region(s) skipped" toast both become unnecessary on this path;
a genuinely unreachable sample now surfaces later, through `SampleLoaderState`'s existing `error` state, the
same way any other missing factory sample does.

`OpenSfzAPI.loadDefinition` / `loadSample` stay for now (the diagnostic value of being able to fetch raw
catalog content is real) but leave the device-creation path.

## Three existing problems this fixes

Worth calling out, because they are live today and were found while planning rather than reported:

**The Samples tab gets flooded.** `Storage.list()` (`packages/studio/core/src/Storage.ts:38-53`) enumerates
every directory under OPFS `samples/v2`, and `SampleBrowser.fetchLocal` hides only what appears in
`OpenSampleAPI`'s index (`Arrays.subtract(local, openDAW, …)`). Every SFZ region sample imported today
therefore shows up in the user's local Samples list — 54 rows named `F#3.wav`, `KSHarp_E1_f1.wav` and so on
per instrument loaded. Tagging factory SFZ samples `origin: "sfz"` and filtering them out of `fetchLocal`
removes this. (`SampleMetaData.origin` is `z.enum(["openDAW", "recording", "import"])` — adding `"sfz"` is
additive; only newly-written `meta.json` files carry it.)

**Deleting an SFZ device can prompt once per sample.** `SfzSelection` calls
`project.trackUserCreatedSample(uuid)` for every region sample. `Project.#deleteUserCreatedSample`
(`packages/studio/core/src/project/Project.ts:566-574`) asks "Keep Sample?" for each orphaned tracked sample
unless `auto-delete-orphaned-samples` is on — so removing a 54-region instrument can mean 54 approval
dialogs. Factory SFZ samples are re-fetchable server content and must not be tracked as user-created at all.

**Samples are duplicated per instrument on disk.** Addressed by the content-addressed store above.

## Decisions needed

**Should lazily-fetched SFZ samples persist to OPFS?**
`#fetchFromApi` currently always calls `SampleStorage.save`, which re-encodes decoded floats as float32 WAV
(`SampleStorage.ts:25-39`) — roughly 2× the bytes of a 16-bit source. Across a heavily-browsed catalog that
could grow large in the user's origin storage.

*Recommendation: keep persisting.* It matches how every other factory sample behaves, keeps projects
openable offline, and the `origin: "sfz"` tag already solves the visibility and orphan-tracking problems
without changing the storage path. Revisit only if measured OPFS growth on the real catalog is bad; the
alternative (in-memory cache only, relying on HTTP caching to re-fetch) is a one-branch change in
`#fetchFromApi` if needed.

**How many instruments get baked as presets?**
There is now a concrete technical argument here, which the earlier discussion lacked. `PresetMeta` has no
folder or grouping field, and `PresetBrowser` groups strictly by device key
(`PresetBrowser.tsx:191`) with a text search over the flat result. Baking all 258 produces a single flat
258-entry list under the Sfz device, which the per-device pager (`nextPresetFor`/`prevPresetFor`, one step
per click) is a poor fit for.

*Recommendation: bake a curated set (~20-40), not the full catalog.* The full 258 stay reachable through the
SFZ Browser tab, which already has proper folder grouping (VCSL / VSCO 2 CE) and which — after this change —
creates a device fast enough that pre-baking buys little. Presets are the right surface for a
"greatest hits" shortlist; the browser tab is the right surface for a library. Baking everything is
supported by the same script if you'd rather have it, but the flat list is the cost.

## Phases

Each phase is independently shippable and independently verifiable.

**Phase 1 — server: sample store + resolved manifests.** `scripts/import-sfz-instruments.mjs`: add the
WAV-header duration probe, the content-addressed hardlinked `samples/<uuid>` store, and `regions.json`
emission. Purely additive to the published tree — the existing client keeps working off `index.json` and
`source/`, so this can ship and be verified on OMV before any client change exists.

**Phase 2 — client: lazy device creation.** `SfzSampleProvider`, the `boot.ts` wiring, the
`SfzSelection.#loadAttachment` rewrite, the `origin: "sfz"` tag, the `fetchLocal` filter, and dropping
`trackUserCreatedSample` from this path. This is where the user-visible speedup lands.

**Phase 3 — server: baked presets.** `scripts/bake-sfz-presets.ts` plus the curated instrument list. Depends
on Phase 1's manifests; independent of Phase 2 (a baked preset works whether or not the browser tab is
lazy — though without Phase 2's provider the samples cannot resolve, so Phase 2 must ship first in
practice).

**Deferred — server-side peak generation.** `#fetchFromApi` generates peaks client-side via
`Workers.Peak.generateAsync` after each fetch. Precomputing them server-side would be genuinely
server-forward, but `generatePeaks` is private inside `SamplePeakWorker`
(`packages/lib/fusion/src/peaks/SamplePeakWorker.ts:18`) and touches `self.constructor.name`, which is
undefined in Node — so it needs a small lib-fusion export refactor plus a guard, and it adds ~7400 served
`peaks.bin` files. The saving is one O(frames) pass over short one-shot samples, once each, off the critical
path. *Recommend measuring after Phase 2 and only then deciding* — this is the one place where the
server-forward instinct probably isn't worth the coupling.

## Verification

Per-phase, following the existing exFAT workaround (build/test on `R:\Development\OpenDAW`, source of truth
stays `T:\`):

**Phase 1** — unit-test the duration probe against known WAV fixtures (including 8/16/24-bit and mono/stereo)
and the sample-UUID dedupe (two instruments sharing a WAV resolve to one store entry). Run the importer
`--dry-run` over both real libraries on OMV and check: every region resolves to a store UUID, region counts
match the existing `index.json`, and probed durations match `ffprobe` for a sampled subset. Existing
`SfzParser.test.ts` must stay green (the shared tokenizer is untouched).

**Phase 2** — type-check and test on `R:`. Then, live on OMV: create "Balafon - Keyswitch" and confirm the
device appears without a per-sample download phase, notes sound across the full key range, the Samples tab
gains no new rows, and deleting the device raises no "Keep Sample?" prompts. Network panel should show
`regions.json` and then WAVs only as notes are played.

**Phase 3** — bake the curated set, confirm the entries appear in the Sfz device's preset pager and in the
Presets browser tab, apply one to an existing track, and confirm it plays. Round-trip check: applying a
baked preset and then saving the project as a user preset should produce a working preset.

Full end-to-end depends on the OMV host running the importer, so per `CLAUDE.md` each phase goes over as a
branch + PR against `screwpulp/self-hosted`, with the host side rebuilding and confirming live before the
user is asked to test.

## Not in scope

- `#include` / `<curve>` / round-robin / choke groups — still the deferred later phases in
  `plans/sfz-instrument-support.md`; this plan changes *delivery*, not opcode coverage.
- A local (user-imported) SFZ catalog. There is still no `SfzStorage`; the browser tab remains
  factory-content-only.
- `FactoryCatalog.sfz()`. Its hook stays unused until something needs cross-catalog dedup.
- Reconciling the SFZ browser row's click-to-load with `SoundfontView.tsx`, which still requires the context
  menu. Noted in PR #11, unrelated to this work.
