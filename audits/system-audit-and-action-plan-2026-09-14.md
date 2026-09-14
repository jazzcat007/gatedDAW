# System audit and consolidated action plan

Date: 2026-09-14

Audit snapshot: local integration commit `26af9e227`, reconciled with `origin/screwpulp/self-hosted` at `9c0676af5`

Scope: application, Rust/WASM engine, self-hosted server, persistence, authentication, collaboration, build/test/CI, dependencies, deployment files, issue plans, and product roadmaps.

## Executive decision

openDAW/gatedDAW has a strong audio-engine core and a better-than-average body of low-level regression tests. The largest risks are now outside the DSP engine: the self-hosted server can lose or hide durable state after an interrupted write, concurrent saves silently overwrite one another, a newly exposed instance can let the first visitor claim the administrator account, and no pull-request workflow runs the repository's tests or lint checks.

The next release cycle should therefore be a reliability cycle. Do not start another large architecture program until persistence is atomic, backup restore has been demonstrated, concurrent saves are conflict-safe, and CI is required. After that, finish project history and DAWproject fidelity, close the best-understood editor bugs, and complete the already-started SFZ/factory-pack and visual-brand work. Euclid is already integrated and must not be planned as a new device again.

Overall assessment: **promising product, mature engine, pre-production server discipline**.

| Area | Rating | Assessment |
| --- | --- | --- |
| Audio engine and DSP | Strong | Rust/WASM architecture, parity tests, performance probes, and real-time constraints are treated seriously. |
| Editor correctness | Mixed | Broad functionality and many tests, but a known bug tail and several deliberately disabled code paths remain. |
| Server/data safety | High risk | Direct non-atomic writes, silent corrupt-file fallbacks, last-writer-wins saves, and no proven restore drill. |
| Security | High risk at first boot; moderate afterward | Sessions, scrypt hashes, CSRF marker, membership checks, and rate limiting exist; initial admin claiming and single-threaded password work need hardening. |
| Performance | Good engine focus; server headroom left | The largest immediately actionable stalls are synchronous server I/O, whole-file buffering, recursive scans, and synchronous scrypt. |
| Test and release process | High risk | 251 test files exist, but there is no PR CI and this checkout cannot execute the normal JS verification path. |
| Code maintainability | Mixed | Clear package boundaries in the engine; the 1,777-line server and several very large modules concentrate responsibilities. |
| Roadmap quality | Rich but inconsistent | Plans contain strong technical analysis, but completed work and current priorities are duplicated or stale across documents. |

## Evidence and verification

This was a static repository audit plus the verification commands that the local environment could support.

- Inventory: 29 workspace packages, approximately 1,822 TypeScript/TSX files, 299 Rust files, 251 test files, and 51 `TODO`/`FIXME`/`HACK` markers in runtime source.
- JavaScript syntax: `node --check docker-server.mjs` passed.
- JavaScript lint/tests/build: not runnable from this checkout. `npm run lint` fails because the Turbo executable link is missing; invoking Turbo directly fails with `spawn EFTYPE`; Vitest's package entry is incomplete. The installed Node is `22.17.1`, while the repository declares Node `>=23`.
- Rust tests: `cargo test --workspace` from `crates/` compiled a substantial part of the workspace, then failed building `signalsmith-stretch` because `libclang` is unavailable. This is an environment failure, not a passing or failing test result.
- Dependency audit: `npm audit --omit=dev` reports 2 moderate production advisories (`monaco-editor`/`dompurify`). The full audit reports 31 findings: 2 critical, 21 high, and 8 moderate, predominantly in development/publishing tooling. Exploitability was not established; triage is required rather than a blind force-upgrade.
- CI review: existing workflows are deployment, Discord, restart, and SFTP workflows. None run on `pull_request`; none run the repository test or lint commands.
- Deployment/runtime host, production data, reverse proxy, backups, and secret stores were not accessible and were not tested.

The working branch includes unpublished integration commits beyond the shared base. Findings distinguish current source behavior from runtime claims; deployment status must be verified on the OMV host separately.

## Findings register

### P0 — release blockers

#### F01. Durable state is not written atomically and corruption fails open or disappears

`docker-server.mjs` writes users, invites, sessions, settings, error reports, room links, trash metadata, project metadata, project bytes, covers, and room documents directly to their final paths. Representative calls are in `persistUsers`, `persistInvites`, `persistSessions`, `writeProjectTrash`, the project `PUT /file` route, and the Yjs persistence provider.

`readJson` catches parse failures and returns a benign fallback. This compounds the write risk:

- corrupt `users.json` becomes an empty user list and re-enables first-run setup;
- corrupt project metadata makes a project appear missing or unauthorized;
- corrupt trash/room-link/settings files silently change behavior;
- later writes can replace the damaged file, destroying forensic/recovery evidence.

Required fix: one versioned persistence layer using write-to-sibling-temp, flush/fsync where supported, atomic rename, directory sync where supported, serialized per-record updates, startup validation, and `.bak` recovery. Security-critical file corruption must fail closed and produce a loud health error; it must never become an empty default.

Acceptance: kill the server at every write stage in a fault-injection test; after restart, every record is either the old complete value or the new complete value. A corrupt users file cannot expose setup or erase the last administrator.

#### F02. First-boot administrator claiming is unsafe when the instance is exposed before setup

Projects, Admin APIs, and Live Rooms correctly require app sessions. The earlier draft's claim that all authentication is disabled with empty Basic Auth variables was too broad. The actual risk is more specific and more actionable:

- Compose defaults `OPENDAW_AUTH_USERNAME` and `OPENDAW_AUTH_PASSWORD` to empty;
- outer Basic Auth is consequently disabled;
- when `users.json` is absent or parses as empty, unauthenticated `POST /api/auth/setup` creates the first administrator.

If a port or reverse-proxy route becomes reachable before the intended owner completes setup, the first visitor can take ownership. F01 can recreate this state after corruption.

Required fix: require an explicit one-time setup token, console-generated bootstrap secret, or loopback/private-setup mode. In production mode, refuse startup when there are no users and no protected bootstrap mechanism. Keep a deliberately named development bypass.

Acceptance: a clean production volume exposed to an untrusted client cannot create an administrator without a server-side secret. The setup mechanism expires after first use.

#### F03. No pull-request quality gate exists

The repository has 251 test files, but no workflow is triggered by `pull_request`, and no workflow runs `npm test` or `npm run lint`. Deployment builds are not a substitute for review-time regression detection. Current integration branches can merge code that has never passed the full suite in a reproducible environment.

Required fix: add required CI for clean install, generated-code consistency, TypeScript build/type-check, lint, unit tests, Rust format/clippy/tests, and a focused self-hosted server integration suite. Split expensive WASM/browser jobs if necessary, but keep a fast required lane under roughly 10 minutes.

Acceptance: branch protection requires the fast lane; a deliberately failing TS test, Rust test, lint rule, or generated schema check blocks a PR.

#### F04. Project saves are last-writer-wins with no concurrency contract

The project API has membership authorization but no `ETag`, generation number, `If-Match`, lease, or merge check. Two open tabs, a manual save racing a Live Room autosnapshot, or two editor clients can overwrite newer project bytes silently. A revision may preserve the displaced state temporarily, but the 20-entry rolling cap is not a concurrency-control mechanism.

Required fix: add a monotonic project generation/content hash, return it on reads, require it on writes, and answer stale writes with `409 Conflict`. Define one authoritative Live Room snapshot owner/lease on the server, not only in client convention. Provide a user-visible reload/save-copy/compare path.

Acceptance: a test with two clients proves the second stale writer cannot replace the first writer's update. Live autosnapshot cannot overwrite a newer manual restore/save without an explicit resolution.

#### F05. Backup exists as intent, not a demonstrated recovery capability

The roadmap correctly names `/data/server`, `/data/projects`, `/data/rooms`, and `/data/factory` as durable areas, but no tracked scheduled backup, integrity verification, retention implementation, or restore drill proves recovery. Project export is useful but does not recover identities, memberships, sessions, room documents, or factory metadata.

Required fix: document and automate consistent backups, exclude/recreate caches, encrypt off-host copies where appropriate, verify hashes, and run a restore drill into an isolated instance. Define RPO/RTO and ownership.

Acceptance: a fresh instance restored from backup authenticates users, lists and opens projects, preserves memberships/history, loads factory assets, and opens persisted room state. Record duration and any warnings.

### P1 — next-cycle correctness, security, and performance

#### F06. The server's I/O model can stall all users and amplify memory use

The HTTP server is a single Node process. Project bodies default to a 500 MB limit, are accumulated as chunks, copied by `Buffer.concat`, and synchronously written. Downloads synchronously read the entire project/revision into memory before sending. Admin asset summaries recursively `stat` every factory entry synchronously. JSON stores rewrite whole collections. All of this shares the event loop with login, APIs, factory delivery, signaling, and Yjs upgrades.

For a near-limit upload, request assembly alone can transiently retain roughly the chunk storage plus the concatenated buffer before other copies and V8 overhead. Concurrent uploads multiply the pressure. A large factory scan or disk stall pauses unrelated requests.

Required fix: stream uploads into bounded temporary files, hash while streaming, atomically rename, stream downloads, add request timeouts/concurrency limits, move/cached-index directory accounting, and expose event-loop delay plus request latency metrics.

Acceptance: concurrent large save/download/admin-metrics tests stay within a defined RSS ceiling, WebSocket heartbeats remain responsive, and p95 API latency remains inside a recorded budget.

#### F07. Password hashing blocks the event loop and the rate-limit key is easy to fan out

`hashPassword` and `verifyPassword` use `scryptSync`. Login limiting is per `(remoteAddress, username)`, so an attacker can rotate usernames and force repeated synchronous scrypt work. Behind an unconfigured proxy, all users may also appear under one address. The result is a denial-of-service surface even if passwords remain secure.

Required fix: use asynchronous `crypto.scrypt`, cap concurrent password operations, add per-IP and global budgets in addition to per-account limits, define trusted-proxy handling, normalize usernames consistently at login, and test timing under load.

Acceptance: invalid-login load does not block health checks, project reads, or collaboration heartbeats; username casing behaves consistently with case-insensitive uniqueness.

#### F08. DAWproject native-device round trips can lose fidelity

`packages/studio/core/src/dawproject/DawProjectExporter.ts` still contains an unimplemented native-device path, while the roadmap records the importer path as disabled because it can produce an invalid host pointer. An openDAW → DAWproject → openDAW round trip can therefore degrade native devices to unknown effects or omit device state.

Required fix: repair the host/pointer ownership path, enable the importer/exporter together, and add fixtures for every built-in device plus nested/composite cases. Preserve unknown third-party XML for forward compatibility.

Acceptance: native-device type, parameters, routing, and opaque unknown data survive a round trip; loss is surfaced rather than silent.

#### F09. Version history is not a usable recovery feature

The server snapshots the previous project and exposes revision list/download endpoints, but the client has no history browser, preview, author/label metadata, protected checkpoint, or atomic revision-restore endpoint. Routine saves and Live Room autosnapshots consume the same 20-entry cap.

Required fix: add server-side atomic restore with F04 generation checks, labeled checkpoints stored separately from rolling autosaves, author/source metadata, preview, retention policy, and Admin storage visibility.

Acceptance: a user can label, inspect, restore, and undo a restore without a client download/re-upload race; autosaves cannot evict a protected checkpoint.

#### F10. Core self-hosted behavior has almost no integration-test boundary

The factory-pack decision layer has focused tests, but the 1,777-line `docker-server.mjs` has no direct integration suite covering authentication, CSRF, first setup, sessions, project permissions, stale saves, revision retention, room authorization, interrupted writes, or WebSocket upgrades. The current structure is difficult to instantiate without binding the production server.

Required fix: split app construction from `listen`, inject roots/clock/randomness/process runner, and test against temporary directories and real HTTP/WebSocket clients. Add schema validation at every persistence boundary.

Acceptance: the server suite covers all P0 acceptance cases and runs in required PR CI without Docker.

#### F11. Container hardening is incomplete

The runtime image is also the build image, runs as root, contains compilers/toolchains and build caches, and has no container healthcheck. Compose has no read-only root filesystem, dropped capabilities, `no-new-privileges`, or resource ceilings. These are defense-in-depth and operability gaps, not evidence of a current compromise.

Required fix: use a minimal multi-stage runtime image and unprivileged user; add an authenticated-safe readiness/liveness endpoint; use `init`, graceful shutdown, read-only root plus explicit writable mounts, dropped capabilities, and deployment-appropriate limits.

Acceptance: the container runs non-root, reports readiness only after durable stores validate, shuts down after flushing room state, and restarts cleanly under limits.

#### F12. Dependency advisories and update policy need an owned workflow

The production tree currently reports two moderate Monaco/DOMPurify advisories; the complete tree reports 31 advisories, including critical/high findings in development and publishing dependencies. Dev-only findings still matter on CI/release machines, especially tooling that handles archives, packages, and credentials.

Required fix: determine reachability, update Monaco and affected tooling in isolated PRs, run editor/import/build regressions, generate an SBOM, and add scheduled audit/Dependabot-style review with documented exceptions and expiry dates. Do not use `npm audit fix --force` across this monorepo.

Acceptance: no unreviewed critical/high finding remains; every accepted exception states runtime reachability, compensating controls, owner, and review date.

#### F13. Known editor defects need executable reproductions, not only plans or comments

Examples in current source include the permanently hidden multi-connection catcher in `WiringFlyout.tsx`, the modular-camera zoom/undo warning in `Camera.ts`, unresolved catch-up transactions in `adapters/src/modular/modular.ts`, and the panel-system FIXME. The issue-plan index also retains well-understood bugs such as #73 and #79, plus #292 which still needs a live reproduction.

Required fix: select by severity and confidence. First reproduce and lock with a failing test, then fix. Recommended order: data-loss/crash bugs; #79 audio click; #73 wheel zoom; #185 clip view; #275 automation placement after its UX decision; #292 only after reproduction.

Acceptance: each closed item has a regression test or a documented reason automation is impractical, plus a manual matrix when browser/input hardware matters.

### P2 — maintainability and roadmap quality

#### F14. `docker-server.mjs` has become a multi-responsibility subsystem

At 1,777 lines it owns HTTP routing, static serving, upstream proxying, password/session management, error intake, project storage, revisions, memberships, Admin operations, pack jobs, room metadata, Yjs persistence, and signaling. It contains duplicated unreachable `segment === "password"` handling, demonstrating the review cost of the current shape.

Split by behavior, not arbitrary line count: `auth`, `persistence`, `projects`, `rooms`, `assets/jobs`, `errors`, and HTTP composition. Keep a small composition root and avoid a framework rewrite unless the extracted interfaces prove one is useful.

#### F15. Runtime external-service policy is incomplete

Offline factory mode prevents the intended upstream asset fallback, but source still contains the assets proxy plus Dropbox and Google Drive endpoints. Error reports include stack, browser/build data, project UUID, device type, and action. No evidence shows project audio/content is sent, but the privacy contract and redaction tests are not explicit.

Create an allowlist by deployment mode, add a network-deny smoke test for offline mode, document optional cloud integrations, validate error-report redaction, and add retention/deletion controls in Admin.

#### F16. Host-specific paths reduce portability but are not secrets by themselves

The OMV disk UUID and `T:`/`/srv` paths occur in Compose, scripts, manifests, and operational notes. This is configuration debt and public infrastructure metadata, not automatically a credential leak. Move executable defaults to environment/compose overrides; retain sanitized examples and, where useful, clearly labeled historical runbooks.

#### F17. Roadmap sources disagree with shipped code

The self-hosted roadmap's immediate-next-step list is entirely marked done, yet remains the ending priority list. The WASM plan still says “planning” although the engine is shipped. The sequencer roadmap still describes building Euclid while `EuclidDeviceBox`, adapter, editor, scripting facade, WASM registration, tests, manual, and Rust crate are present. Naming alternates among openDAW, gatedDAW, and Metal-Duck Studios. SFZ/factory-pack implementation has advanced faster than the original plans.

Required fix: one canonical `docs/roadmap.md` with Now/Next/Later, owner, dependency, state, acceptance gate, and links to detailed plans. Mark old documents as historical, completed, superseded, or active. Never encode current status only in prose buried mid-plan.

#### F18. Large modules and TODO inventory need risk-based ownership

Large files are not automatically bad: `scripting/src/Api.ts` is largely an API surface and large test fixtures are healthy. Risk is concentrated where size combines with mutable state and many reasons to change: the server, `PresetService`, `AdminPage`, `StudioService`, `EffectFactories`, the DAWproject importer, and graph code. The 51 markers mix future ideas with correctness hazards.

Assign owners and review boundaries to risky modules. Convert correctness TODOs into tracked issues with reproduction and exit criteria; leave harmless explanatory notes in code. Favor extraction when it creates a test seam or enforces an invariant, not to satisfy a line-count target.

## Performance opportunity map

Prioritize measured user impact over micro-optimizations.

| Priority | Opportunity | Expected effect | Proof required |
| --- | --- | --- | --- |
| 1 | Stream and atomically commit project uploads/downloads | Lower peak RSS and shorter event-loop stalls on large projects | 100 MB/500 MB concurrent transfer benchmark, RSS, p95 latency, WS heartbeat delay |
| 2 | Cache or incrementally maintain factory size/count metrics | Prevent Admin asset page from walking a growing catalog synchronously | Cold/warm scan duration and event-loop delay at current and projected catalog sizes |
| 3 | Async, concurrency-limited scrypt | Preserve responsiveness under login failure/load | Valid/invalid login throughput and unrelated API latency |
| 4 | Add optimistic concurrency instead of compensating revisions | Prevent wasted saves and silent overwrite recovery work | Two-client race test and conflict-resolution timing |
| 5 | Establish browser/device benchmark baselines | Direct DSP effort to actual bottlenecks | Chrome/Firefox/Safari and Linux/macOS: render CPU, glitches, startup, memory high-water |
| 6 | Profile UI painters and long lists | Reduce timeline/piano/browser jank only where visible | Frame time, long tasks, and allocation profiles on a defined large project/catalog |
| 7 | Gate additional WASM memory/device-loading work on evidence | Avoid expensive architecture with no demonstrated constraint | Heap high-water, module load time, SDK multi-project demand |

Historical performance evidence supports this order. `docs/performance.md` documents useful hot-path improvements and a `/performance` harness. MemPalace records that the non-shared WASM memory fix shipped and that working-set eviction and cross-project PCM sharing are intentionally gated on measured weak-device/SDK demand. Do not relabel intentional double residency as a leak without new evidence.

## Consolidated roadmap

### Phase 0 — protect production and make change safe (weeks 1–2)

1. Implement F02 protected bootstrap and production fail-closed startup.
2. Implement the F01 atomic/versioned store, beginning with users, sessions, settings, room links, project metadata, and project bytes.
3. Add F03 required PR CI and a documented Node/Rust/libclang environment preflight.
4. Triage F12 advisories; update reachable production dependencies first.
5. Automate and execute the first F05 backup/restore drill.

Exit gate: no public first-user takeover; interrupted writes recover; a clean supported runner passes required CI; restore succeeds from an off-host backup.

### Phase 1 — concurrency, recovery, and server responsiveness (weeks 3–5)

1. Add F04 project generations/ETags and stale-write conflict handling.
2. Extract/test persistence and project routes as the first part of F10/F14.
3. Stream project/revision transfers and move factory accounting off the request path (F06).
4. Convert scrypt and throttling to the F07 asynchronous design.
5. Add F11 multi-stage non-root runtime, health/readiness, and graceful shutdown.
6. Ship F09 version history, atomic restore, and protected checkpoints on the new persistence/concurrency primitives.

Exit gate: concurrent clients cannot silently overwrite; large transfers do not stall collaboration; restore is user-accessible and race-safe; container health reflects storage validity.

### Phase 2 — correctness and QA closure (weeks 6–9)

1. Fix F08 DAWproject native-device fidelity with full built-in-device fixtures.
2. Close the high-confidence F13 bug cluster in test-first order.
3. Add cross-browser smoke tests for project create/save/reopen, import/export, audio start, Live Room join, membership denial, and offline factory mode.
4. Add Admin Projects/Live Rooms views only through tested server modules: storage/revisions, membership, participants, stale-room cleanup, force snapshot, and close.
5. Add error-report privacy/retention controls and an offline network allowlist (F15).

Exit gate: the core user journey and collaboration authorization pass on supported browsers; native-device round trips are loss-checked; top reproducible P1 bugs are closed.

### Phase 3 — finish in-flight product value (weeks 10–14)

1. Complete SFZ and factory-pack acceptance gaps: licensing/source attribution, deterministic validation, missing-sample reporting, offline-only verification, representative VCSL/VSCO playback tests, and catalog rollout.
2. Finish starter sample/SF2/preset packs with reproducible manifests and ten high-value starter presets.
3. Complete the synthwave/Metal-Duck visual pass only with contrast, keyboard navigation, reduced-motion, responsive layout, and first-run/demo checks.
4. Treat Euclid as shipped. Reconcile roadmap text, preserve its box schema, then use measured user demand to choose the next sequencer slice from `plans/sequencer-program.md`.
5. Finish Admin Audit/Assets/Settings capabilities after the underlying persistence and job APIs meet Phases 0–1 gates.

Exit gate: offline catalog install/use is reproducible and attributed; visual changes meet accessibility checks; no duplicate Euclid implementation or incompatible schema is introduced.

### Phase 4 — later product programs, each separately staffed

- Presence-derived soft locks, then persistent comments and A/B variants on the version-history model.
- Pattern/mono/drum/chord sequencer program after common scheduling/pattern contracts are proven.
- Mobile/PWA work from measured browser constraints.
- **VST3/CLAP support as an explicit desktop-integration program.** Start with a feasibility spike and choose the product boundary deliberately:
  1. Package the openDAW engine/devices as VST3 and CLAP plug-ins that run inside Reaper, Bitwig, and other desktop DAWs. This is the preferred first target because it reuses the shipped Rust/WASM engine and SDK packaging direction while keeping the web studio independent.
  2. Treat hosting existing third-party VST3 plug-ins inside openDAW as a separate, larger target. Native VST binaries cannot run directly in a browser; this requires a signed native companion or desktop shell, plug-in discovery, process isolation, crash recovery, latency/state/automation bridging, platform installers, and a clear licensing/security policy.
  Gate implementation on an architecture decision record, Steinberg VST3 SDK/license review, CLAP comparison, a prototype instrument and effect, sample-accurate automation/state round trips, and a Windows/macOS/Linux host compatibility matrix. The web-only studio must remain functional when no native bridge is installed.
- Modulation routing, nested device graphs, dynamic third-party devices, native packaging, and broad DAW import only after an architecture decision record covers compatibility, isolation, migration, licensing, and rollback.
- WASM memory eviction or cross-project PCM sharing only when telemetry demonstrates the need.

## Execution model

Use four workstreams with explicit dependencies:

| Workstream | First owner profile | Starts | Depends on | Definition of done |
| --- | --- | --- | --- | --- |
| Reliability/security | Server/platform | Phase 0 | Nothing | Atomic stores, safe bootstrap, backup drill, hardened container |
| Quality/CI | Build/release | Phase 0 | Nothing | Required reproducible CI and supported local preflight |
| Recovery/correctness | Server + studio | Phase 1 | Atomic store and CI | Conflict-safe saves, history restore, DAWproject fidelity |
| Product/catalog/UI | Studio/content/design | Phase 3; preparation may run earlier | Release and recovery gates | Offline verified assets, accessible UI, acceptance-tested features |

Maintain no more than one large architecture initiative at a time. Reserve approximately 25% of each cycle for regression tests, observability, migrations, documentation, and debt discovered by the active feature. Every roadmap item must include owner, risk, dependencies, rollback/migration, automated verification, manual verification, and a measurable exit condition.

## Metrics to start recording

- Reliability: successful saves, stale-write conflicts, failed/aborted writes, recovery events, backup age, restore-drill age.
- Server performance: request p50/p95/p99, event-loop delay, RSS/heap, transfer size/time, active WebSockets, factory-metric scan time.
- Product: project open/save success, audio-engine initialization success, import failures by reason, crash/error reports by build, Live Room snapshot lag.
- DSP/browser: render-quantum CPU, underrun/glitch count, cold start, WASM/module load, memory high-water, catalog parse time.
- Delivery: required-CI duration/flakiness, escaped regressions, time-to-reproduce, open P0/P1 age, roadmap items without an acceptance test.

Set budgets after collecting a representative baseline; avoid inventing targets that have no relationship to the OMV host, supported browsers, or real projects.

## MemPalace reconciliation

MemPalace was consulted through the local CLI as historical context, while current files and Git state were treated as authoritative.

- Wing `opendaw`, room `general`, source/drawer `self-hosted-roadmap.md`: relevance `cosine=0.454`, `bm25=1.496`. It confirms the intended server-first Projects/Live Rooms split and earlier auth/persistence direction; current source shows several of those phases have since shipped.
- Wing `opendaw`, room `general`, source/drawer `memory-systems.md`: relevance `cosine=0.395` and `0.380` across returned passages. It records the shipped non-shared-memory fix and the decision to defer eviction/shared-PCM work until measurements justify it.
- Wing `opendaw`, room `general`, source/drawer `023-native-version.md`: relevance `cosine=0.380`, `bm25=1.5`. It records unresolved Linux WebKit/AudioWorklet risk and correctly separates native packaging from literal DSP performance.
- Wing `opendaw`, room `general`, source/drawer `234-evaluate-webclap.md`: relevance `cosine=0.432`, `bm25=4.335`. It records that browser-side WebCLAP/internal WASM device modularity and native VST-like third-party hosting are different product problems; the roadmap now keeps those tracks explicit.

## Limitations

This is not a penetration test, production load test, browser compatibility run, audio-quality listening test, or deployed-host audit. The dependency report describes known package advisories, not proven exploitability. Test-command failures are environment findings and do not imply that the test assertions fail. File/line references may move as the unpublished integration commits are reorganized. Re-audit after Phase 0 and after the first representative server/browser performance baseline.
