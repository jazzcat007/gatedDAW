#!/bin/bash
# deploy/restore.sh
#
# Restores backup archives produced by deploy/backup.sh into a target directory.
# Verifies each archive's sha256 checksum before extracting. Refuses to write into a
# non-empty target directory unless FORCE=1, so this can never silently clobber live
# /data by accident — always restore into an empty/isolated directory (see
# docs/backup-restore.md for the full drill procedure) and swap it in deliberately.
#
# Usage:
#   ./restore.sh <backup-dest-dir> <restore-target-dir> [component...]
#   component defaults to: server projects rooms factory
#
# Example (restore everything from the latest backups into an isolated drill directory):
#   ./restore.sh /srv/.../opendaw/backups /srv/.../opendaw/restore-drill
set -euo pipefail

BACKUP_DEST="${1:?Usage: restore.sh <backup-dest-dir> <restore-target-dir> [component...]}"
TARGET="${2:?Usage: restore.sh <backup-dest-dir> <restore-target-dir> [component...]}"
shift 2
if [ "$#" -gt 0 ]; then
  COMPONENTS=("$@")
else
  COMPONENTS=(server projects rooms factory)
fi

if [ -d "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null)" ] && [ "${FORCE:-0}" != "1" ]; then
  echo "ERROR: $TARGET already exists and is not empty. Refusing to restore into it." >&2
  echo "Pass FORCE=1 to override, or pick an empty target directory (recommended: an isolated drill path, not live /data)." >&2
  exit 1
fi
mkdir -p "$TARGET"

failures=0
for component in "${COMPONENTS[@]}"; do
  # Pick the newest archive for this component.
  archive="$(ls -1t "$BACKUP_DEST/${component}-"*.tar.gz 2>/dev/null | head -n1 || true)"
  if [ -z "$archive" ]; then
    echo "ERROR: no backup archive found for '$component' in $BACKUP_DEST" >&2
    failures=$((failures + 1))
    continue
  fi

  checksum_file="$archive.sha256"
  if [ ! -f "$checksum_file" ]; then
    echo "ERROR: $checksum_file missing, refusing to restore unverified archive $archive" >&2
    failures=$((failures + 1))
    continue
  fi

  echo "Verifying $archive"
  if ! (cd "$(dirname "$archive")" && sha256sum -c "$(basename "$checksum_file")"); then
    echo "ERROR: checksum mismatch for $archive — do not trust this backup" >&2
    failures=$((failures + 1))
    continue
  fi

  echo "Restoring $component from $archive -> $TARGET"
  tar -C "$TARGET" -xzf "$archive"
done

if [ "$failures" -gt 0 ]; then
  echo "Restore completed with $failures failure(s)" >&2
  exit 1
fi

echo "Restore complete into $TARGET"
echo "Next: point a docker-compose instance's volumes at $TARGET/{server,projects,rooms,factory} and verify (see docs/backup-restore.md)."
