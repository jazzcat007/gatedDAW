# Factory Pack Installer (Admin-driven content packs)

## Goal

Let an admin browse curated CC0 SoundFont/SFZ "packs" in the Admin page and install
them directly to the hosted server — download, license-checked staging, import, bake —
without SSH access or manually running scripts. Replaces the current workflow (an
operator running `ingest.sh` / `import-sfz-instruments.mjs` / `bake-sfz-presets.ts` by
hand over SSH) with an in-app job the server executes itself.

## Why this is safe to build now

The Dockerfile is single-stage (confirmed: one `FROM node:23-bookworm`, no multi-stage
copy) — the **running** `opendaw` container already has `node_modules`, every built
workspace package, `scripts/`, and `curl`. It can invoke the importer and baker
in-process; no rebuild step is needed to add this feature.

The pieces already exist and just need to be composed:
- `AdminPage.tsx` — an admin UI already exists.
- `docker-server.mjs` already has an `/api/admin/` route namespace gated on
  `user.role === "admin"`.
- `factory-intake/ingest.sh` already clones-and-caches libraries with
  `git clone --depth 1` / `git pull --ff-only` (resumable, idempotent).
- `scripts/import-sfz-instruments.mjs` and `scripts/bake-sfz-presets.ts` are both
  additive and idempotent (re-running never duplicates or corrupts existing content —
  established while fixing PR #13's regression).
- `OPENDAW_FACTORY_OFFLINE_ONLY` env var already exists and is already surfaced to the
  client via the boot config.

## Trust model — the part that must not be got wrong

**The client sends pack IDs only, never URLs.** Every installable pack is a row in a
manifest committed to this repo (`factory-intake/packs.json`). The server resolves an
ID to a URL/license/format by looking it up in that file — it never fetches a
client-supplied URL.

Two failure modes this prevents:
- **SSRF**: an admin-scoped endpoint that fetches an arbitrary client-supplied URL from
  the server is a network pivot point, not a feature.
- **License laundering**: the CC0-only constraint is enforced by what's *in* the
  manifest, not by anything the UI checks at request time. A manifest entry is the
  license audit; the endpoint just executes entries that passed it.

This also means: **adding a new pack requires a PR and redeploy**, not just an admin
clicking something. That's a deliberate v1 constraint (see Open Decisions).

## Pack manifest — `factory-intake/packs.json`

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
    },
    {
      "id": "tr808-fischer",
      "kind": "sfz",
      "name": "TR-808 (Fischer 1994)",
      "genres": ["urban", "rnb", "edm"],
      "license": "CC0-1.0",
      "source": {"type": "git", "url": "https://github.com/zynthian/TR808-fischer", "ref": "HEAD"},
      "sampleFormat": "flac",
      "rawSizeBytes": 12582912,
      "yields": ["sfz-instrument", "playfield-kit"],
      "installable": false,
      "blockedReason": "FLAC-only source; needs FLAC->WAV conversion at import (not yet built)"
    }
  ]
}
```

The `sfz-non-orchestral-catalog-expansion.md` format audit (14 libraries confirmed
WAV, `tr808-fischer` + 4 Karoryfer drum kits confirmed FLAC-only/FLAC-mostly) becomes
the seed data for this file. `installable: false` entries are shown in the UI, greyed
out, with `blockedReason` displayed — not hidden, so the admin knows the pack exists
and why it can't be queued yet, rather than wondering why coverage looks thin.

## Server: job execution

New endpoints under the existing `/api/admin/` namespace:

- `GET /api/admin/factory/packs` — returns `packs.json` plus live install status per
  pack (not-installed / queued / running / done / failed) and current free space on the
  factory volume.
- `POST /api/admin/factory/packs/install` — body `{packIds: string[]}`. Validates every
  ID against the manifest server-side (never trust client-echoed pack metadata),
  computes total `rawSizeBytes`, checks against free space with a safety margin (see
  Open Decisions), and either 409s with the shortfall or enqueues a job and returns a
  job ID.
- `GET /api/admin/factory/packs/jobs/:id/events` — SSE stream of job progress
  (per-stage: cloning / importing / baking, with the importer's own
  `imported=`/`invalid=` counts relayed verbatim once available).

Job state persisted the same way `persistUsers()`/`persistInvites()` already persist
JSON to `/data/server` — so a container restart mid-job doesn't orphan it silently; on
boot, any job left "running" is marked "failed: interrupted" and is safely re-queueable
(every downstream step is idempotent).

**One job at a time, enforced server-side**, regardless of how many packs are selected
per job. A second `install` call while one is running is rejected with 409, not queued
behind it silently — an admin should always know whether something is currently
downloading gigabytes into their server.

Execution is a child process per stage (`spawn`, not `exec` — no shell interpolation of
pack data), niced, with the job holding the PID so it can be cancelled. This keeps
multi-GB downloads and FLAC conversion off the same event loop serving the DAW to
everyone else currently connected.

## Client: Admin page addition

A "Content Packs" section in `AdminPage.tsx`:
- Filter by genre tag and kind (SoundFont / SFZ).
- Each row: name, genres, license, raw size, format-availability badge (from
  `installable`/`blockedReason`), checkbox.
- Free-space readout at the top, live-updated from the `packs` GET response.
- Multi-select install button, disabled if the selection's total size would leave less
  than the safety margin.
- Active job shown as a progress panel (SSE-driven), one stage at a time, with the
  importer's real `imported=`/`invalid=` line surfaced verbatim — the admin should see
  the same signal a human operator would when running this by hand.

## Sequencing recommendation

**Ship SoundFont packs first**, as the vertical slice. A SoundFont catalog entry is one
opaque blob — no `regions.json`, no per-region WAV probing, no FLAC risk, no baking
step. It proves the whole pipeline (manifest -> validate -> download -> free-space
check -> stage -> update index -> SSE progress -> Admin UI) cheaply, before SFZ's extra
stages (import + bake + FLAC gating) are added on the same machinery.

**Auto-bake as the job's last step for SFZ packs.** An installed pack whose instruments
have no browsable/playable preset yet is a confusing half-state (this is close to what
the user hit testing Cabasa before #13/#18 landed) — running
`bake-sfz-presets.ts --all` (or a `--selection` scoped to just the newly-installed
instruments, cheaper for repeated small installs) as the final stage keeps "installed"
and "usable" the same event.

## Open decisions for the user

1. **Free-space safety margin.** Projects, rooms, and server state share the same
   appdata volume as the factory tree (confirmed via `docker-server.mjs`'s
   `OPENDAW_*_ROOT` env vars, all under the same OMV mount). A pack install that runs
   the volume dry doesn't just fail the install — it can break saves for anyone using
   the DAW at that moment. Recommend refusing any install that would leave less than
   **max(5 GB, 2x the largest single pack in the batch)** free, computed *before*
   download starts. Needs a number from you, or confirmation this heuristic is fine.

2. **`OPENDAW_FACTORY_OFFLINE_ONLY` interaction.** This feature is the opposite of
   offline — it's the server reaching out to GitHub/freepats.zenvoid.org on an admin's
   command. Recommend: the install endpoints 403 unless that env var is explicitly set
   to allow it (i.e. offline stays the default; a self-hoster opts in), rather than the
   capability silently existing on every upgrade. Confirm this is the right default, or
   whether you'd rather it be admin-role-gated only (current admin auth) with no
   separate opt-in flag.

3. **Manifest update path for v1.** Above assumes `packs.json` is repo-committed and
   adding a pack needs a PR + redeploy, matching the "client never supplies a URL"
   trust model. If you want admins to add arbitrary packs without a code change later,
   that needs a second design pass (e.g. an allowlist of trusted *source hosts* rather
   than trusted *packs*, which is a materially weaker guarantee) — flagging so it's a
   deliberate choice, not a default nobody decided.

4. **FLAC conversion timing.** `tr808-fischer` and 4 of 7 audited Karoryfer drum kits
   are FLAC-only/FLAC-mostly and ship `installable: false` in the seed manifest until
   FLAC->WAV conversion is built into the importer (the repo already has FFmpeg
   plumbing in `packages/studio/core/src/ffmpeg/flac.ts`, so this is wiring, not new
   capability). Worth doing before or shortly after this ships, since the TR-808 is the
   highest-value single pack in the whole non-orchestral expansion and would otherwise
   sit visibly greyed-out in the first release of this feature.

## Dependency on open PRs

This builds directly on #19's baker (`bake-sfz-presets.ts --all`/`--selection` as a
library call, not just a CLI). Land #18 and #19 first so this doesn't stack on
unmerged, unreviewed branches.
