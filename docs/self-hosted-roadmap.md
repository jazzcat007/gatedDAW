# Self-Hosted gatedDAW Roadmap

## Current Baseline

- Fork: `jazzcat007/gatedDAW`
- Branch: `screwpulp/self-hosted`
- Factory mirror root: `/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory`
- Available media volume capacity: about 16T free
- Current factory catalog: 902 samples, 7 soundfonts, 49 presets
- Demo projects are loaded from `/factory/demos` and can be provisioned with `npm run import-demos`.
- Current runtime assets: FFmpeg core, BasicPitch, tempo detection, htdemucs, and htdemucs-jx are mirrored locally
- Current built-in device surface: 9 instruments, 5 MIDI FX, 19 audio FX

## Asset Loading

The quickest path to a richer self-hosted studio is to grow the catalog first, because gatedDAW already knows how to browse factory samples, soundfonts, and presets from `/factory`.

1. Keep the upstream openDAW factory mirror complete.
   - Run `node scripts/mirror-factory-assets.mjs` after upstream catalog changes.
   - Keep `OPENDAW_FACTORY_OFFLINE_ONLY=true` in production so missing assets fail locally instead of leaking to upstream.
   - Run `npm run import-demos` after deploying demo catalog changes so the Demos tab can load bundles from `/factory/demos` while offline-only mode is enabled.

2. Provision the built-in demo projects locally.
   - Run `npm run import-demos` (or `npm run import-demos -- --root <factory-root>`) from a machine with upstream access.
   - This writes the catalog to `demos/projects.json` and each bundle to `demos/<id>/project.odb` beneath the factory root. Once copied to the mounted factory volume, the Demos tab has no runtime dependency on `api.opendaw.studio`.

3. Import soundfonts aggressively.
   - Use `npm run import-soundfonts -- <folder> --folder <catalog-name> --license <license> --url <source-url>`.
   - Prioritize permissively licensed SF2 packs: GeneralUser GS, FluidR3-compatible replacements where licensing is clear, orchestral packs, drum kits, GM/GS banks, vintage synth banks, and chiptune/game-style banks.
   - Keep imported entries grouped by source/license so attribution stays auditable.

4. Add curated sample packs.
   - Use `npm run import-samples -- <folder> --folder <catalog-path>`.
   - The importer converts common audio files to the extensionless 48 kHz float WAV format expected by the factory sample loader.
   - Suggested catalog folders: Drums, One-Shots, Loops, Foley, Vocals, Bass, Synth, Guitar, Keys, Impulse Responses.
   - Keep impulse responses in samples so the Convolver device can use them.

5. Add local preset packs.
   - Presets are `.odp` files listed in `presets/index.json`.
   - Create seed projects/racks for common workflows, then export reusable presets into the factory mirror.
   - Suggested first presets: drum bus, vocal chain, mastering chain, lo-fi sampler, ambient send, guitar cab convolver, clean piano, orchestral sketch, synth bass, sidechain-style pump.

6. Treat extra FX as product work.
   - Existing native FX are compiled devices, not just catalog entries.
   - Short-term: ship more presets and IRs for existing FX.
   - Medium-term: make Tone3000/NAM asset handling local-first.
   - Long-term: add new DSP devices through the existing box/adapter/core-wasm pattern.

## Sequencers

Goal: a family of pattern-based and generative MIDI-generating devices, starting with a Euclidean rhythm sequencer. Full design in `plans/euclidean-sequencer.md`.

- Builds on real existing precedent rather than starting cold: Arpeggio (`crates/stock-devices/device-arpeggio`) already implements the rate-grid/scheduling machinery a sequencer needs; Cubed already proves the box schema can hold self-contained step patterns; Spielwerk (scriptable MIDI effect) already advertises step sequencers and probability filters as example scripts, making it a zero-risk place to prototype the Euclidean algorithm before writing native DSP.
- Order: prototype in Spielwerk → extract Arpeggio's generic scheduling code into a shared module (so it isn't copy-pasted into every new sequencer) → ship the native Euclidean Sequencer device → use the same shared module for a probability/trigger sequencer and a polymeter/polyrhythm sequencer → a random-walk/Markov melodic sequencer as a separate, larger design (generates pitch, not just rhythm).
- Follows the current device-adding process (schema → adapter → Rust/WASM DSP → UI editor → the four dispatch-table registrations), not the proposed-but-unbuilt runtime device-loading system in `plans/loading-devices-at-runtime.md`.

## Design Overhaul

Direction: retro-future synthwave, under the working brand `Metal-Duck Studios`.

The current UI is a dense production tool, so the redesign should preserve speed and scanability rather than turning it into a landing page.

1. Create a brand layer.
   - Rename visible gatedDAW touchpoints where legally appropriate.
   - Add a custom app mark, favicon, loading screen, document title, and footer identity.
   - Define brand tokens in one place before changing component-level Sass.

2. Rework the palette.
   - Keep a deep violet/ink studio surface.
   - Use neon cyan for primary selections/actions, magenta for secondary creative emphasis, amber/yellow for signal and transport cues, mint for positive/live states, and red-pink for destructive/error states.
   - Maintain high contrast for timeline, piano roll, meters, and device controls.

3. Improve the first-run/default experience.
   - Custom synthwave demo project and templates.
   - Preloaded starter racks.
   - Better empty states in Browser, Devices, and Projects.

4. Phase the UI work.
   - Phase 1: global tokens, favicon/title/footer, loading screen.
   - Phase 2: browser/device panel polish.
   - Phase 3: timeline and mixer refinements.
   - Phase 4: custom templates and bundled demo content.

## Authentication And Security

1. Protect the app at the edge.
   - Preferred production setup: HTTPS reverse proxy with Basic Auth, OAuth proxy, or Authelia/Authentik.
   - Keep WebSocket paths `/live/*` and `/live/signaling` behind the same auth boundary.

2. Keep app-level fallback auth.
   - `docker-server.mjs` supports optional Basic Auth when `OPENDAW_AUTH_USERNAME` and `OPENDAW_AUTH_PASSWORD` are set.
   - This covers static files, factory assets, and WebSocket upgrades.

3. Harden the container.
   - Move secrets to `.env` or Docker secrets.
   - Run the node server as a non-root user.
   - Add healthcheck and resource limits.
   - Keep factory/project/room volumes separate.

4. Reduce external dependencies.
   - Keep telemetry/reporting disabled.
   - Keep model, FFmpeg, sample, soundfont, and preset URLs local.
   - Audit any remaining `https://api.opendaw.studio`, `assets.opendaw.studio`, `package.opendaw.studio`, `discord.com`, `github.com`, and `npmjs.org` runtime fetches before public exposure.

## Server-First Collaboration Model

The product model is split into two clear modes:

- `Projects` are asynchronous, durable workspaces. They should be listed from the server, saved to the server by default, and available for friends to open later based on membership permissions.
- `Live Rooms` are synchronous collaboration sessions. They should open from a Project, persist live Yjs state on the server, and periodically snapshot back into the Project history.

Current state:

- Live Room documents are already persisted under `/data/rooms`.
- `/api/projects` now serves a server-backed Projects API (list, create, load, save, duplicate, archive/delete, restore, export, revision snapshots) storing data under `/data/projects/v1`.
- The client Project browser, save/save-as flow, and project load now write to and read from the server API first; browser OPFS is written alongside as a cache/recovery copy and is only used as a fallback when the server is unavailable.
- Personal samples, soundfonts, presets, scripts, and templates still use browser OPFS unless they are part of the factory catalog.

Target server data areas:

- `/data/server`: instance settings, users, roles, invites, sessions, admin metadata, and audit logs.
- `/data/projects`: project bundles, metadata, cover images, snapshots, project membership, and trash/archive state.
- `/data/rooms`: persisted Live Room Yjs state, room metadata, active-room records, and room-to-project links.
- `/data/factory`: shared samples, soundfonts, presets, templates, models, and runtime assets.

Implementation phases:

1. Add server control foundation. **(done)**
   - Persist instance settings in `/data/server/settings.json`.
   - Expose authenticated `/api/server-info` and `/api/admin/settings` for future UI wiring.
   - Keep Basic Auth as the deployment gate until app-level sessions are ready.

2. Make Projects server-backed. **(done)**
   - Add project API endpoints for list, create, load, save, duplicate, archive, delete, and export.
   - Store the project file, metadata, cover image, and revision snapshots under `/data/projects`.
   - Change the client Project browser and save flow so server storage is the default and OPFS becomes cache/recovery only.

3. Connect Live Rooms to Projects. **(done, partial)**
   - Create Live Rooms from a Project: when a room is started from a saved server-backed project, the client
     links it via `POST /api/rooms` (`/data/server/room-links.json`: roomName, projectUuid, ownerUserId,
     createdAt, lastActivityAt).
   - Add autosnapshot from Live Room Yjs state back to the linked Project: the room creator's client
     periodically (every 2 minutes) and on leaving the room writes `project.toArrayBuffer()` back via the
     existing `PUT /api/projects/:uuid/file` + `.../meta`, which already creates a revision snapshot.
   - Joiners (anyone who didn't create the link) don't autosnapshot, to avoid redundant concurrent writes.
   - Still open: no membership list beyond the single owner, no Admin "Live Rooms" view of active/linked
     rooms yet (see phase 5), and starting a room from an *unsaved* project still behaves as a pure anonymous
     room (no link, no snapshot) — unchanged from before.

4. Add app-level authentication. **(done)**
   - Replace shared Basic Auth with individual users (scrypt password hashing, real `users.json`).
   - Signed secure session cookies (`opendaw_session`, server-side revocable), CSRF header check on mutating routes, and login rate limits.
   - Keep reverse-proxy Basic Auth optional as an extra outer layer (unchanged, still layered in front).
   - Remaining gap: no Admin UI yet, only the API — see phase 5.

5. Build the Admin section.
   - Users: create users, reset passwords, disable users, assign roles. **(done: `/admin` page + `/api/admin/users`)**
   - Invites: one-time invite links for friends. **(done: `/admin` Invites tab + `/api/admin/invites` + `/api/auth/{invite,register}`)**
   - Projects: ownership, membership (see Project Privacy & Sharing below), archive/trash, storage usage, export/backup.
   - Live Rooms: active rooms, participants, stale-room cleanup, force snapshot, close room. **(data exists via
     `GET /api/rooms`, no Admin UI panel yet)**
   - Assets: import queue, sample/soundfont/preset catalogs, license/source metadata.
   - Settings: site name, registration policy, default project visibility, storage quotas, factory offline mode, backup target, retention policy. **(partial: site name editable on `/admin`, rest read-only/TODO)**
   - Audit: login events, admin changes, destructive project actions, import jobs.

6. Harden storage and recovery.
   - Atomic writes for project snapshots and admin JSON.
   - Scheduled backups of `/data/server`, `/data/projects`, `/data/rooms`, and `/data/factory`.
   - Per-project export bundles so no work is locked into the server.
   - Recovery path for browser OPFS drafts that have not synced yet.

## Project Privacy & Sharing

Goal: a Project starts visible only to the person who created it, and stays that way until they
deliberately open it up to specific collaborators — matching the "known collaborators, not
anonymous participants" posture in `docs/philosophy.md`, applied at the project level, not just
the instance level.

Current state:

- New project metadata is stamped with `ownerUserId`, `createdBy`, and an owner membership.
- Every project API route enforces access server-side; admins retain a support/moderation override.
- Owners can grant active instance users editor or viewer access from the Project browser. Standard
  metadata saves cannot overwrite project ownership or memberships.
- Existing ownerless projects are deliberately admin-only until migrated, rather than becoming visible
  to every signed-in person.
- Linked Live Rooms now enforce the linked Project's membership at room registration, room discovery,
  Yjs WebSocket upgrade, and asset-signaling subscription/publish. Anonymous, unlinked rooms retain
  their existing behavior.

Implementation status: phases 1–3 are complete. New projects are private to their owner by default;
owners can share a project with active instance users as editors or viewers from the Project browser.
Legacy ownerless projects remain admin-only until deliberately migrated.

Proposed phases:

1. Stamp ownership at creation. **(done)**
   - Add `ownerUserId` (and `createdBy` display name) to `meta.json` when `POST /api/projects` runs,
     the same way room-links already stamp `ownerUserId`.
   - Backfill existing projects with no owner as owned by whichever admin runs the migration, or
     leave them unowned/admin-only until claimed.

2. Add a membership list and enforce it server-side. **(done)**
   - `meta.json` gains `members: [{userId, role}]`, defaulting to just the owner.
   - `listProjectSummaries()` and every per-project route filter/authorize by membership instead of
     trusting any logged-in user; admins bypass for support/moderation.
   - This is the piece that makes `projectDefaults.visibility: "private"` actually true.

3. Add a Share action. **(done: Project browser `Share...` action; editor/viewer roles and shared badge)**
   - Owner picks from the existing user roster (small, known set — same list Admin already manages,
     not an open invite) to add someone as a collaborator.
   - This is the "open up for collaboration" moment: a project stays single-owner and invisible to
     everyone else until this is used.
   - Surface membership (avatars/names) and a private/shared badge in the Project browser.

4. Make Live Rooms respect project membership. **(done for linked rooms)**
   - A room started from a Project should only be joinable by that project's members, not anyone
     who guesses/receives the room name — closing the gap noted in Server-First Collaboration Model
     phase 3 ("no membership list beyond the single owner").

5. Extend Admin visibility.
   - The Admin "Projects" section (Server-First Collaboration Model phase 5) already lists
     "ownership, membership" as an open item — this phase is what fills that in: an
     owner/members column, plus an admin override to add/remove members or reassign ownership.

## Project Versioning

Goal: let people see and recover a project's history, not just have it silently exist on disk.

Current state — the server mechanics already exist, but nothing surfaces them to a user:

- Every save (`PUT /api/projects/:uuid/file`) auto-snapshots the previous `project.od` into `revisions/<ISO-timestamp>.od` before overwriting it (`docker-server.mjs:442-453`), capped at the 20 most recent revisions (`PROJECT_REVISION_LIMIT`) — oldest deleted first.
- `GET /api/projects/:uuid/revisions` lists the stamps; `GET /api/projects/:uuid/revisions/:stamp` downloads one revision's raw bytes. Both exist server-side.
- Live Room autosnapshotting (Server-First Collaboration Model phase 3) writes through the same `PUT .../file` path, so active Live Room sessions already feed this history for free.
- **Nothing client-side reads any of this.** No Version History panel, no restore button, no labeling, no per-revision author, no diff. The only client reference to `revision` in the whole app is the write-side autosnapshot trigger in `StudioLiveRoomConnect.ts` — nothing ever calls the list/download endpoints.
- The cap is count-based and blind to intent: 20 slots get consumed by routine autosaves as fast as by deliberate checkpoints, so a deliberate "before I try this" save can silently roll off within one active editing session.
- There's no restore endpoint — restoring today would mean downloading a revision's bytes and re-`PUT`ing them as current (itself safe, since it snapshots the state being replaced), but no code path does this yet.
- Versioning only exists for server-backed projects. OPFS-only/local projects have no history at all — consistent with this fork's existing stance that OPFS is a cache/recovery copy and the server is primary, so scoping versioning to server-backed projects only is reasonable rather than a gap to close.

Proposed phases:

1. Ship a Version History panel — the highest-leverage step, since the server side already works.
   - Surface `GET .../revisions` as a list (relative timestamps) in the Project browser / project menu.
   - Add restore: safest as a dedicated `POST /api/projects/:uuid/revisions/:stamp/restore` (atomic on the server) rather than a client-side GET+PUT round trip, to avoid a race against a concurrent Live Room autosnapshot landing mid-restore.
   - A lightweight diff/preview (name, cover, track count, duration) before committing to restore, so it's not a blind swap.

2. Separate deliberate checkpoints from autosave churn.
   - Add a "Save as Version" action that writes a named/labeled revision, distinct from the silent autosave-on-save snapshot.
   - Exempt named versions from the rolling 20-slot cap (or give them their own, larger/unbounded bucket) so a labeled checkpoint can't be evicted by ordinary autosave noise.
   - This needs each revision to carry more than a filename: a small sidecar (author, label, timestamp) next to the `.od` file, the same way `meta.json` already sits next to `project.od`.

3. Converge with A/B project variants (see Live Collaboration Features below).
   - A "named version" here and a "labeled variant" there are the same underlying object — one labeled, restorable snapshot mechanism should serve both project history browsing and A/B mix comparison, rather than building two parallel systems that drift apart.

4. Extend Admin visibility.
   - The Admin "Projects" section (Server-First Collaboration Model phase 5) already lists storage usage/export as open items — add per-project revision count/size there, plus a manual prune action, once revisions can carry labels worth protecting from the cap.

## Live Collaboration Features

Goal: give collaborators the signals they'd expect from any shared document — who's touching what, a place to leave notes, and a way to compare alternatives — on top of the existing Live Room / Yjs sync layer.

Current building blocks already shipped (this is more complete than it looks from the roadmap alone):

- **Presence/awareness** (`RoomAwareness.ts`, `RoomStatus.tsx`): each connected user broadcasts name, color, and panel location over the Yjs awareness protocol; shown as a status bar and per-panel dots.
- **Remote selection highlighting** (`RemoteSelections.ts` + `FilteredRemoteSelection`): every other user's selection is watched so overlays can show what regions/devices *they* have selected, scoped by type (region vs device vs note).
- Each `UserInterfaceBox` (one per connected user, replicated through the normal box graph) already carries `editing-device-chain`, `editing-timeline-region`, and `editing-modular-system` pointers — "what this user is currently focused on" already exists as synced state, it's just not surfaced in the UI beyond selection outlines.
- **Live Room chat** (`ChatService.ts`, an ephemeral `Y.Array` on the room doc) and **P2P sample/soundfont exchange** between peers are both shipped.
- Server-side **project revision snapshots** already exist (`/api/projects` snapshots under Server-First Collaboration Model phase 2).
- Nothing exists yet for locking, persistent comments, or variant/version compare — no `locked` field on any track/device box, no comment box type, no compare UI.

### 1. Track locking

Two different features hide under "locking" — worth keeping separate rather than building one thing that tries to do both:

- **Soft lock (presence-derived, no schema change).** Surface the already-synced `editing-timeline-region` / `editing-device-chain` pointers as a visual indicator on track headers — "Alice is editing this" — the same way `RemoteSelections` already drives selection overlays. Close to free: the data is already replicating, this just needs a track-header consumer. Advisory only, never blocks anyone.
- **Hard lock (new persisted state, needs enforcement).** A `locked` boolean on `AudioUnitBox`/track, same shape as the existing `mute`/`solo` fields, replicated like any other box field. Once set, everyone (including the person who set it, until they unlock it) is blocked from mutating that track's regions/devices/parameters. Needs a schema field, edit-path guards at every track-mutation entry point (region move/resize/delete, device add/remove, parameter change — needs an audit, likely centralized behind one guard rather than scattered checks), a lock icon/toggle in the track header, and a decision on who's allowed to unlock a track someone else locked (anyone? only the locker? project owner override?) — a product call, not just an engineering one.

Ship soft lock first — it reuses infrastructure that already exists. Treat hard lock as a larger follow-up once the edit-path audit is done.

### 2. Comments

Model on the existing `MarkerBox` pattern (`packages/studio/forge-boxes/src/schema/std/timeline/MarkerBox.ts`) rather than chat: a `CommentBox` (position, optional track/device anchor, author name/color/user id, text, timestamp, resolved flag) referenced from `TimelineBox` the way markers are, so it replicates through the normal box graph and **persists with the project** — unlike chat, which is a session-only `Y.Array` that disappears when the room closes. That distinction is the point: comments are the async/Projects-mode complement to chat, so a note left on a track is still there when a collaborator opens the Project later, live room or not.

- Threading: flat comments, or a `CommentBox` + `CommentReplyBox` pair. Either way, capture author name/color as an immutable snapshot at write time — same choice chat already made — so a later identity change doesn't rewrite history.
- Anchoring: timeline position (like markers) plus an optional track/device reference, so a comment can sit "at bar 32" or "on the reverb on the vocal bus."
- UI: comment pins on the timeline ruler/track header (visually distinct from marker pins), a thread panel, resolved/unresolved filter.
- Reuse the presence color/name convention from `RoomAwareness` so a comment's author dot matches their live-room color.

### 3. A/B project variants

Scoped to project-level compare, not per-device bypass toggling (that's a local, single-user, non-collaborative UI feature — worth a future roadmap line of its own, but it doesn't belong in this batch).

- Build directly on the labeled-revision mechanism from Project Versioning above rather than inventing new storage — a "variant" is a named version, just presented as a compare pair instead of a linear history list.
- Needs: a compare UI to switch the working state between two named versions without losing either, and playback that can instant-switch (crossfade later) between them for A/B listening.
- Collaboration angle: variants should be visible to everyone with access to the Project, not local `Save As` copies — "your mix" vs "my mix" as two variants of one Project, not two separate Projects, so history doesn't fragment.
- Open question: does switching variants swap the whole box graph (heavy, but simple — reuses existing snapshot restore) or diff just the mixer/device state (lighter switching, much more invasive to build)? Recommend starting with whole-graph swap since the snapshot/restore plumbing is closest to already existing.

Proposed order: soft lock indicator → comments → hard lock enforcement → A/B variants (the variant-naming/compare UI is the least-built-out piece, and benefits from the snapshot system maturing first).

## DAW Import/Export

Goal: let people bring projects in from, and take projects out to, the DAWs they already use.

Current state:

- **DAWproject** (the open Bitwig-authored interchange format, `packages/lib/dawproject` + `packages/studio/core/src/dawproject`) is already shipped: `gatedDAW menu > Export/Import > DAWproject...`. It round-trips tracks, clips, notes, automation, tempo/time signature, audio files, and sends/routing.
- **Standard MIDI files** (`.mid`) already import/export per track, region, and clip (`MidiImport.ts`, `NoteMidiExport.ts`).
- DAWproject itself is only natively supported by a handful of DAWs: Bitwig Studio, PreSonus Studio One, Steinberg Cubase/Nuendo (13+), and Tracktion Waveform, plus community extensions for Reaper/Ardour. **Ableton Live and FL Studio — the two DAWs most likely to be a newcomer's "previous DAW" — support neither DAWproject nor any open project format**, so this path can't reach them regardless of how much DAWproject work is done.
- DAWproject device/FX fidelity is currently asymmetric and incomplete:
  - On import, only the standard `EqualizerSchema` is mapped to a native device (into Revamp); every other foreign plugin or built-in device becomes an "Unknown FX" placeholder box (`DawProjectImporter.ts`, tagged with a ⚠️ comment).
  - On export, every gatedDAW device is written as an opaque `deviceVendor: "openDAW"` blob that gatedDAW can decode (`DawProjectExporter.ts`) — a project reopened in Bitwig or Cubase will show unrecognized plugins on every track.
  - Round-tripping gatedDAW's own devices through DAWproject (gatedDAW → DAWproject → gatedDAW) is implemented but currently disabled behind a `TODO`, due to a known bug that produces an invalid host pointer (`DawProjectImporter.ts`).
  - The `lib-dawproject` schema itself only models `EqualizerSchema` as a typed built-in device; the DAWproject spec's other standard device types (compressor, limiter, gate, etc.) aren't represented yet, so there's nothing to map onto even before touching the importer/exporter.

Proposed phases:

1. Fix DAWproject fidelity for gatedDAW-to-gatedDAW round trips first.
   - Re-enable and fix the native-device roundtrip path so a gatedDAW project exported to DAWproject and reimported into gatedDAW loses nothing (currently every device degrades to Unknown FX).
   - Add regression tests using real files exported from at least one third-party app (Bitwig or Studio One) rather than only self-generated fixtures.

2. Extend `lib-dawproject`'s device schema coverage.
   - Model the DAWproject spec's other standard built-in device types (compressor, limiter, gate) alongside the existing `EqualizerSchema`.
   - Map them to/from the closest native gatedDAW device, the way `BuiltinDevices.equalizer` already does for EQ.
   - For anything with no native equivalent, keep the Unknown FX fallback but make it visible in the UI (not just a code comment) so users know a plugin didn't transfer.

3. Add Ableton Live (`.als`) import.
   - `.als` is gzipped XML; undocumented but well reverse-engineered by existing open-source parsers.
   - Scope to import-only: track/clip/note/automation structure and audio references. Non-native devices fall back to Unknown FX, same as foreign DAWproject plugins.
   - Writing `.als` is high-risk (undocumented, easy to produce files Live can't open) — not worth attempting.

4. Add FL Studio (`.flp`) import.
   - Proprietary binary format, but has a maintained open-source parser spec (`pyflp`) covering channels, playlist, patterns, and automation.
   - Same import-only scope and Unknown FX fallback as Ableton.

5. Consider Reaper (`.rpp`) as a lower-effort extra.
   - `.rpp` is a human-readable text tree, one of the simpler proprietary formats to parse, and Reaper's user base overlaps with the self-hosted/power-user crowd this fork targets.
   - Could realistically support both import and export given the format's simplicity, unlike Live/FL Studio.

## Immediate Next Steps

1. ~~Wire the client Project browser to server project list/load/save APIs.~~ **(done)**
2. ~~Add individual user/session auth (server-side foundation + login/setup gate).~~ **(done)**
3. ~~Add the Admin shell UI (Users, Invites, Settings) on `/admin`.~~ **(done; Audit tab still open)**
4. ~~Add invite links so friends can self-register instead of an admin calling `/api/admin/users` directly.~~ **(done)**
5. ~~Link Live Rooms to server Projects and autosnapshot them.~~ **(done, partial — see phase 3 above)**
6. Build an asset intake folder structure on the media volume.
7. Import the first large sample and SF2 batches.
8. Create ten starter presets/racks.
9. Continue the retro-future synthwave UI pass.
10. Fix the disabled native-device DAWproject roundtrip bug (see DAW Import/Export).
