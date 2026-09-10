#!/usr/bin/env bash
set -euo pipefail

MEDIA_ROOT="${MEDIA_ROOT:-/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw}"
INTAKE_ROOT="${INTAKE_ROOT:-$MEDIA_ROOT/factory-intake}"
FACTORY_ROOT="${FACTORY_ROOT:-$MEDIA_ROOT/factory}"
REPO_ROOT="${REPO_ROOT:-/root/opendaw}"
TRUSTED_MIRROR="${TRUSTED_MIRROR:-/mnt/media}"
LOG_FILE="${LOG_FILE:-/var/log/opendaw-ingest.log}"
SYNC_FROM_MIRROR="${SYNC_FROM_MIRROR:-1}"
DOWNLOAD_FIRST="${DOWNLOAD_FIRST:-auto}"
DOWNLOAD_SOUNDFONTS="${DOWNLOAD_SOUNDFONTS:-1}"
DOWNLOAD_SAMPLES="${DOWNLOAD_SAMPLES:-1}"
RUN_IMPORTS="${RUN_IMPORTS:-1}"
RUN_SFZ_IMPORTS="${RUN_SFZ_IMPORTS:-1}"
DOWNLOAD_ROOT="${DOWNLOAD_ROOT:-$INTAKE_ROOT/_downloads}"

if [[ -w "$(dirname "$LOG_FILE")" ]]; then
  exec > >(tee -a "$LOG_FILE") 2>&1
else
  echo "warning: cannot write $LOG_FILE; logging to stdout only" >&2
fi

echo "== openDAW factory ingest $(date -Is) =="
echo "intake=$INTAKE_ROOT"
echo "factory=$FACTORY_ROOT"
echo "repo=$REPO_ROOT"
echo "mirror=$TRUSTED_MIRROR"
echo "download_first=$DOWNLOAD_FIRST"
echo "download_soundfonts=$DOWNLOAD_SOUNDFONTS"
echo "download_samples=$DOWNLOAD_SAMPLES"
echo "run_sfz_imports=$RUN_SFZ_IMPORTS"

require_tool() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing required tool: $1" >&2
    exit 2
  }
}

mkdir -p \
  "$INTAKE_ROOT"/samples/{Bass,Drums,Foley,Guitar,Impulse-Responses,Keys,Loops,One-Shots,Synth,Vocals} \
  "$INTAKE_ROOT"/soundfonts/{GeneralUser-GS,FreePats-GM-Orchestral,FluidR3-GM,FreePats-GM-Percussion,Famicom-Multichip-Chiptune,VintageDreamsWaves} \
  "$INTAKE_ROOT"/sfz \
  "$DOWNLOAD_ROOT" \
  "$FACTORY_ROOT"/{samples,soundfonts,presets,demos}

# Preflight: check mirror availability
MIRROR_AVAILABLE=0
if [[ -d "$TRUSTED_MIRROR" ]]; then
  MIRROR_AVAILABLE=1
  echo "trusted mirror found: $TRUSTED_MIRROR"
else
  echo "trusted mirror NOT found: $TRUSTED_MIRROR"
fi

sync_dir() {
  local source="$1"
  local target="$2"
  if [[ -d "$source" ]]; then
    mkdir -p "$target"
    rsync -av --checksum "$source"/ "$target"/
  else
    echo "skip sync, source missing: $source"
  fi
}

if [[ "$SYNC_FROM_MIRROR" == "1" && "$MIRROR_AVAILABLE" == "1" ]]; then
  require_tool rsync
  sync_dir "$TRUSTED_MIRROR/SoundFonts/GeneralUser-GS" "$INTAKE_ROOT/soundfonts/GeneralUser-GS"
  sync_dir "$TRUSTED_MIRROR/SoundFonts/FreePats-GM-Orchestral" "$INTAKE_ROOT/soundfonts/FreePats-GM-Orchestral"
  sync_dir "$TRUSTED_MIRROR/SoundFonts/FluidR3-GM" "$INTAKE_ROOT/soundfonts/FluidR3-GM"
  sync_dir "$TRUSTED_MIRROR/SoundFonts/FreePats-GM-Percussion" "$INTAKE_ROOT/soundfonts/FreePats-GM-Percussion"
  sync_dir "$TRUSTED_MIRROR/SoundFonts/Famicom-Multichip-Chiptune" "$INTAKE_ROOT/soundfonts/Famicom-Multichip-Chiptune"
  sync_dir "$TRUSTED_MIRROR/SoundFonts/VintageDreamsWaves" "$INTAKE_ROOT/soundfonts/VintageDreamsWaves"

  sync_dir "$TRUSTED_MIRROR/Samples/Bass" "$INTAKE_ROOT/samples/Bass"
  sync_dir "$TRUSTED_MIRROR/Samples/Drums" "$INTAKE_ROOT/samples/Drums"
  sync_dir "$TRUSTED_MIRROR/Samples/Foley" "$INTAKE_ROOT/samples/Foley"
  sync_dir "$TRUSTED_MIRROR/Samples/Guitar" "$INTAKE_ROOT/samples/Guitar"
  sync_dir "$TRUSTED_MIRROR/Samples/Impulse-Responses" "$INTAKE_ROOT/samples/Impulse-Responses"
  sync_dir "$TRUSTED_MIRROR/Samples/Keys" "$INTAKE_ROOT/samples/Keys"
  sync_dir "$TRUSTED_MIRROR/Samples/Loops" "$INTAKE_ROOT/samples/Loops"
  sync_dir "$TRUSTED_MIRROR/Samples/One-Shots" "$INTAKE_ROOT/samples/One-Shots"
  sync_dir "$TRUSTED_MIRROR/Samples/Synth" "$INTAKE_ROOT/samples/Synth"
  sync_dir "$TRUSTED_MIRROR/Samples/Vocals" "$INTAKE_ROOT/samples/Vocals"
fi

has_sf2() {
  local path="$1"
  [[ -d "$path" ]] && find "$path" -type f -iname '*.sf2' -print -quit | grep -q .
}

has_audio() {
  local path="$1"
  [[ -d "$path" ]] && find "$path" -type f \( -iname '*.wav' -o -iname '*.wave' -o -iname '*.aif' -o -iname '*.aiff' -o -iname '*.flac' -o -iname '*.mp3' -o -iname '*.m4a' -o -iname '*.ogg' -o -iname '*.opus' \) -print -quit | grep -q .
}

download_file() {
  local url="$1"
  local target="$2"
  if [[ -f "$target" ]]; then
    echo "download exists: $target"
    return
  fi
  curl -fL --retry 3 --retry-delay 2 -o "$target" "$url"
}

extract_archive() {
  local archive="$1"
  local target="$2"
  mkdir -p "$target"
  case "$archive" in
    *.zip)
      require_tool unzip
      unzip -oq "$archive" -d "$target"
      ;;
    *.tar.gz|*.tgz)
      tar -xzf "$archive" -C "$target"
      ;;
    *.tar.xz|*.txz)
      tar -xJf "$archive" -C "$target"
      ;;
    *.tar.bz2|*.tbz2)
      tar -xjf "$archive" -C "$target"
      ;;
    *.sf2)
      cp -f "$archive" "$target/"
      ;;
    *)
      echo "unsupported SoundFont download format: $archive" >&2
      return 1
      ;;
  esac
}

copy_audio_files() {
  local source="$1"
  local target="$2"
  mkdir -p "$target"
  rsync -a \
    --include='*/' \
    --include='*.wav' --include='*.WAV' \
    --include='*.wave' --include='*.WAVE' \
    --include='*.aif' --include='*.AIF' \
    --include='*.aiff' --include='*.AIFF' \
    --include='*.flac' --include='*.FLAC' \
    --include='*.mp3' --include='*.MP3' \
    --include='*.m4a' --include='*.M4A' \
    --include='*.ogg' --include='*.OGG' \
    --include='*.opus' --include='*.OPUS' \
    --exclude='*' \
    "$source"/ "$target"/
}

manifest_soundfonts() {
  local manifest="$1"
  MANIFEST_PATH="$manifest" node <<'NODE'
const {readFileSync} = require("node:fs")
const manifest = JSON.parse(readFileSync(process.env.MANIFEST_PATH, "utf8"))
for (const pack of manifest.soundfonts ?? []) {
  const url = pack.downloadUrl || ""
  console.log([
    pack.id || "",
    pack.name || "",
    url,
    pack.intakePath || "",
    pack.branch || ""
  ].join("\t"))
}
NODE
}

manifest_samples() {
  local manifest="$1"
  MANIFEST_PATH="$manifest" node <<'NODE'
const {readFileSync} = require("node:fs")
const manifest = JSON.parse(readFileSync(process.env.MANIFEST_PATH, "utf8"))
for (const pack of manifest.samples ?? []) {
  const url = pack.downloadUrl || ""
  console.log([
    pack.id || "",
    pack.name || "",
    url,
    pack.intakePath || "",
    pack.branch || ""
  ].join("\t"))
}
NODE
}

manifest_checksums() {
  local manifest="$1"
  MANIFEST_PATH="$manifest" node <<'NODE'
const {readFileSync} = require("node:fs")
const manifest = JSON.parse(readFileSync(process.env.MANIFEST_PATH, "utf8"))
const sections = ["soundfonts", "samples", "sfz"]
for (const section of sections) {
  for (const pack of manifest[section] ?? []) {
    for (const checksum of pack.checksums ?? []) {
      if (typeof checksum === "string") {
        console.log(checksum)
      } else if (checksum?.sha256 && checksum?.path) {
        console.log(`${checksum.sha256}  ${checksum.path}`)
      }
    }
  }
}
NODE
}

verify_manifest_checksums() {
  local manifest="$1"
  local checksum_file
  checksum_file="$(mktemp)"
  manifest_checksums "$manifest" > "$checksum_file"
  if [[ ! -s "$checksum_file" ]]; then
    rm -f "$checksum_file"
    echo "skip manifest checksum verification, no declared checksums"
    return
  fi
  require_tool sha256sum
  echo "verifying checksums declared in $manifest"
  (cd "$INTAKE_ROOT" && sha256sum -c "$checksum_file")
  rm -f "$checksum_file"
}

fetch_soundfont_pack() {
  local id="$1"
  local name="$2"
  local url="$3"
  local intake_path="$4"
  local branch="$5"
  local target="$INTAKE_ROOT/$intake_path"
  local cache="$DOWNLOAD_ROOT/$id"

  if [[ -z "$url" || "$url" == TODO* ]]; then
    echo "skip SoundFont download, URL not configured: $name"
    return
  fi
  if has_sf2 "$target"; then
    echo "skip SoundFont download, staged .sf2 already present: $name"
    return
  fi

  mkdir -p "$target"
  case "$url" in
    https://github.com/*)
      require_tool git
      if [[ ! -d "$cache/.git" ]]; then
        echo "cloning SoundFont source: $name"
        if [[ -n "$branch" ]]; then
          git clone --depth 1 --branch "$branch" "$url" "$cache"
        else
          git clone --depth 1 "$url" "$cache"
        fi
      else
        echo "updating SoundFont source: $name"
        git -C "$cache" pull --ff-only
      fi
      rsync -a --include='*/' --include='*.sf2' --exclude='*' "$cache"/ "$target"/
      ;;
    *.zip|*.tar.gz|*.tgz|*.tar.xz|*.txz|*.tar.bz2|*.tbz2|*.sf2)
      local archive="$DOWNLOAD_ROOT/$id-${url##*/}"
      echo "downloading SoundFont source: $name"
      download_file "$url" "$archive"
      extract_archive "$archive" "$target"
      ;;
    *)
      echo "skip SoundFont download, unsupported URL shape for $name: $url"
      ;;
  esac
}

fetch_sample_pack() {
  local id="$1"
  local name="$2"
  local url="$3"
  local intake_path="$4"
  local branch="$5"
  local target="$INTAKE_ROOT/$intake_path"
  local cache="$DOWNLOAD_ROOT/$id"

  if [[ -z "$url" || "$url" == TODO* ]]; then
    echo "skip sample download, URL not configured: $name"
    return
  fi
  if has_audio "$target"; then
    echo "skip sample download, staged audio already present: $name"
    return
  fi

  mkdir -p "$target"
  case "$url" in
    https://github.com/*)
      require_tool git
      require_tool rsync
      if [[ ! -d "$cache/.git" ]]; then
        echo "cloning sample source: $name"
        if [[ -n "$branch" ]]; then
          git clone --depth 1 --branch "$branch" "$url" "$cache"
        else
          git clone --depth 1 "$url" "$cache"
        fi
      else
        echo "updating sample source: $name"
        git -C "$cache" pull --ff-only
      fi
      copy_audio_files "$cache" "$target"
      ;;
    *.zip|*.tar.gz|*.tgz|*.tar.xz|*.txz|*.tar.bz2|*.tbz2)
      local archive="$DOWNLOAD_ROOT/$id-${url##*/}"
      echo "downloading sample source: $name"
      download_file "$url" "$archive"
      extract_archive "$archive" "$target"
      ;;
    *.wav|*.wave|*.aif|*.aiff|*.flac|*.mp3|*.m4a|*.ogg|*.opus)
      local audio="$DOWNLOAD_ROOT/$id-${url##*/}"
      echo "downloading sample source: $name"
      download_file "$url" "$audio"
      cp -f "$audio" "$target/"
      ;;
    *)
      echo "skip sample download, unsupported URL shape for $name: $url"
      ;;
  esac
}

# Download-first mode: fetch assets directly if mirror missing or forced
if [[ "$DOWNLOAD_FIRST" == "1" || ( "$DOWNLOAD_FIRST" == "auto" && "$MIRROR_AVAILABLE" == "0" ) ]]; then
  echo "download-first mode active"
  require_tool git
  require_tool curl
  manifest_path="$INTAKE_ROOT/manifest.json"
  if [[ ! -f "$manifest_path" && -f "$REPO_ROOT/factory-intake/manifest.json" ]]; then
    manifest_path="$REPO_ROOT/factory-intake/manifest.json"
  fi
  # SFZ libraries
  if [[ ! -d "$INTAKE_ROOT/sfz/VCSL" ]]; then
    echo "cloning VCSL SFZ..."
    git clone --depth 1 --branch sfz https://github.com/sgossner/VCSL.git "$INTAKE_ROOT/sfz/VCSL"
  fi
  if [[ ! -d "$INTAKE_ROOT/sfz/VSCO-2-CE" ]]; then
    echo "cloning VSCO-2-CE SFZ..."
    git clone --depth 1 --branch SFZ https://github.com/sgossner/VSCO-2-CE.git "$INTAKE_ROOT/sfz/VSCO-2-CE"
  fi
  if [[ "$DOWNLOAD_SOUNDFONTS" == "1" ]]; then
    require_tool rsync
    if [[ -f "$manifest_path" ]]; then
      while IFS=$'\t' read -r id name url intake_path branch; do
        fetch_soundfont_pack "$id" "$name" "$url" "$intake_path" "$branch"
      done < <(manifest_soundfonts "$manifest_path")
    else
      echo "skip SoundFont downloads, manifest missing"
    fi
  fi
  if [[ "$DOWNLOAD_SAMPLES" == "1" ]]; then
    if [[ -f "$manifest_path" ]]; then
      while IFS=$'\t' read -r id name url intake_path branch; do
        fetch_sample_pack "$id" "$name" "$url" "$intake_path" "$branch"
      done < <(manifest_samples "$manifest_path")
    else
      echo "skip sample downloads, manifest missing"
    fi
  fi
fi

count_files() {
  local path="$1"
  local pattern="$2"
  if [[ -d "$path" ]]; then
    find "$path" -type f -iname "$pattern" | wc -l
  else
    echo 0
  fi
}

echo "staged sf2 files: $(count_files "$INTAKE_ROOT/soundfonts" '*.sf2')"
echo "staged sample files: $(find "$INTAKE_ROOT/samples" -type f \( -iname '*.wav' -o -iname '*.wave' -o -iname '*.aif' -o -iname '*.aiff' -o -iname '*.flac' -o -iname '*.mp3' -o -iname '*.m4a' -o -iname '*.ogg' -o -iname '*.opus' \) | wc -l)"

if [[ -f "$INTAKE_ROOT/manifest.sha256" ]]; then
  require_tool sha256sum
  echo "verifying checksums from $INTAKE_ROOT/manifest.sha256"
  (cd "$INTAKE_ROOT" && sha256sum -c manifest.sha256)
else
  echo "skip checksum verification, manifest missing: $INTAKE_ROOT/manifest.sha256"
fi

manifest_path="$INTAKE_ROOT/manifest.json"
if [[ ! -f "$manifest_path" && -f "$REPO_ROOT/factory-intake/manifest.json" ]]; then
  manifest_path="$REPO_ROOT/factory-intake/manifest.json"
fi
if [[ -f "$manifest_path" ]]; then
  verify_manifest_checksums "$manifest_path"
else
  echo "skip manifest checksum verification, manifest missing"
fi

if [[ "$RUN_IMPORTS" == "1" ]]; then
  require_tool node
  require_tool ffmpeg
  require_tool ffprobe

  node "$REPO_ROOT/scripts/import-soundfonts.mjs" "$INTAKE_ROOT/soundfonts/GeneralUser-GS" \
    --root "$FACTORY_ROOT" \
    --folder "GeneralUser" \
    --license "GPL-3.0" \
    --url "https://github.com/GalleryOfBots/GeneralUser-GS"

  node "$REPO_ROOT/scripts/import-soundfonts.mjs" "$INTAKE_ROOT/soundfonts/FreePats-GM-Orchestral" \
    --root "$FACTORY_ROOT" \
    --folder "FreePats" \
    --license "GPL-3.0" \
    --url "https://github.com/free-pats/FreePats"

  node "$REPO_ROOT/scripts/import-soundfonts.mjs" "$INTAKE_ROOT/soundfonts/FluidR3-GM" \
    --root "$FACTORY_ROOT" \
    --folder "FluidR3" \
    --license "LGPL-3.0" \
    --url "TODO_REPLACE_WITH_SOURCE_URL"

  node "$REPO_ROOT/scripts/import-soundfonts.mjs" "$INTAKE_ROOT/soundfonts/FreePats-GM-Percussion" \
    --root "$FACTORY_ROOT" \
    --folder "FreePats" \
    --license "GPL-3.0" \
    --url "TODO_REPLACE_WITH_SOURCE_URL"

  node "$REPO_ROOT/scripts/import-soundfonts.mjs" "$INTAKE_ROOT/soundfonts/Famicom-Multichip-Chiptune" \
    --root "$FACTORY_ROOT" \
    --folder "Chiptune" \
    --license "CC0" \
    --url "TODO_REPLACE_WITH_SOURCE_URL"

  node "$REPO_ROOT/scripts/import-soundfonts.mjs" "$INTAKE_ROOT/soundfonts/VintageDreamsWaves" \
    --root "$FACTORY_ROOT" \
    --folder "Synth" \
    --license "CC-BY" \
    --url "TODO_REPLACE_WITH_SOURCE_URL"

  node "$REPO_ROOT/scripts/import-samples.mjs" "$INTAKE_ROOT/samples/Impulse-Responses" --root "$FACTORY_ROOT" --folder "Impulse Responses/AdventureKid"
  node "$REPO_ROOT/scripts/import-samples.mjs" "$INTAKE_ROOT/samples/Keys" --root "$FACTORY_ROOT" --folder "Keys/UIowa"
  node "$REPO_ROOT/scripts/import-samples.mjs" "$INTAKE_ROOT/samples/Drums" --root "$FACTORY_ROOT" --folder "Drums"
  node "$REPO_ROOT/scripts/import-samples.mjs" "$INTAKE_ROOT/samples/One-Shots" --root "$FACTORY_ROOT" --folder "One-Shots"
  node "$REPO_ROOT/scripts/import-samples.mjs" "$INTAKE_ROOT/samples/Loops" --root "$FACTORY_ROOT" --folder "Loops"
  node "$REPO_ROOT/scripts/import-samples.mjs" "$INTAKE_ROOT/samples/Bass" --root "$FACTORY_ROOT" --folder "Bass"
  node "$REPO_ROOT/scripts/import-samples.mjs" "$INTAKE_ROOT/samples/Synth" --root "$FACTORY_ROOT" --folder "Synth"
  node "$REPO_ROOT/scripts/import-samples.mjs" "$INTAKE_ROOT/samples/Guitar" --root "$FACTORY_ROOT" --folder "Guitar"
  node "$REPO_ROOT/scripts/import-samples.mjs" "$INTAKE_ROOT/samples/Foley" --root "$FACTORY_ROOT" --folder "Foley"
  node "$REPO_ROOT/scripts/import-samples.mjs" "$INTAKE_ROOT/samples/Vocals" --root "$FACTORY_ROOT" --folder "Vocals"
fi

# SFZ libraries are preserved as multi-sample instrument bundles under
# /data/factory/sfz.  Do this after staging so every definition is validated and
# all referenced WAV files are copied into the factory volume.
if [[ "$RUN_SFZ_IMPORTS" == "1" ]]; then
  require_tool node
  if [[ -d "$INTAKE_ROOT/sfz/VCSL" ]]; then
    node "$REPO_ROOT/scripts/import-sfz-instruments.mjs" "$INTAKE_ROOT/sfz/VCSL" \
      --root "$FACTORY_ROOT" --library "VCSL" --license "CC0-1.0" \
      --url "https://github.com/sgossner/VCSL/tree/sfz"
  else
    echo "skip VCSL SFZ import, source not staged"
  fi
  if [[ -d "$INTAKE_ROOT/sfz/VSCO-2-CE" ]]; then
    node "$REPO_ROOT/scripts/import-sfz-instruments.mjs" "$INTAKE_ROOT/sfz/VSCO-2-CE" \
      --root "$FACTORY_ROOT" --library "VSCO 2 CE" --license "CC0-1.0" \
      --url "https://github.com/sgossner/VSCO-2-CE/releases/tag/1.1.0"
  else
    echo "skip VSCO 2 CE SFZ import, source not staged"
  fi
fi

FACTORY_ROOT="$FACTORY_ROOT" node <<'NODE'
const {readFileSync, existsSync} = require("node:fs")
const {join} = require("node:path")
const root = process.env.FACTORY_ROOT
const required = [
  "9575028c-7a1f-489f-9770-fccc8cff2734",
  "f7bf84f9-2ae8-4b5f-9650-97e69aff7e4b",
  "f51ed198-f47a-4253-b765-888e0c8d16e6",
  "0ab1a85f-1d07-4a24-8418-ab5a6b6e3490"
]
function readJson(path) { return JSON.parse(readFileSync(path, "utf8")) }
function collect(folder, key, entries = []) {
  if (Array.isArray(folder[key])) entries.push(...folder[key])
  if (Array.isArray(folder.folders)) folder.folders.forEach(child => collect(child, key, entries))
  return entries
}
function presetsFrom(data) { return Array.isArray(data) ? data : (data.presets || []) }
const samples = collect({folders: readJson(join(root, "samples/index.json")).folders}, "samples")
const soundfonts = collect({folders: readJson(join(root, "soundfonts/index.json")).folders}, "soundfonts")
const sfz = existsSync(join(root, "sfz/index.json"))
  ? collect({folders: readJson(join(root, "sfz/index.json")).folders}, "instruments") : []
const presets = presetsFrom(readJson(join(root, "presets/index.json")))
const demos = readJson(join(root, "demos/projects.json")).tracks || []
const all = new Map([...samples, ...soundfonts, ...presets].map(entry => [entry.uuid, entry]))
console.log(JSON.stringify({
  samples: samples.length,
  soundfonts: soundfonts.length,
  sfzInstruments: sfz.length,
  presets: presets.length,
  demos: demos.length,
  requiredMissing: required.filter(uuid => !all.has(uuid)),
  sampleFilesMissing: samples.filter(entry => !existsSync(join(root, "samples", entry.uuid))).length,
  soundfontFilesMissing: soundfonts.filter(entry => !existsSync(join(root, "soundfonts", entry.uuid))).length
}, null, 2))
NODE

echo "== ingest complete $(date -Is) =="
