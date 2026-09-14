# Dependency advisory triage (F12)

Date: 2026-09-14. Snapshot: `npm audit` (full and `--omit=dev`) run against the checked-in
`package-lock.json` at commit `26af9e227` (branch `codex/attribution-page`, based on
`origin/screwpulp/self-hosted` at `9c0676af5`).

Companion to `audits/system-audit-and-action-plan-2026-09-14.md` F12. This is the "determine
reachability, do not blind-force-upgrade" triage that finding asked for.

## Summary

31 advisories (2 critical, 21 high, 8 moderate) collapse to **three root packages**. Every
advisory disappears once these three are bumped — there is no advisory that requires touching
anything else directly.

| Root package | Used for | In production bundle? | Advisories it accounts for | Fix |
| --- | --- | --- | --- | --- |
| `monaco-editor` (`^0.54.0`) | Scripting/Werkstatt code editor, code-editor page, Shadertoy editor — see `packages/app/studio/src/monaco/`, `.../ui/code-editor/`, `.../ui/pages/code-editor/`, `.../ui/shadertoy/` | **Yes** | `dompurify` (moderate x5 collapsed to 1), `monaco-editor` (moderate) | Upgrade to `0.56.0` (semver-major per npm; monaco doesn't follow strict semver on 0.x) |
| `vitest` (dev) | Test runner (`npm test` / `turbo run test`) | No | `vitest`, `vite`, `vite-node`, `esbuild`, `@vitest/mocker` (1 critical, 1 high, 3 moderate) | Upgrade to `5.0.0` (semver-major) |
| `lerna` (dev, `publish-sdk` script) | `npm run publish-sdk` only — maintainer-run SDK publish, not part of build/deploy/runtime | No | `tar`, `@lerna/create`, `@npmcli/*`, `@sigstore/*`, `cacache`, `js-yaml`, `libnpmpublish`, `make-fetch-happen`, `minimatch`, `node-gyp`, `npm-registry-fetch`, `nx`, `pacote`, `sigstore`, `tuf-js`, `uuid`, `lerna` itself (1 critical, 19 high/moderate) | Upgrade to `10.0.1` (semver-major) |

## Reachability assessment

- **`monaco-editor`/`dompurify` — reachable, user-facing, treat as the priority fix.** This ships
  in the browser bundle every studio user loads. DOMPurify sanitizes Monaco's hover/rendered
  content; the advisories are XSS-class (CWE-79) plus a prototype-pollution bypass. An attacker
  who can influence content rendered inside a Monaco instance a victim opens (e.g. shared-project
  script/shader source, hover text sourced from user-controlled strings) has a plausible path to
  script execution in the victim's session. No compensating control currently narrows this beyond
  "don't paste untrusted scripts into shared projects."
- **`vitest`/`vite`/`esbuild` — not reachable in production.** These only run during `npm test` /
  CI, driven entirely by first-party test files in this repo. The realistic exposure is a
  contributor's local dev machine or a CI runner processing a malicious *test fixture*, which
  isn't part of this repo's current threat model. Low priority; still worth clearing since a bump
  is free of user-facing risk.
- **`lerna` and its dependency chain — not reachable in production, low but non-zero risk.**
  `publish-sdk` runs `lerna publish`, which does talk to the npm registry with publish credentials
  (`@sigstore/*`, `pacote`, `make-fetch-happen`, `npm-registry-fetch` are registry/download/signing
  code paths). This is only exercised by whoever runs the SDK publish, on demand, not by any
  deployed system or end user. Compensating control: nobody runs `publish-sdk` today outside a
  deliberate release action taken by a trusted maintainer.

## Recommended action

1. **`monaco-editor` → `0.56.0`**: bump in `packages/app/studio/package.json`, regenerate the
   lockfile, then exercise the three editor surfaces (Werkstatt/scripting editor, code-editor
   page, Shadertoy editor) manually — open, edit, copy/paste (see `docs/monaco-clipboard-fix.md`
   for a clipboard regression this app has hit before), verify hover/completions render, verify
   build succeeds — before merging. Semver-major bumps in Monaco have previously changed worker
   bootstrapping and API surface; do not merge on `npm audit fix` alone. This is important enough
   to be its own isolated PR, not bundled with other Phase 0 work.

   **Attempted and reverted on 2026-09-14** from this checkout (`T:\Development\OpenDAW`,
   the exFAT-mounted drive — see `opendaw-exfat-build-workaround` in agent memory): bumping the
   version and running `npm install` exited `0` and reported packages added/changed, but
   `node_modules/monaco-editor` ended up with only `LICENSE` and a partial `esm/` — no
   `package.json`, no `min`/`dev` output — and `package-lock.json` was left unchanged at
   `0.54.0` (verified by grep, no diff). This is a silent partial-extraction failure specific to
   this exFAT checkout (Monaco ships an unusually large flat file count), not a rejection of the
   upgrade itself. Do this bump from a working install environment (per the exFAT workaround
   memory: `R:\Development\OpenDAW`, or any NTFS/Linux checkout) where the install and the
   regression pass above can both actually be trusted.
2. **`vitest` → `5.0.0`**: bump `devDependencies`, run the full `turbo run test` suite, expect to
   need vitest 5's config-shape changes reconciled (workspace config, coverage provider options).
   Low urgency; batch with other dev-tooling maintenance.
3. **`lerna` → `10.0.1`**: bump, then dry-run `npm run publish-sdk` (a real `--dry-run` /
   `lerna publish --canary` style check, not a real publish) before the next actual SDK release.
   Low urgency; do this before the *next* SDK publish, not as a standalone PR.
4. Going forward, don't triage this by hand each time — see the new
   `.github/workflows/dependency-audit.yml` (weekly `npm audit --omit=dev`, fails the run so it
   surfaces via GitHub's normal Actions-failure notification) and `.github/dependabot.yml`
   (weekly grouped update PRs for npm and GitHub Actions) added alongside this document.

## Exceptions log

No exception is being taken today — item 1 above is scheduled as an immediate follow-up PR, not
deferred. If it slips, record here: which advisory, runtime reachability, compensating control,
owner, and review-by date, per the audit's acceptance criterion.

## What this does not cover

This is a lockfile/package-manifest triage only. It does not re-run `cargo audit` on the Rust
workspace, does not generate an SBOM, and does not verify exploitability beyond the reachability
argument above. Re-run `npm audit` after any of the three bumps to confirm the advisory count
actually drops to zero for that package's subtree.
