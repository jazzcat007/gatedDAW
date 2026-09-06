# OMV Factory Asset Verification

Date: 2026-09-06
Host branch: `screwpulp/self-hosted`
Factory root on host: `/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory`
Factory root in container: `/data/factory`

## Mount And Space

```text
TARGET                                                     SOURCE    FSTYPE OPTIONS
/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76 /dev/sdb1 xfs    ro,nosuid,nodev,relatime,attr2,inode64,logbufs=8,logbsize=32k,usrquota,grpquota
```

```text
Filesystem Type Size Used Avail Use% Mounted on
/dev/sdb1  xfs   17T 1.3T 16T   8%   /srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76
```

Note: `findmnt` reports the underlying OMV mount as `ro`. The running Docker container reports the bind mounts as `rw`.

## Docker Mounts And Environment

```text
/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/factory -> /data/factory rw
/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/server -> /data/server rw
/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/projects -> /data/projects rw
/srv/dev-disk-by-uuid-43c0d683-376c-4b42-a6df-64a09c625b76/appdata/opendaw/rooms -> /data/rooms rw
```

Environment:

```text
FACTORY_ASSET_ROOT=/data/factory
OPENDAW_FACTORY_OFFLINE_ONLY=true
OPENDAW_PROJECT_ROOT=/data/projects
OPENDAW_ROOM_ROOT=/data/rooms
OPENDAW_SERVER_ROOT=/data/server
```

The brief path `appdata/opdata/opendaw/projects` does not exist on this host. The active Docker mount uses `appdata/opendaw/projects`.

## Required Paths

Host paths verified:

```text
factory exists
server exists
projects exists
rooms exists
```

Container paths verified:

```text
/data/factory exists
/data/server exists
/data/projects exists
/data/rooms exists
```

Disk usage:

```text
3.7G  factory
12K   server
14M   projects
0     rooms
```

## Factory Tree

Top-level structure:

```text
factory
factory/demos
factory/ffmpeg-core
factory/ffmpeg-core/0.12.6
factory/models
factory/models/basic-pitch
factory/models/htdemucs
factory/models/htdemucs-jx
factory/models/tempo-cnn
factory/presets
factory/samples
factory/soundfonts
```

Demo bundle directories present: 19.

## Catalog Files

All expected catalog files exist and parse as valid JSON:

```text
samples/index.json valid
soundfonts/index.json valid
presets/index.json valid
demos/projects.json valid
```

Counts:

```text
samples:    902 entries, 0 missing referenced files
soundfonts: 7 entries,   0 missing referenced files
presets:    49 entries
demos:      19 tracks,   0 missing bundle directories
```

SoundFonts currently staged include permissively licensed entries such as:

```text
Concert Harp                         Creative Commons CC0 public domain
Drawbar organ emulation              Creative Commons CC0 1.0
Spanish classical guitar             CC0 1.0 Universal
Upright Piano KW                     CC0 1.0 Universal
Xylophone (medium mallets)           Creative Commons CC0 public domain
```

One indexed SF2 entry reports `license: "Unavailable"`:

```text
HS TB-303
```

## Import/Staging Notes

No new sample or SF2 staging batch was found on OMV during this verification.

Repo-local intake currently contains preset intake material only:

```text
/root/opendaw/factory-intake/presets
```

Per the operating brief, upstream imports should be performed on a dev machine with Node, ffmpeg, and upstream access, then rsynced to the OMV factory volume. No OMV compose changes were made.

## Result

Offline-only production mode is active:

```text
OPENDAW_FACTORY_OFFLINE_ONLY=true
```

Factory catalogs are present, valid, and non-empty for samples, soundfonts, presets, and demos. No missing referenced sample, soundfont, or demo bundle files were found by this audit.
