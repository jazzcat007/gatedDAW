# Brief: Admin-driven content pack installer (SoundFont + SFZ)

## Context

openDAW's hosted factory catalog (SoundFonts + SFZ instruments) is currently populated
by an operator SSHing into the OMV host and running `ingest.sh` / the import scripts by
hand. We want an admin to instead pick curated CC0 "packs" from the Admin page in the
browser and have the **server itself** download, license-check, import, and bake them
— no SSH.

Read `plans/factory-pack-installer.md` in the repo first — it has the original design
and the four open decisions. **This brief supersedes parts of that plan** where I found
existing infrastructure after writing it; the corrections below are the ones that
matter, follow this brief's version where they conflict.

## What already exists — reuse this, don't parallel-build it

I read `docker-server.mjs` and `AdminPage.tsx` before writing this. There is already a
working job-runner and an admin UI section built on it:

- `docker-server.mjs:279` — `let assetImportJob = null`, a **single global job slot**.
- `docker-server.mjs:348` (`runAssetImportJob`) — spawns a command via `execFile`,
  refuses to start a second job while one is `"running"`, streams stdout/stderr into
  `job.output` (capped at the last 20,000 chars), and is already wired to
  `npm run import-demos` via `POST /api/admin/assets/demos/import`.
- `docker-server.mjs:297` (`summarizeFactoryAssets`) — returns catalog counts/sizes
  plus `currentJob`, served at `GET /api/admin/assets`.
- `AdminPage.tsx:195-293` — polls `GET /api/admin/assets` every 2.5s **only while a job
  is running** (not SSE — this codebase doesn't use SSE for this pattern, don't
  introduce it), renders `job.output` as a `<pre>`-like text block, disables nothing
  fancy, just shows status.
- `packages/app/studio/src/admin/AdminApi.ts` — the typed client wrapper every admin
  action goes through (`fetchAssets`, `importDemos`, etc.) — same `CsrfHeader`,
  `panic`-on-`!response.ok` pattern throughout.
- `package.json` scripts: `import-sfz`, `import-soundfonts`, `import-samples`,
  `import-demos` already exist as `node scripts/<x>.mjs` entries.

**Extend `assetImportJob`/`runAssetImportJob` for packs — do not build a second job
queue.** One admin-visible job slot for the whole server (demos import, pack install,
everything) is a feature, not a limitation to work around: it's what already prevents
two heavy operations from running concurrently and thrashing the disk/CPU on a
single-container host. If you need per-stage progress within one pack job (clone →
import → bake), append stage markers into the same `job.output` stream rather than
inventing a second status field — that's consistent with how the existing job reports
`npm`'s own output today.

## Trust model — non-negotiable

**The client sends pack IDs only. The server never fetches a client-supplied URL.**

Every installable pack is a row in a new file, **`factory-intake/packs.json`**,
committed to the repo (see seed data below). The install endpoint looks up the
submitted ID in that file server-side and acts only on what it finds there. If an ID
isn't in the file, 400. This is the license/CC0 audit boundary — the manifest *is* the
audit, the endpoint just executes entries that already passed it. Do not add a
"custom URL" input anywhere in the admin UI for v1; that's explicitly out of scope
(see plan doc's open decision #3 — the file-only path is the answer for this brief).

## Correction to the plan doc: don't reuse `ingest.sh` for single-pack fetches

The plan doc assumed a per-pack fetch could reuse `ingest.sh`. I checked and that's
wrong: `ingest.sh` iterates **all** of `factory-intake/manifest.json` on every
invocation with no per-entry filter flag — calling it for one pack would re-process
every already-staged library too, which is slow and pointless for a targeted install.

Instead, write a small standalone fetch step (new file, e.g.
`scripts/lib/fetch-pack.mjs`) that mirrors the *pattern* already used in
`factory-intake/ingest.sh`'s `fetch_sample_pack`/`fetch_soundfont` bash functions
(around line 230-310 of that file — read it for the exact shape) but scoped to one
pack:
- `source.type === "git"`: clone into a cache dir if absent (`git clone --depth 1
  [--branch <ref>] <url> <cache>`), else `git -C <cache> pull --ff-only`. Same
  resumability/idempotency the shell version already has.
- `source.type === "archive"`: download + extract (zip/tar.*) — only needed if a pack
  manifest entry uses it; the seed data below is git-only, so this can be a stub that
  throws "not yet implemented" until a pack actually needs it.

Use a scratch cache directory under the existing intake root convention (check
`factory-intake/manifest.json`'s `intakeRoot`/`DOWNLOAD_ROOT` env handling in
`ingest.sh` for the existing path convention and match it) so a failed/interrupted
install can resume via `git pull --ff-only` rather than re-cloning from scratch.

## Server changes

**1. `factory-intake/packs.json`** (new, committed) — seed with the CC0-confirmed,
WAV-confirmed libraries from `plans/sfz-non-orchestral-catalog-expansion.md`'s format
audit. Shape:

```json
{
  "version": 1,
  "packs": [
    {
      "id": "karoryfer-swirly-drums",
      "kind": "sfz",
      "name": "Swirly Drums",
      "genres": ["punk", "indie", "folk-brushes"],
      "license": "CC0-1.0",
      "source": {"type": "git", "url": "https://github.com/sfzinstruments/karoryfer.swirly-drums", "ref": "HEAD"},
      "sampleFormat": "wav",
      "rawSizeBytes": 1717986918,
      "yields": ["sfz-instrument", "playfield-kit"],
      "installable": true
    }
  ]
}
```

Seed at minimum the 14 libraries confirmed `sampleFormat: "wav"` in the catalog
expansion plan (swirly-drums, gogodze-phu-vol-ii, shinyguitar, emilyguitar,
black-and-green-guitars, fashionbass, growlybass, pastabass, swagbass, ergo, ganjo,
caveman-cosmonaut, cowsynth, scarypiano). Mark `tr808-fischer` and the four
FLAC-mostly Karoryfer drum kits (virtuosity_drums, big-rusty-drums, frankensnare,
unruly-drums) `"installable": false` with a `"blockedReason"` string — FLAC→WAV
conversion isn't in scope for this brief, ship them visibly-blocked, not silently
absent. Ask me for exact repo URLs/sizes for any pack you seed if the plan doc doesn't
already have one — don't guess a GitHub URL.

**2. `GET /api/admin/factory/packs`** — new segment under the existing
`serveAdminApi` dispatcher in `docker-server.mjs` (follow the exact `segments`-array
pattern already used for `settings`/`assets`/`users` at line ~1122 onward). Returns
`packs.json` contents, each pack annotated with an `installedAt` (look up whether the
pack's instruments/soundfont already exist in the relevant factory index — reuse
`readJson`/index-reading helpers already in the file) and the **current free space** on
the factory volume.

For free space: Node has had `fs.statfsSync(path)` since Node 18.15 — the Dockerfile
is `node:23-bookworm`, so it's available. Use `statfsSync(factoryAssetRoot)`, compute
`bavail * bsize`. Don't shell out to `df`.

**3. `POST /api/admin/factory/packs/install`** — body `{packIds: string[]}`.
- 400 if any ID isn't in `packs.json` or is `installable: false`.
- 409 if `assetImportJob?.status === "running"` (mirror the existing guard in
  `runAssetImportJob` — don't duplicate the check, extend the function to accept a
  pack-install command shape, or add a thin wrapper that calls into it).
- **Preflight free-space check before starting**: sum `rawSizeBytes` for the batch,
  refuse (409, with the shortfall in the error body) if free space would drop below
  `max(5_000_000_000, 2 * largestPackInBatch)` bytes. This is the plan doc's
  recommended default (open decision #1) — apply it, don't ask me again.
- On success, kick off a job whose command sequence is, per pack, in order:
  1. fetch (per pack `kind`/`source`, see above)
  2. `node scripts/import-sfz-instruments.mjs <clonedPath> --library "<name>" --license
     "<license>" --url "<url>"` for `kind: "sfz"`, or the equivalent
     `import-soundfonts.mjs` invocation for `kind: "soundfont"` (check its `--license`/
     `--url` flags — already present, read the file's usage banner)
  3. for `kind: "sfz"` packs only: bake the newly-imported instruments (see next
     section — this depends on PR #19)
- Job output should show which pack is currently processing and relay the importer's
  own `imported=`/`invalid=` line verbatim, same as a human operator would see running
  it by hand — don't swallow or reformat that line.

**4. Gate behind `OPENDAW_FACTORY_OFFLINE_ONLY`** — `factoryOfflineOnly` is already
read into a variable in `docker-server.mjs` (search for it) and already surfaced to the
client via `summarizeFactoryAssets().offlineOnly`. Per the plan doc's open decision #2
(apply the recommended default, don't ask again): **the install endpoints 403 unless
`factoryOfflineOnly === false`.** Offline stays the default; a self-hoster opts in by
setting the env var. Surface this in the `GET /packs` response too
(`offlineInstallDisabled: boolean`) so the UI can grey out the install button with an
explanation instead of just failing on click.

## Dependency on PR #19 — branch from it, not from `screwpulp/self-hosted`

PR #19 (`sfz/bake-presets-and-key-range`, currently open/unmerged) adds
`scripts/bake-sfz-presets.ts --all` and `PresetMeta.group`. This brief's SFZ pack path
needs the bake step. **Branch your work off `sfz/bake-presets-and-key-range`**, not off
`screwpulp/self-hosted` — otherwise you'll be missing the baker entirely. I'll handle
rebasing once #19 merges; don't wait on that to start.

**One real gap in that script you should close as part of this work:**
`resolveSelection` (line 94) matches instruments **by name only**, across the *entire*
catalog — `instruments.filter(entry => entry.name === name)`. For a scoped pack-install
bake this is a correctness bug waiting to happen: if a newly-installed pack's
instrument happens to share a name with an unrelated instrument from a different
library already in the catalog, baking "the pack you just installed" would silently
also re-bake that unrelated instrument. Add a `--uuids <file>` option (JSON array of
instrument uuids, matched by `entry.uuid === uuid` instead of name) as an alternative
to `--selection`, and have the pack-install job capture the uuids the importer just
reported (its `import  <library>/<name> ...` log lines don't currently print the uuid —
you may need to add that, or read them back out of the updated `sfz/index.json` after
the import step) and pass those. Keep `--selection`/`--all` working exactly as they are
— this is an additive flag, not a replacement.

**Also close a real reliability gap in PR #19's bake script**: it currently expects
`npx tsx` at runtime, which — if `tsx` isn't a declared dependency anywhere in the repo
(check `package.json`; last I checked it wasn't) — means `npx` silently fetches it from
the npm registry on first use. That's fine interactively, but inside a server-triggered
job it's an implicit network dependency with no visible error message if the registry
is unreachable, and it's non-hermetic (different `tsx` version on a fresh container vs.
a long-running one). **Add `tsx` as a real `dependency` (not `devDependency` — it needs
to be present in whatever `npm ci` populates for the running container, and the
Dockerfile is single-stage so there's no separate prod-install step to worry about) in
the root `package.json`, and add an `npm run bake-sfz-presets` script entry** (mirroring
the existing `import-sfz`/`import-soundfonts` entries) so the job runner can invoke it
the same way it invokes the importers, instead of hand-building an `npx tsx` command
line.

## AdminApi.ts / AdminPage.tsx additions

Follow the exact existing idiom in both files — same `panic`-on-`!response.ok`,
`CsrfHeader` on mutating calls, same section-component shape as `AssetsSection`
(read the whole `AdminPage.tsx` for how sections compose, not just the excerpt above).

New `AdminApi` types/functions: `Pack`, `PacksResponse` (packs +
`offlineInstallDisabled` + free-space fields), `fetchPacks()`, `installPacks(packIds:
string[])`.

New Admin page section, e.g. "Content Packs": table with name / genres / license /
size / an availability badge (installed / not installed / blocked, using
`installable`/`blockedReason`), checkboxes, an Install button disabled when the
selection would violate the free-space margin (compute client-side from the same
numbers the server already returns, so the button visibly disables before the user
even clicks — the server check is still the real guard, this is just UX), and reuse of
the same job-status rendering `AssetsSection` already has (you can factor
`renderJob`-equivalent into a shared helper if that's cleaner, your call).

## Sequencing — build and land in this order

1. **SoundFont pack path only, first.** It needs no importer changes, no bake step, no
   FLAC question — just fetch → `import-soundfonts.mjs`. This proves the whole chain
   (manifest → validate ID → free-space preflight → offline-gate → job → poll → UI)
   cheaply before the SFZ path's extra stages ride the same code.
2. **SFZ pack path** on top, once (1) is verified working.

Land these as separate commits (can be one PR) so the SoundFont-only slice is reviewable
and testable independent of the SFZ/bake complexity.

## Verification I need from you

- Unit/integration tests for the fetch-pack cloning logic (mock the `git` calls —
  **do not have automated tests perform real network clones**; a real-network smoke
  test is a manual step you report separately, not part of the test suite).
- A test proving the trust boundary: posting a `packId` not present in `packs.json`
  is rejected and **does not** touch the filesystem/network at all.
- A test proving the free-space preflight actually refuses an over-budget batch (fake
  `statfsSync` return value, don't rely on the real disk).
- A test proving the single-job guard rejects a second `install` call while one is
  `"running"` (this should mostly fall out of reusing `assetImportJob`, but prove it,
  don't assume it).
- `tsc --noEmit` clean across whatever packages you touch.
- Existing SFZ/preset/adapters test suites still green after your changes (there are
  60+ tests across `packages/studio/core/src/sfz/` and
  `packages/studio/adapters/src/preset/` — don't break them).
- Manual: one real end-to-end install of a single small SoundFont pack against a
  throwaway/local factory root (not the production one), report the actual
  `imported=`/output you saw, not a description of what should happen.

Build environment note: this repo can't `npm install` directly on the primary
Windows checkout (exFAT, no symlinks) — if you hit that, it's expected, not something
to work around; verify on whatever sandboxed/Linux-capable environment you have and
report what you used.

## Report back

Same shape as your Phase 3 report: files touched, any contract gaps or assumptions you
had to make that I should know about (the uuid-vs-name selection gap and the `tsx`
dependency issue above are the two I already know are lurking — tell me what you found
beyond those), and the verification output itself, not just "tests pass."
