# Factory Import Execution - 2026-09-06

## Scope

Execution attempt for the first factory intake batch described in `factory-intake/import-batch-plan.md`.

## Environment

- Repo: `jazzcat007/openDAW`
- Branch: `screwpulp/self-hosted`
- Factory root: `/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory`
- Container factory mount: `/data/factory`
- `FACTORY_ASSET_ROOT=/data/factory`
- `OPENDAW_FACTORY_OFFLINE_ONLY=true`
- Node available on host: `v24.20.0`
- ffmpeg/ffprobe available on host: `5.1.9-0+deb12u1`
- Free space on OMV media volume: 16T available on 17T XFS filesystem

## Result

The import batch was not executed because the source intake assets are not present in this checkout.

Present locally:

- `factory-intake/presets`

Missing locally:

- `factory-intake/samples`
- `factory-intake/soundfonts`

The 2026-09-02 intake note says those missing folders should contain 590 staged samples across 10 categories and 6 SoundFonts. They must be restored or rsynced from the dev-box/staging source before the batch import commands can produce catalog growth.

## Catalog Verification

Validated against the OMV factory root after the blocked import attempt:

- Samples: 902
- SoundFonts: 7
- Presets: 49
- Demos: 19
- Missing sample payload files referenced by catalog: 0
- Missing SoundFont payload files referenced by catalog: 0

The four expected batch UUIDs are not present yet:

- `9575028c-7a1f-489f-9770-fccc8cff2734` - GeneralUser GS
- `f7bf84f9-2ae8-4b5f-9650-97e69aff7e4b` - FreePats GM Orchestral
- `f51ed198-f47a-4253-b765-888e0c8d16e6` - Guitar Cab IR
- `0ab1a85f-1d07-4a24-8418-ab5a6b6e3490` - Piano one-shot

## Acceptance Status

- Samples at least 1500: not met, still 902
- SoundFonts at least 10: not met, still 7
- Presets at least 19: met, 49
- Required UUIDs present: not met
- Offline-only active: met

## Next Action

Restore or sync the missing staged source folders into the repo checkout:

```bash
factory-intake/samples
factory-intake/soundfonts
```

Then rerun `factory-intake/import-batch-plan.md` from Phase 1.
