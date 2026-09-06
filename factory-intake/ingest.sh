#!/usr/bin/env bash
set -euo pipefail

INTAKE="/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory-intake"
LOG="/var/log/opendaw-ingest.log"

mkdir -p "$INTAKE"/{samples/{Bass,Drums,Foley,Guitar,"Impulse-Responses",Keys,Loops,"One-Shots",Synth,Vocals},soundfonts}
mkdir -p "$(dirname "$LOG")"

log() {
  echo "[$(date -Iseconds)] $*" | tee -a "$LOG"
}

log "Starting ingest"

# Example ingest commands - replace with real sources
# SoundFonts
# rsync -av --checksum /mnt/media/SoundFonts/GeneralUser-GS/ "$INTAKE/soundfonts/GeneralUser-GS/"
# rsync -av --checksum /mnt/media/SoundFonts/FreePats-GM-Orchestral/ "$INTAKE/soundfonts/FreePats-GM-Orchestral/"

# Samples
# rsync -av --checksum /mnt/media/Samples/Drums/ "$INTAKE/samples/Drums/"
# rsync -av --checksum /mnt/media/Samples/Impulse-Responses/ "$INTAKE/samples/Impulse-Responses/"

log "Ingest complete"
log "Run import batch: node /path/to/openDAW/scripts/import-soundfonts.mjs ..."
