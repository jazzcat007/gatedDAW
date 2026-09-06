# Local Deployment Notes

Date: 2026-09-06
Host branch: `screwpulp/self-hosted`
Remote: `origin/screwpulp/self-hosted`
Head at time of note: `40d0dfac3 feat(devices): add Chord MIDI effect device`

## Local changes not yet pushed

These changes were made on this installation after deploying the Chord MIDI effect update.

### WASM/static cache fix

Files:

- `docker-server.mjs`
- `packages/studio/core-wasm/src/engine-modules.ts`

Reason:

The self-hosted static server was serving non-HTML assets with:

```text
Cache-Control: public, max-age=31536000, immutable
```

That included unversioned WASM URLs such as:

```text
/wasm-engine/wasm/engine.wasm
/wasm-engine/wasm/plugins/device_chord.wasm
/wasm-engine/wasm/plugins/device_euclid.wasm
```

After adding new device types, a browser could keep an old immutable engine WASM while loading newer UI code.
That can produce:

```text
Audio-Engine Error apply_updates rejected a transaction (code 1)
```

when inserting or editing new device boxes such as `ChordDeviceBox`.

Fix:

- Serve `.html`, `.json`, and `.wasm` responses with `no-store, no-cache, must-revalidate`.
- Add `CDN-Cache-Control: no-store` and `Cloudflare-CDN-Cache-Control: no-store` for those files.
- Add a cache-busting query string to all engine/device WASM fetches in `loadEngineModules`.
- Use `fetch(..., {cache: "reload"})` for those WASM requests.

### Chord live-insert repro test

File:

- `packages/studio/core-wasm/test/chord-live-insert.test.ts`

Purpose:

This test reproduces the browser/worklet sync path for adding Chord after the engine has already synced:

```text
BoxGraph -> SyncSource -> serializeUpdateTasks -> engine.apply_updates
```

It verifies:

- A minimal project can sync to the real WASM engine.
- `ChordDeviceBox` can be inserted live into an audio unit MIDI-effect chain.
- Every Chord parameter can be updated afterward without `apply_updates` rejection.

Validation run:

```bash
npm --prefix /root/opendaw/packages/studio/core-wasm run test:vitest -- chord-live-insert.test.ts
```

Result:

```text
1 test passed
```

## Deployment performed locally

The hosted container was rebuilt and recreated from the dirty working tree containing the cache fixes:

```bash
cd /root/opendaw
docker compose build opendaw
docker compose up -d opendaw
```

Deployed image observed:

```text
image id: 75e3285a00f84817ed1297a21069da9b2363aa14f3aaeda5403d1075f12074b8
build uuid: 5782bae1-74e2-48db-8aac-3f78935af45b
```

Runtime header check:

```text
/wasm-engine/wasm/engine.wasm?v=forced                200 no-store, no-cache, must-revalidate
/wasm-engine/wasm/plugins/device_chord.wasm?v=forced  200 no-store, no-cache, must-revalidate
```

## Remaining local git state

Expected local status after this note:

```text
M  docker-server.mjs
M  packages/studio/core-wasm/src/engine-modules.ts
?? packages/studio/core-wasm/test/chord-live-insert.test.ts
?? docs/local-deployment-notes.md
```

There is also an older stash:

```text
stash@{0}: codex-newline-before-euclid-deploy
```

That stash was newline-only cosmetic noise and is not required for the cache fix.
