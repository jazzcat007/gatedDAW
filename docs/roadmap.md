# Roadmap

status: active
owner: Richard Billings
last-reviewed: 2026-09-15

This is the **canonical** priority list for this fork. Detailed design/implementation plans live
under `plans/` (active work), `plans/done/` (shipped), and `plans/obsolete/` (abandoned) — this
page says what's Now/Next/Later and links out; it does not duplicate their content. When this page
and a linked plan disagree about status, this page wins; go fix the plan doc, don't trust it over
this one.

See `audits/system-audit-and-action-plan-2026-09-14.md` for the reliability/security audit this
roadmap's "Now" section is currently built around, and `docs/documentation-maintenance.md` for how
this page gets kept honest over time.

## Now

| Item | State | Links |
| --- | --- | --- |
| Reliability/security Phase 0 (atomic writes, first-boot admin-takeover fix, PR CI, dependency triage, backup/restore) | In review — PR #28 | `audits/system-audit-and-action-plan-2026-09-14.md`, `audits/dependency-triage-2026-09-14.md`, `docs/backup-restore.md` |
| PR-gated CI actually enforcing lint/fmt/clippy/test (currently all advisory — see below) | Blocked on a cleanup pass | `.github/workflows/ci.yml` |
| SFZ/factory-pack catalog rollout | In progress, PRs through #11+ | `plans/sfz-instrument-support.md`, `plans/sfz-lazy-samples-and-baked-presets.md`, `plans/sfz-non-orchestral-catalog-expansion.md`, `plans/factory-pack-installer.md` |

**Known debt blocking "Now" from closing:** turning on real CI (F03) for the first time surfaced,
in order: `cargo fmt --check` fails today (whole-workspace, not scoped — verified locally);
21 of 24 JS packages fail lint the first time it's run for real (mostly
`@typescript-eslint/no-namespace` and unused-var warnings; fixed the 3 real errors this found in
`lib-inference`, left the rest advisory since 21 packages is a real cleanup project, not a quick
fix); and `npm test` found four real pre-existing failures, three of which got fixed in PR #28
(a stale model-URL assertion in `lib-inference`, three stale palette-hue assertions plus one
missing `StereoTool.dcRemove` scripting binding in `studio-scripting`), leaving three open:
`studio-core`'s `DawProjectRoundtrip` test is the already-tracked F08 native-device-fidelity bug
(Phase 2, not new), and `studio-core`'s `Issue287.sync.test.ts` plus `studio-p2p`'s
`ChunkProtocol.test.ts` both failed on a flat 5000ms timeout with no assertion mismatch — consistent
with CPU contention from running all 46 packages' tests in parallel locally, not confirmed as a
real bug on an actual (less contended) CI runner. All three gates (fmt/clippy, lint, test) are
`continue-on-error` in `ci.yml` until each is independently confirmed clean; flip each to blocking
as it clears. Finishing this triage (the 21-package lint cleanup, the two timeout tests, F08) is
the highest-value next "documentation and process" item — it's what stands between this roadmap's
"Now" row and Phase 0's actual exit gate.

## Next

**Phase 1 — concurrency, recovery, server responsiveness** (audit F04, F06, F07, F09, F10, F11):
conflict-safe project saves (two clients currently silently overwrite each other), streaming
upload/download instead of whole-buffer, async `scrypt` + smarter rate limiting, a real version-
history UI on top of the atomic-write/generation work, splitting `docker-server.mjs` for
testability, and container hardening (non-root, minimal image, healthcheck). See the audit's
"Phase 1" section for acceptance gates.

**Sequencer program, "Patterns & Variations" milestone** — `plans/sequencer-program.md` §
"Recommended first release": (1) authoritative Euclid cleanup — reconcile the duplicate
`EuclidSequencerDeviceBox`/`EuclidSequencerDeviceBoxAdapter`/`EuclidSequencerDeviceEditor.tsx`
`.orphaned` files against the shipped `EuclidDeviceBox`, (2) shared deterministic clock/condition/
repeat primitives, (3) Pattern Sequencer MVP, (4) lock-aware Generate/Mutate, (5) Fill/Variation/
Accept-Revert/Capture, (6) MIDI Output + clip-commit workflows. **Euclid itself is shipped** (native
`EuclidDeviceBox` WASM device, adapter, editor, manual, Rust crate) — do not plan it as new work;
`docs/self-hosted-roadmap.md`'s "Sequencers" section undersold this until this reconciliation.

**DAWproject native-device fidelity** (audit F08) — re-enable and fix the disabled gatedDAW→
DAWproject→gatedDAW native-device round trip (`DawProjectExporter.ts`/`DawProjectImporter.ts`),
add fixtures for every built-in device.

**Self-hosted product backlog** — `docs/self-hosted-roadmap.md`'s remaining "Immediate Next Steps"
(items 6–10: asset intake folder structure, first large sample/SF2 batches, ten starter presets,
continued synthwave UI pass) plus its "Project Versioning," "Live Collaboration Features" (soft
lock → comments → hard lock → A/B variants, in that order), and "DAW Import/Export" sections (that
doc's own phase breakdowns are current and don't need restating here).

## Later

- Native DAW import expansion: Ableton `.als` (import-only), FL Studio `.flp` (import-only), Reaper
  `.rpp` (import+export candidate) — `docs/self-hosted-roadmap.md` § DAW Import/Export.
- VST3/CLAP desktop integration, staged (package gatedDAW as a plugin first; hosting third-party
  VST3s inside gatedDAW is a separate, larger, later target) — see the audit's Phase 4.
- Pattern/mono/drum/chord sequencer devices beyond the first Pattern Sequencer milestone —
  `plans/sequencer-program.md`.
- Mobile/PWA (`plans/pwa.md`), gated on measured browser constraints, not scheduled.
- WASM engine core-replacement plan reconciliation — **`plans/wasm-audio/README.md` currently
  says "planning — all docs drafted," which is stale**: a compiled `engine.wasm`,
  `packages/studio/core-wasm`, an AudioWorklet integration, and shipped per-device WASM plugins
  (including `device_euclid.wasm`) already exist in this tree, while `build-order.md`'s own
  "Where we are" section claims only Tier 0 (transport/render) is done. These two documents
  contradict both each other and the shipped code. Don't trust either for current status without
  checking `crates/engine` and `packages/studio/core-wasm` directly first; reconciling the whole
  `plans/wasm-audio/` tree against actual code is real work that hasn't been done yet, not
  something this roadmap pass could respons‌ibly shortcut.
- WASM memory eviction / cross-project PCM sharing — intentionally gated on measured
  weak-device/SDK demand (see MemPalace `memory-systems.md`), not on a timeline.

## Status of major plan documents

| Document | Status | Notes |
| --- | --- | --- |
| `docs/self-hosted-roadmap.md` | Active, mostly current | "Sequencers" section stale (see above); everything else actively maintained with inline done/open markers |
| `plans/sequencer-program.md` | Active, current | Already correctly tracks Euclid as shipped and the orphaned-duplicate cleanup as the first task |
| `plans/wasm-audio/*` | **Stale — do not trust for current status** | See "Later" above; needs a dedicated reconciliation pass against `crates/engine` |
| `plans/done/*` | Historical | Shipped; kept for reference only |
| `plans/obsolete/*` | Superseded/abandoned | Kept for reference only |
| `plans/issues/*` | Active backlog | Individual numbered bug/feature write-ups; not reconciled here item-by-item |
| `audits/system-audit-and-action-plan-2026-09-14.md` | Active source of truth for Phase 0/1 | This roadmap's "Now"/"Next" sections track it |
| `audits/dependency-triage-2026-09-14.md` | Active | Dated snapshot; re-run `npm audit` before trusting the specific advisory counts |
| `docs/backup-restore.md` | Active | Has its own drill-log/status section, kept current there rather than here |

## Naming

The product/fork is `gatedDAW` (repo `jazzcat007/gatedDAW`, formerly `jazzcat007/openDAW`), hosted
under the working brand `Metal-Duck Studios`. `openDAW` refers to the upstream project
(`andremichelle/openDAW`) this is forked from. Older docs alternate among all three names
inconsistently — that's a documentation-cleanup nit, not a product decision still open.
