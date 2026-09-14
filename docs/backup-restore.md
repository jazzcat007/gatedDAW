# Backup and restore (F05)

Status: tooling implemented and tested against synthetic data; **not yet scheduled on the
production OMV host** and **no restore drill has been run against real production data**. See
"What's still needed" at the bottom before treating this as a satisfied audit finding.

Companion to `audits/system-audit-and-action-plan-2026-09-14.md` F05, which found that backup
existed only as roadmap intent, with no scheduled job, no integrity verification, and no
demonstrated restore.

## What gets backed up

The four durable areas named in `docker-compose.yml` and read by `docker-server.mjs`:

| Directory (in-container) | Host path (OMV, per `docker-compose.yml`) | Contents |
| --- | --- | --- |
| `/data/server` | `.../appdata/opendaw/server` | `users.json`, `sessions.json`, `invites.json`, `settings.json`, `room-links.json`, `error-reports.json`, `setup-token.json` |
| `/data/projects` | `.../appdata/opendaw/projects` | Every project's `meta.json`, `project.od`, `image.bin`, revisions, trash metadata |
| `/data/rooms` | `.../appdata/opendaw/rooms` | Live Room Yjs documents (`.ydoc` files) |
| `/data/factory` | `.../appdata/opendaw/factory` | Installed factory/SFZ packs and assets |

`factory` is the largest and most reproducible (it can be re-derived by re-running the factory
pack installer against the same source packs), but it's still included since a restore drill
should prove the *whole* instance comes back, not just the irreplaceable parts.

## Tooling

- `deploy/backup.sh` — tars each of the four directories into
  `<BACKUP_DEST>/<component>-<UTC timestamp>.tar.gz`, writes a `.sha256` checksum file next to
  each archive, and prunes archives older than `RETENTION_DAYS` (default 14). Skips a component
  gracefully if its directory doesn't exist (e.g. a `factory`-less dev instance). Exits non-zero
  if any component's backup failed, so a cron/CI wrapper can alert on it.
- `deploy/restore.sh` — verifies each archive's checksum before extracting, refuses to write into
  a non-empty target directory (pass `FORCE=1` to override deliberately), and picks the newest
  archive per component from `BACKUP_DEST` unless you pass specific components.

Both were exercised locally against a synthetic four-directory tree (not real production data):
backup → restore into an empty directory → byte-for-byte `diff -r` against the original was
clean; a non-empty restore target was correctly refused; a deliberately corrupted archive was
correctly rejected by the checksum check before extraction.

### Manual run

```bash
# On the host that owns /data (the OMV server):
DATA_ROOT=/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw \
  ./deploy/backup.sh
```

### Restore drill (into an isolated directory — never straight into live `/data`)

```bash
DRILL_DIR=/srv/.../opendaw/restore-drill-$(date -u +%Y%m%d)
./deploy/restore.sh /srv/.../opendaw/backups "$DRILL_DIR"
```

Then point an **isolated** `docker-compose` instance (different container name/ports, e.g. copy
`docker-compose.yml` and change `container_name`, `ports`, and the four volume sources to
`$DRILL_DIR/{server,projects,rooms,factory}`) at the restored directories and verify:

- [ ] Container starts and reports healthy
- [ ] Existing users can log in (or, if `users.json` didn't restore, the F02 setup-token flow
      correctly starts fresh — either is a valid outcome, silent admin bypass is not)
- [ ] Project list loads; a known project opens and its content matches what was expected
- [ ] Membership/sharing on a shared project is intact
- [ ] A Live Room with prior history reopens with that history
- [ ] Factory/SFZ assets are present and browsable
- [ ] Record wall-clock duration of backup and of restore-to-verified, and any warnings printed

Tear down the drill container/volumes afterward; don't leave a second copy of production data
sitting around indefinitely.

## Scheduling

**This has not been scheduled anywhere yet.** Per this repo's deployment model (see agent memory
`hosted-opendaw-deployment` — the OMV host is managed by its own Codex agent session with direct
filesystem access there; it is not reachable from this repo's GitHub Actions, unlike the separate
`yjs-server` host that `deploy-yjs.yml`/`restart-yjs.yml` do reach over SSH). Scheduling therefore
has to happen **on the OMV host itself**, as part of the usual GitHub-mediated handoff: merge this
change, then on the host add a cron entry, e.g.:

```cron
# /etc/cron.d/opendaw-backup — daily at 03:00, host-local time
0 3 * * * root DATA_ROOT=/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw /root/opendaw/deploy/backup.sh >> /var/log/opendaw-backup.log 2>&1
```

Wire log failures into whatever alerting the host already has (or at minimum, `grep -q ERROR
/var/log/opendaw-backup.log` in a periodic check) — a cron job that silently stops running is the
same failure mode this finding exists to close.

Off-host replication (the archives above are backups against corruption/bad-deploy/bug, not
against losing the whole disk/host) is **not yet set up** — that needs a destination (another
host, object storage, etc.) and credentials the host operator has to choose; `rsync`/`rclone` the
contents of `BACKUP_DEST` there once one exists.

## RPO / RTO (proposed — needs owner sign-off)

No business requirement was specified, so these are engineering defaults, not commitments:

- **RPO (Recovery Point Objective): 24 hours** — matches the proposed daily cron cadence. Tighten
  to hourly for `/data/server` (small, cheap to back up more often) if session/membership churn
  makes a day of loss unacceptable.
- **RTO (Recovery Time Objective): not yet measured.** Fill in from the first real restore drill's
  recorded duration above, then set a target and re-drill periodically against it.

## Ownership and review cadence

Per the audit's documentation-maintenance schedule: assign an owner for this doc and the cron
job, and re-run the restore drill (or at least dry-run `deploy/restore.sh` against the latest
real backup into a scratch directory) before each release candidate, and after any incident that
touched persistence.

## What's still needed

This PR ships tested tooling and a runbook. It does **not** satisfy F05's acceptance criterion by
itself — that requires someone with OMV host access to:

1. Install the cron entry above (or equivalent).
2. Let it run for real, then execute the restore drill checklist above against an actual
   production backup, and record the results here (duration, warnings, checklist outcome, date).
3. Decide on and configure off-host replication.
