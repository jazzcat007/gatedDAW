# Backup and restore (F05)

Status (2026-09-14): cron installed and a restore drill run on the production OMV host — see
"Production drill log" below for what was and wasn't actually verified. Still open: `factory` is
deliberately excluded (see below), off-host replication isn't configured, and the drill ran
against a near-empty instance (little project/room data existed yet to restore), so byte-level
restore fidelity for real project/room content is still unproven. See "What's still needed."

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
pack installer against the same source packs). **In production, the host operator has deliberately
excluded it from the daily backup**: it's reproducible RAID-backed content and a same-host archive
of it wouldn't materially improve recovery, so `deploy/backup.sh` runs there with only `server`,
`projects`, and `rooms`. That's a reasonable operational call for this host — the scripts still
support backing up `factory` too (it's in the default component list) if that judgment ever
changes, e.g. before moving to a host without the same RAID guarantee.

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

Per this repo's deployment model (see agent memory `hosted-opendaw-deployment` — the OMV host is
managed by its own Codex agent session with direct filesystem access there; it is not reachable
from this repo's GitHub Actions, unlike the separate `yjs-server` host that
`deploy-yjs.yml`/`restart-yjs.yml` do reach over SSH), scheduling happens **on the OMV host
itself**, as part of the usual GitHub-mediated handoff. Recommended cron entry, matching what's
actually running in production (see drill log below), excluding `factory`:

```cron
# /etc/cron.d/opendaw-backup — daily at 03:00, host-local time
0 3 * * * root DATA_ROOT=/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw COMPONENTS="server projects rooms" /root/opendaw/deploy/backup.sh >> /var/log/opendaw-backup.log 2>&1
```

Wire log failures into whatever alerting the host already has (or at minimum, `grep -q ERROR
/var/log/opendaw-backup.log` in a periodic check) — a cron job that silently stops running is the
same failure mode this finding exists to close.

**Gotcha this repo hit once:** `core.filemode=false` in this repo means a local `chmod +x` before
`git commit` does not reach the git index on some checkouts, so a freshly cloned `deploy/backup.sh`
can silently lack the executable bit even though it looks executable in your working copy. Verify
with `git ls-files -s deploy/backup.sh` (want `100755`, not `100644`) before wiring it into cron —
fixed here via `git update-index --chmod=+x`, but re-check after any future edit to these scripts.

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

## Production drill log

**2026-09-14, OMV host, run by the host operator's Codex agent session.** Cron installed
(`server`, `projects`, `rooms`; `factory` excluded per the operator's judgment above). At drill
time a private script at `/root/opendaw-ops/backup.sh` was used instead of this repo's
`deploy/backup.sh`, because the committed scripts had shipped without the executable bit (see the
filemode gotcha above, now fixed) — the drill itself still validates the same backup/restore
contract (tar + sha256 + isolated-directory restore), just not this exact file.

| Check | Result |
| --- | --- |
| Backup run | Passed, ~3s |
| SHA-256 verification | Passed |
| Restore to isolated directory | Passed, ~1s |
| Isolated container startup + HTTP health | Passed (200) |
| Restored `users.json` | Present, accepted at startup |
| `projects`/`rooms` byte comparison | Passed, but production had ~no project metadata or `.ydoc` files yet at drill time — this confirms the mechanism, not restore fidelity for real project/room content |
| Login with `.env` credentials against the restored instance | 401 — expected, those credentials don't match the actual persisted admin account; confirms access control was still correctly enforced post-restore, not a failure |

Net: the backup/restore *mechanism* is proven end-to-end in production. Re-run this drill once
real project and Live Room data exists, to confirm byte-level fidelity on content that actually
matters, and switch the cron entry to `deploy/backup.sh` now that its executable bit is fixed
(or keep the private script if there's a reason preferred — either satisfies this finding as long
as it's tar+checksum+retention and it's what's actually scheduled).

## Ownership and review cadence

Per the audit's documentation-maintenance schedule: assign an owner for this doc and the cron
job, and re-run the restore drill (or at least dry-run `deploy/restore.sh` against the latest
real backup into a scratch directory) before each release candidate, and after any incident that
touched persistence.

## What's still needed

1. Re-run the restore drill once real project/Live Room content exists in production, to prove
   byte-level fidelity on data that actually matters (see drill log above).
2. Decide on and configure off-host replication (not yet set up).
3. Optionally: switch the production cron entry to this repo's `deploy/backup.sh` now that its
   executable bit is fixed, if the private `/root/opendaw-ops/backup.sh` script was only a
   workaround for that bug rather than a deliberate preference.
