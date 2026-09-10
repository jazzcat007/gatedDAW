# Workspace Agent Instructions

## Remote update process (cross-agent handoff)

This repo is worked on from at least two places: a local Windows checkout (no direct filesystem access from the deployed host) and the OMV server running the deployed instance. GitHub is the only channel between them — `origin` = `jazzcat007/openDAW`, branch `screwpulp/self-hosted` is the shared base every side tracks.

**Whichever side made a change must finish its own portion before asking the user to test:**
1. Verify the change as thoroughly as your environment allows (type-check, build, run the relevant tests) before handing off — not after.
2. Commit only the files belonging to that change, on a new branch cut from the latest `origin/screwpulp/self-hosted` (`git fetch origin` first).
3. Push the branch to `origin` and open a PR against `screwpulp/self-hosted` with a summary and the verification you actually ran.
4. Hand the other side (via the user) the branch/PR reference — not a patch file, zip, or manual file copy, unless GitHub access is genuinely unavailable.

**On the deploying side** (e.g. the OMV host), before asking the user to test: `git fetch origin && git merge origin/<branch>` (or merge the PR, then `git pull`), rebuild, restart, and confirm the feature is actually live in the running instance. Do not report "ready to test" for a change that exists only as source on disk and hasn't been rebuilt/redeployed.

Neither side hands the user a "please check" until its own half is done: code verified, and — for anything needing deployment — actually pushed, merged, and running where the user will look.

## Compatibility

- Keep projects backward compatible whenever feasible. Before introducing a breaking change, prefer a compatible migration path and clearly document any unavoidable incompatibility.

## MemPalace

MemPalace is the local memory system for this workspace. Use it to preserve and retrieve project context across sessions.

- Before answering questions about prior decisions, project history, architecture choices, unresolved issues, or earlier work, search MemPalace first when its MCP tools are available.
- Use `mempalace_search` as the primary lookup. Add `wing: opendaw` when the repository has been mined under that wing; add a room only when the room is known.
- If MCP tools are unavailable, use the CLI fallback: `mempalace search "<query>" --wing opendaw`.
- Treat repository files and current git state as authoritative for present behavior. Treat MemPalace as historical/contextual evidence and reconcile conflicts explicitly.
- When reporting retrieved memories, include their wing, room, drawer/source, and relevance score when available.
- After a meaningful decision, milestone, bug root cause, or durable project convention is established, record it in MemPalace when a write tool is available. Do not store secrets, credentials, tokens, or sensitive personal data.
- Do not mine the repository, conversation logs, or other directories automatically. Ask the user first, state the source path and mode, and report the number of items and warnings after mining.
- Check `mempalace_status` when diagnosing whether project memory is available or when the user asks about the palace.
- Keep MemPalace local-first. Never send project content to an external service unless the user explicitly requests it.
