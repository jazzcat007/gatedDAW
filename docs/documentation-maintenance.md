# Documentation maintenance schedule

status: active
owner: Richard Billings (rotating steward not yet assigned — single-maintainer project as of 2026-09-15)
last-reviewed: 2026-09-15

Operationalizes `audits/system-audit-and-action-plan-2026-09-14.md` F17's cadence table as a
standing repo doc, so it survives past that one dated audit. Documentation and roadmap freshness
are part of delivery, not a later cleanup task.

## Cadence

| Cadence | Required work | Completion evidence |
| --- | --- | --- |
| Every feature/fix PR | Update affected manuals, API/config references, screenshots, examples, and `docs/roadmap.md` status in the same PR. Mark superseded plans explicitly (add a `superseded-by` line, don't just delete). | PR description notes what docs changed (or that none needed to) |
| Weekly | Check for internal links to files that no longer exist, and for `plans/*.md` files that duplicate an already-`plans/done/`'d or `plans/obsolete/`'d item. | A note in the next roadmap review below is enough — no separate ticket system exists for this yet |
| Monthly, first working week | Re-read `docs/roadmap.md`'s Now section: is anything actually done and not marked so? Anything blocked that isn't flagged as blocked? Promote/demote items between Now/Next/Later. Spot-check one or two `plans/*.md` files against the code they describe (this audit found two — `docs/self-hosted-roadmap.md`'s Sequencers section and the whole `plans/wasm-audio/` tree — that had drifted badly; there may be others not yet caught). | Update `last-reviewed` on `docs/roadmap.md` and any file touched |
| Before a release candidate | Run the full user journey from a clean install (setup, login/invite, project lifecycle, sharing, Live Rooms, import/export, Admin, offline mode) and reconcile version numbers, supported-browser notes, and any contradicted documentation. | Attach findings to the release; no unresolved release-blocking discrepancy |
| After an incident or breaking migration | Update the relevant runbook/architecture doc within two working days. | The incident writeup (wherever that's tracked) links to the doc update |

## What "superseded" looks like in this repo

Not a rename or deletion — add a short header to the top of the stale file:

```markdown
status: superseded-by-implementation | stale | historical
superseded-by: <path to the doc that's now authoritative>
last-reviewed: <date>
```

See `plans/euclidean-sequencer.md` and `plans/wasm-audio/README.md` for worked examples (added
2026-09-15, the first time this convention was used in this repo — it isn't yet applied
retroactively across every `plans/*.md` file, only where an inaccuracy was actually found and
fixed).

## Known gaps as of 2026-09-15

- No `CODEOWNERS` file exists yet to route roadmap/deployment-runbook/security-doc PRs to a
  specific reviewer — reasonable for a single-maintainer project today, worth adding if that
  changes.
- The "spot-check plans against code" monthly step has only been exercised once (this pass, which
  found the two staleness issues linked above) — it hasn't run long enough to know if monthly is
  the right cadence or if it should be more/less frequent.
- No automated link-checker or roadmap-staleness CI job exists; the weekly/monthly steps above are
  manual for now. Consider a scheduled workflow (similar to `.github/workflows/dependency-audit.yml`)
  if manual upkeep starts slipping.
