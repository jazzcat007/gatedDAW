# Upstream compatibility ledger

status: active
owner: Richard Billings
last-reviewed: 2026-09-15

Operationalizes the "Upstream compatibility and fork evolution policy" in
`audits/system-audit-and-action-plan-2026-09-14.md`. That policy's rules (classify every change as
upstream-compatible/fork-isolated/intentional-divergence, prefer additive seams, preserve durable
compatibility, upstream generic fixes, make divergence explicit, never silently fork a format,
keep the fork's end state authoritative) apply to all new work; this file is the standing record
the policy asks for — baseline, review dates, carried patches, fork-only modules, divergences,
known conflicts, next sync owner.

## Baseline

- Upstream: `andremichelle/openDAW`, remote `upstream`, tracked branch `main`.
- Fork: `jazzcat007/gatedDAW` (renamed from `jazzcat007/openDAW` 2026-09-10), remote `origin`.
- This repo's `main` is kept as a clean upstream mirror (confirmed 2026-09-15: `main` has 0 commits
  not in `upstream/main`) — **never commit fork-specific work to `main`**; all fork work happens on
  `screwpulp/self-hosted` and branches cut from it.
- As of 2026-09-15: `origin/screwpulp/self-hosted` is **114 commits ahead, 30 commits behind**
  `upstream/main`, diverging at `4a9f183f63dfc7ad049b5f24eca6081205a7c61b`. `main` is 30 commits
  behind `upstream/main` (0 ahead) — those 30 upstream commits haven't been pulled into `main` yet,
  separate from the question of merging them into `screwpulp/self-hosted`.
- Last upstream fetch/review for this ledger: 2026-09-15.

## Fork-only modules (confirmed absent from `upstream/main` by `git ls-tree`)

- `docker-server.mjs`, `docker-compose.yml`, `Dockerfile` — the entire self-hosted server
  (auth/sessions, Projects/Live Rooms persistence, Admin API) and its deployment. Upstream has no
  self-hosted server story at all beyond the shared `yjs-server` below.
- `packages/server/factory-packs/` — the factory/SFZ pack installer and decision layer.
- `scripts/import-sfz-instruments.mjs`, `scripts/install-factory-packs.mjs`, and the related
  import scripts (`import-demos.mjs`, `import-samples.mjs`, `import-soundfonts.mjs`) — factory
  catalog tooling for this fork's self-hosted asset model.
- `crates/stock-devices/device-euclid` and its adapter/editor/schema — the Euclid device. (Not
  verified whether upstream has since added its own Euclid or similar device independently; check
  before assuming this stays fork-only forever.)
- `.github/workflows/ci.yml`, `dependency-audit.yml`, `dependabot.yml`, and `deploy/*` — this
  fork's CI/CD and backup tooling.
- The Admin UI (`packages/app/studio/src/ui/pages/admin`), hosting theme designer, and attribution
  page are fork-only product surfaces (not individually verified path-by-path against upstream in
  this pass, but consistent with the self-hosted product direction upstream doesn't share).

## Shared-but-independently-maintained (not a fork-only addition, but not synced either)

- **`packages/server/yjs-server`** exists in both trees. This fork's copy is presumably modified
  for its deployment (see `deploy/deploy-yjs.sh`, `.github/workflows/deploy-yjs.yml`); no line-level
  diff against upstream's version has been done as part of this ledger pass — do that before
  assuming either "just merge upstream's version" or "ours is fully diverged" is safe.
- **`plans/` and `audits/` directories exist in both trees, independently.** This was a surprise
  found while building this ledger: `upstream/main` has its own `plans/` (with its own
  `done/`/`issues/` subdirectories) and its own `audits/AUDIT-2026-03-27.md`, unrelated to this
  fork's. **Do not assume these directories are fork-only or that they should ever be merged
  wholesale from upstream** — they're parallel, independently-authored planning docs for two
  separate projects that happen to use the same directory convention. A future upstream merge
  must treat `plans/` and `audits/` as a manual reconciliation (probably: keep both sets of files
  under their own names, don't let a merge silently overwrite one fork's plan with the other's),
  not an automatic take-theirs/take-ours.

## Box schema / format compatibility

Not yet audited field-by-field against upstream as part of this ledger (that's real, focused work —
diffing `packages/studio/forge-boxes/src/schema/**` against upstream's equivalent, per the audit
policy's "preserve durable compatibility" rule). Known fork-only device schemas (Euclid, above)
are additive by construction (new box types), which is the safe shape per the policy — the open
question is whether any *existing* upstream box type's fields were renumbered, removed, or
reinterpreted on this fork's `screwpulp/self-hosted`, which would break upstream interchange. Do
this diff before the next upstream merge, not reactively after a corruption report.

## Known merge conflict surface

Not yet exercised — no upstream merge attempt has been made into `screwpulp/self-hosted` since the
114/30 divergence above accumulated. Expect conflicts concentrated in: anything touching the
device-registration dispatch tables (new upstream devices vs. this fork's new devices both editing
the same registration points), the studio-boxes/forge-boxes generated code, and any file upstream
has continued evolving that this fork also modified for self-hosted/branding purposes (candidates:
top-level `README.md`, package manifests, CI-adjacent files if upstream has since added its own).

## Carried generic patches (bug fixes not specific to this fork, sent or sendable upstream)

None tracked yet. Per the audit policy, a bug fix that isn't self-hosted/branding-specific should
be shaped so it can be proposed upstream independently rather than bundled with fork-specific
commits — this hasn't been done retroactively for the 114 commits already on `screwpulp/self-hosted`,
and isn't practical to do so now; apply this going forward for new fixes instead.

## Next sync owner

Richard Billings (sole maintainer as of this ledger's creation). No rotation scheduled.

## Recurring maintenance (per audit policy)

| Cadence | Activity | Last done |
| --- | --- | --- |
| Weekly | Fetch `upstream`, review new commits, flag security/schema/engine/dependency/build changes | 2026-09-15 (this ledger's creation — establish going forward, not yet a habit) |
| Monthly | Merge upstream into a dedicated integration branch, resolve conflicts, run compatibility tests, update this ledger | Not yet done |
| Before schema/format/SDK changes | Compare the proposed contract against upstream head, add old/new fixtures | Not yet a standing practice |
| Before each release candidate | Test representative upstream projects/presets in the fork and vice versa | Not yet done |
