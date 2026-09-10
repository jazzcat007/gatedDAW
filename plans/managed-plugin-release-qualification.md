# Managed plug-in release qualification

## Purpose

A plug-in is eligible for the openDAW registry only when a collaborator can
open, hear, and export every project that uses it on Windows, macOS, Linux, or
the web. This is a release gate for **each immutable plug-in package version**;
it is not a one-time certification of a vendor or plug-in name.

Native VST3 binaries are platform-specific. Therefore, a native plug-in is
never the only playable representation of a shared project. Every registry
release must contain either a browser-safe implementation or a canonical,
version-pinned render fallback. The fallback is used by the web client and by a
desktop client that cannot run the exact approved package.

## Roles and permissions

| Role               | May do                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Contributor        | Submit a package and its provenance for review. Cannot publish it or make a project depend on it. |
| Plug-in reviewer   | Run qualification, inspect the evidence, and approve/reject a package.                            |
| Registry publisher | Sign and publish an approved immutable package.                                                   |
| Client             | Download only a signed, approved platform variant after verifying its hash.                       |

Submissions are quarantined. No user-uploaded native binary may run in the
web app, the storage server, CI's main process, or a developer's normal login
session merely because it was uploaded.

## Package contract

The registry assigns `pluginId@version+contentHash`. A release record must
include:

- vendor, licence, source URL, redistribution permission, and reviewer;
- VST3 identity, supported channel layouts, parameter/state schema version,
  reported latency, and whether it is an effect or instrument;
- a SHA-256 hash and code-signing/provenance result for every supplied target:
  `windows-x64`, `macos-arm64`, `macos-x64`, `linux-x64` (or an explicit
  unsupported result);
- the browser implementation hash, if one exists;
- a content-addressed canonical render fallback and the qualification project
  used to create it; and
- the test report, logs, crash reports, and generated render hashes.

The server may retain binary artifacts only when the vendor's licence permits
redistribution. For commercial plug-ins that do not permit it, the registry
stores the approved identity and hashes but clients obtain/licence the binary
through the vendor; the project still requires the canonical fallback.

## Required test fixture

`plugin-qualification.od` is a versioned, deterministic fixture created for
each release. It has a 48 kHz, 24-bit, stereo render and covers:

1. silence, impulse, low and high-level audio (effects);
2. notes, velocity, sustain, pitch bend and MIDI panic (instruments);
3. discrete and continuous parameter automation, including a change at a
   render-block boundary;
4. transport start/stop/seek, bypass, and reported-latency compensation;
5. save/reload of the exact plug-in state plus undo/redo; and
6. the project's web/unsupported-client fallback path.

The fixture, state chunk, expected duration, and expected render comparison
are stored beside the package evidence. It may contain only assets openDAW is
allowed to distribute.

## Qualification workflow

```text
submit -> quarantine -> static checks -> isolated host smoke test
       -> Windows/macOS/Linux render matrix -> fallback and missing-device test
       -> reviewer approval -> signed immutable registry publication
```

### 1. Static checks

The intake service verifies the package manifest, supplied file hashes, target
names, VST3 class identity, licence/provenance metadata, and an exact release
version. A duplicate `(pluginId, version, contentHash)` is rejected. A new
binary requires a new version; it may not overwrite a published artifact.

### 2. Isolated host smoke test

Each native variant runs in a disposable, non-privileged worker/VM with no
registry credentials and no access to project storage. The host must discover,
instantiate, activate, process the fixture, receive MIDI where applicable,
save/load state, and exit cleanly. Timeouts, crashes, excessive memory use,
or audio-thread violations fail the release.

This is also the required execution model for future server-side rendering;
the storage server must never host third-party DSP in-process.

### 3. Desktop matrix

The same pinned host version and fixture run on real GitHub-hosted or
self-hosted runners for each supported target. A qualifying release cannot
claim a target that was not tested.

| Target                 | Required checks                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows x64            | Discovery, plug-in signature/provenance result, live smoke test, offline fixture render, state round-trip.                                   |
| macOS arm64 and/or x64 | Bundle/signature result, hardened host smoke test, offline fixture render, state round-trip. Test each architecture claimed in the manifest. |
| Linux x64              | Discovery, shared-library dependencies, live smoke test, offline fixture render, state round-trip.                                           |
| Web                    | Verify that native execution is unavailable and that the fallback plays, remains aligned, and labels the device as read-only.                |

#### Initial runner fleet

The available hardware supports the first iteration of this matrix without
buying more machines:

| Machine                | Qualification role                                                                                                           | Important limit                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows development PC | Native Windows x64 host and render gate.                                                                                     | Must run outside WSL.                                                                                                                                     |
| WSL on the Windows PC  | Fast Linux x64 preflight for dependency, discovery, state, and offline-render checks.                                        | It is not evidence that the Linux desktop app/WebKitGTK integration works; a real Linux desktop runner is required before claiming Linux desktop support. |
| Mac mini               | Protected macOS host and render gate. Record `uname -m`, macOS version, and code-signing/notarization result with every run. | Qualifies only the architecture actually tested.                                                                                                          |
| MacBook                | A second clean macOS host, used to repeat the fixture and fallback test after the Mac mini passes.                           | It is independent-device coverage, not a substitute for a different CPU architecture.                                                                     |

At intake, the runner records its OS version, CPU architecture, host build,
plug-in hash, and fixture hash. The manifest may claim only architectures with
a green native run. For example, an Apple Silicon machine qualifies
`macos-arm64`; Rosetta execution is useful diagnostics but does not qualify a
native `macos-x64` build. The same rule applies if either Mac is Intel.

For every desktop run, retain a WAV/FLAC render, structured report, host and
plug-in logs, and the package/host hashes. Compare audio against the approved
reference using a documented tolerance. Exact sample equality is preferred;
where platform math makes it impossible, record peak/RMS error limits and
review audible differences. A changed approved render needs a new package
version and new fallback.

### 4. Collaboration compatibility test

Create a shared project using the plug-in and exercise these clients:

- a desktop client with the approved local target;
- a desktop client where the target is deliberately unavailable; and
- a browser client.

All clients must open the project without data loss and hear an aligned result.
Only the first may edit the live native device. Unsupported clients must use
the canonical fallback, preserve the original plug-in state untouched, and
show the compatibility reason. Saving from an unsupported client must not
erase or replace the native state.

### 5. Approval and publication

Two reviewers approve the evidence for a new vendor; one reviewer may approve
an update to an already approved vendor. The publisher signs the manifest and
uploads artifacts, fallback, fixture, and report under their hashes. The
registry then marks the version `approved`. Projects may reference only that
state, never `draft`, `quarantined`, or `rejected` packages.

## CI implementation gate

When the managed host exists, the repository workflow must provide a manually
triggered `qualify-plugin` job with a package ID/version input and separate
Windows, macOS, and Linux jobs. It must:

1. download the immutable quarantined artifact and verify its SHA-256;
2. run the isolated host runner with the fixture;
3. upload render, report, and diagnostic artifacts even on failure;
4. run the missing-device/browser-fallback integration test; and
5. block publication until every target declared by the manifest is green and
   an authorized reviewer has approved the report.

The core host protocol and render-comparison code must be unit-tested on every
pull request. Native plug-in execution belongs only in the protected,
manually-triggered qualification workflow, never in untrusted pull-request CI.

## Explicit non-goals

- A private, arbitrary local VST is not a collaborative plug-in.
- Passing on one OS does not imply support on another OS.
- A native VST3 cannot be loaded by the browser just because its package is on
  the server.
- This workflow does not bypass vendor licences, activation, notarization, or
  redistribution restrictions.

## Definition of done for the first release

The first registry plug-in is an open-source VST3 with Windows, macOS, and
Linux builds and a redistribution-compatible licence. It passes every matrix
row above, has a signed immutable manifest and canonical fallback, and can be
opened by a clean web client and three clean desktop installations. Until that
is demonstrated, the registry UI remains disabled for shared projects.
