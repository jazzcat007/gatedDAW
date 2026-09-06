# OMV Factory Ingest Run Checklist

Use this when running the next factory intake step directly on the OMV host.

## Paths

```bash
export MEDIA_ROOT=/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw
export FACTORY_ROOT="$MEDIA_ROOT/factory"
export INTAKE_ROOT="$MEDIA_ROOT/factory-intake"
export REPO_ROOT=/root/opendaw
export TRUSTED_MIRROR=/mnt/media
export DOWNLOAD_ROOT="$INTAKE_ROOT/_downloads"
```

Expected Docker environment:

```bash
docker inspect opendaw --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(FACTORY_ASSET_ROOT=/data/factory|OPENDAW_FACTORY_OFFLINE_ONLY=true)$'
```

## 1. Sync Repo

```bash
cd "$REPO_ROOT"
git fetch origin screwpulp/self-hosted
git pull --ff-only origin screwpulp/self-hosted
```

Confirm the intake tools are present:

```bash
test -x "$REPO_ROOT/factory-intake/ingest.sh"
test -f "$REPO_ROOT/factory-intake/manifest.json"
test -f "$REPO_ROOT/factory-intake/verify-manifest.mjs"
test -f "$REPO_ROOT/factory-intake/update-manifest.mjs"
```

## 2. Check Trusted Mirror

The default ingest script reads from `/mnt/media`.

```bash
test -d "$TRUSTED_MIRROR/SoundFonts"
test -d "$TRUSTED_MIRROR/Samples"

find "$TRUSTED_MIRROR/SoundFonts" -maxdepth 2 -type f -iname '*.sf2' | wc -l
find "$TRUSTED_MIRROR/Samples" -type f \
  \( -iname '*.wav' -o -iname '*.wave' -o -iname '*.aif' -o -iname '*.aiff' -o -iname '*.flac' -o -iname '*.mp3' -o -iname '*.m4a' -o -iname '*.ogg' -o -iname '*.opus' \) | wc -l
```

If `/mnt/media` is not mounted on this host, mount or bind the trusted mirror first, or run with `TRUSTED_MIRROR=/path/to/mirror`.

If no trusted mirror is mounted, `ingest.sh` defaults `DOWNLOAD_FIRST=auto` and will try direct downloads where the manifest has a usable URL. SoundFont downloads are controlled by `DOWNLOAD_SOUNDFONTS=1`.

Expected mirror folders:

```text
SoundFonts/GeneralUser-GS
SoundFonts/FreePats-GM-Orchestral
SoundFonts/FluidR3-GM
SoundFonts/FreePats-GM-Percussion
SoundFonts/Famicom-Multichip-Chiptune
SoundFonts/VintageDreamsWaves
Samples/Bass
Samples/Drums
Samples/Foley
Samples/Guitar
Samples/Impulse-Responses
Samples/Keys
Samples/Loops
Samples/One-Shots
Samples/Synth
Samples/Vocals
```

VCSL/VSCO SFZ checkouts are registered in `manifest.json` but intentionally remain `imported: false` until an SFZ loader exists.

## 3. Baseline Verify

```bash
cd "$REPO_ROOT"
FACTORY_ROOT="$FACTORY_ROOT" node factory-intake/verify-manifest.mjs
```

Current known baseline:

```text
samples: 902
soundfonts: 7
presets: 49
```

## 4. Run Ingest

Run the repo script from the media-volume intake directory so logs and staged files stay with the OMV appdata volume:

```bash
mkdir -p "$INTAKE_ROOT"
cp -f "$REPO_ROOT/factory-intake/ingest.sh" "$INTAKE_ROOT/ingest.sh"
cp -f "$REPO_ROOT/factory-intake/manifest.json" "$INTAKE_ROOT/manifest.json"
chmod +x "$INTAKE_ROOT/ingest.sh"

cd "$INTAKE_ROOT"
MEDIA_ROOT="$MEDIA_ROOT" \
INTAKE_ROOT="$INTAKE_ROOT" \
FACTORY_ROOT="$FACTORY_ROOT" \
REPO_ROOT="$REPO_ROOT" \
TRUSTED_MIRROR="$TRUSTED_MIRROR" \
DOWNLOAD_ROOT="$DOWNLOAD_ROOT" \
bash ingest.sh
```

To force download-first mode even when a mirror is mounted:

```bash
DOWNLOAD_FIRST=1 bash "$INTAKE_ROOT/ingest.sh"
```

To disable direct SoundFont downloads:

```bash
DOWNLOAD_SOUNDFONTS=0 bash "$INTAKE_ROOT/ingest.sh"
```

To disable direct sample downloads:

```bash
DOWNLOAD_SAMPLES=0 bash "$INTAKE_ROOT/ingest.sh"
```

Direct-download support:

- GitHub repository URLs are shallow-cloned into `$DOWNLOAD_ROOT/<pack-id>` and `.sf2` files are copied into the pack intake folder.
- GitHub sample repository URLs are shallow-cloned into `$DOWNLOAD_ROOT/<pack-id>` and supported audio files are copied into the pack intake folder.
- Direct `.sf2` and supported audio URLs are downloaded and copied into the pack intake folder.
- `.zip`, `.tar.gz`, `.tgz`, `.tar.xz`, `.txz`, `.tar.bz2`, and `.tbz2` archives are downloaded and extracted into the pack intake folder.
- Missing or `TODO` URLs are logged and skipped.
- Supported sample audio extensions: `.wav`, `.wave`, `.aif`, `.aiff`, `.flac`, `.mp3`, `.m4a`, `.ogg`, `.opus`.

Manifest checksum entries are verified before imports. Each pack's `checksums` array may contain either sha256sum-format strings or objects:

```json
{
  "checksums": [
    "0123456789abcdef...  soundfonts/GeneralUser-GS/GeneralUser-GS.sf2",
    {
      "sha256": "0123456789abcdef...",
      "path": "samples/Drums/example.wav"
    }
  ]
}
```

Checksum paths are relative to `$INTAKE_ROOT`.

For a dry staging pass without importing:

```bash
RUN_IMPORTS=0 bash "$INTAKE_ROOT/ingest.sh"
```

For an import without syncing from the mirror again:

```bash
SYNC_FROM_MIRROR=0 bash "$INTAKE_ROOT/ingest.sh"
```

## 5. Post-Run Verification

```bash
cd "$REPO_ROOT"
FACTORY_ROOT="$FACTORY_ROOT" node factory-intake/verify-manifest.mjs
```

Required acceptance:

- Samples: at least 1500
- SoundFonts: at least 10
- Presets: at least 19
- Required UUIDs present:
  - `9575028c-7a1f-489f-9770-fccc8cff2734`
  - `f7bf84f9-2ae8-4b5f-9650-97e69aff7e4b`
  - `f51ed198-f47a-4253-b765-888e0c8d16e6`
  - `0ab1a85f-1d07-4a24-8418-ab5a6b6e3490`

Quick UUID check:

```bash
grep -R '9575028c-7a1f-489f-9770-fccc8cff2734' "$FACTORY_ROOT/soundfonts/index.json"
grep -R 'f7bf84f9-2ae8-4b5f-9650-97e69aff7e4b' "$FACTORY_ROOT/soundfonts/index.json"
grep -R 'f51ed198-f47a-4253-b765-888e0c8d16e6' "$FACTORY_ROOT/samples/index.json"
grep -R '0ab1a85f-1d07-4a24-8418-ab5a6b6e3490' "$FACTORY_ROOT/samples/index.json"
```

## 6. Mark Imported Packs

Only mark packs imported after post-run verification passes.

```bash
cd "$REPO_ROOT"
node factory-intake/update-manifest.mjs --name "GeneralUser GS" --imported true
node factory-intake/update-manifest.mjs --name "FreePats GM Orchestral" --imported true
node factory-intake/update-manifest.mjs --name "FluidR3 GM" --imported true
node factory-intake/update-manifest.mjs --name "FreePats GM Percussion" --imported true
node factory-intake/update-manifest.mjs --name "Famicom Multichip Chiptune" --imported true
node factory-intake/update-manifest.mjs --name "VintageDreamsWaves" --imported true
node factory-intake/update-manifest.mjs --name "AdventureKid Impulse Responses" --imported true
node factory-intake/update-manifest.mjs --name "UIowa Steinway" --imported true
node factory-intake/update-manifest.mjs --name "Drums" --imported true
node factory-intake/update-manifest.mjs --name "One-Shots" --imported true
node factory-intake/update-manifest.mjs --name "Loops" --imported true
node factory-intake/update-manifest.mjs --name "Bass" --imported true
node factory-intake/update-manifest.mjs --name "Synth" --imported true
node factory-intake/update-manifest.mjs --name "Guitar" --imported true
node factory-intake/update-manifest.mjs --name "Foley" --imported true
node factory-intake/update-manifest.mjs --name "Vocals" --imported true
```

Do not mark `VCSL SFZ` or `VSCO 2 CE SFZ` imported until the SFZ loader/catalog type exists.

Commit the manifest update after verification:

```bash
git add factory-intake/manifest.json
git commit -m "factory-intake: mark first batch imported"
git push origin screwpulp/self-hosted
```
