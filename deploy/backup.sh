#!/bin/bash
# deploy/backup.sh
#
# Backs up the durable openDAW self-hosted data directories (server, projects, rooms,
# factory — see docker-compose.yml) into timestamped, checksummed, compressed archives,
# with simple age-based retention. Designed to run on the host that owns /data (the OMV
# server), either manually, via cron, or via .github/workflows/backup.yml over SSH.
#
# See docs/backup-restore.md for the restore path and drill procedure (F05).
#
# Usage:
#   ./backup.sh
#
# Env (all optional, defaults match docker-compose.yml's host-side paths):
#   DATA_ROOT       parent directory containing server/ projects/ rooms/ factory/
#   BACKUP_DEST     where archives are written (default: $DATA_ROOT/backups)
#   RETENTION_DAYS  delete archives older than this many days (default: 14)
set -euo pipefail

DATA_ROOT="${DATA_ROOT:-/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw}"
BACKUP_DEST="${BACKUP_DEST:-$DATA_ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DEST"

failures=0
for component in server projects rooms factory; do
  src="$DATA_ROOT/$component"
  if [ ! -d "$src" ]; then
    echo "WARN: $src does not exist, skipping" >&2
    continue
  fi

  archive="$BACKUP_DEST/${component}-${STAMP}.tar.gz"
  tmp_archive="$archive.partial"
  echo "Backing up $src -> $archive"

  if tar -C "$DATA_ROOT" -czf "$tmp_archive" "$component"; then
    mv "$tmp_archive" "$archive"
    (cd "$BACKUP_DEST" && sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256")
    echo "OK: $archive ($(du -h "$archive" | cut -f1))"
  else
    echo "ERROR: backup of $component failed" >&2
    rm -f "$tmp_archive"
    failures=$((failures + 1))
  fi
done

echo "Pruning archives older than ${RETENTION_DAYS}d in $BACKUP_DEST"
find "$BACKUP_DEST" -maxdepth 1 -name '*.tar.gz' -mtime "+$RETENTION_DAYS" -print -delete
find "$BACKUP_DEST" -maxdepth 1 -name '*.tar.gz.sha256' -mtime "+$RETENTION_DAYS" -print -delete

if [ "$failures" -gt 0 ]; then
  echo "Backup run completed with $failures failure(s)" >&2
  exit 1
fi

echo "Backup run $STAMP complete"
