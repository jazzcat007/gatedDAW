# Claude Code Instructions

## Coding Style

- **Absolutely minimal comments.** A comment is rare and it is ONE short line. Never a 4-5 line block, never narration of what the code is doing, never a design rationale (that belongs in the commit message). Only comment when it is absolutely necessary, meaning the reader needs a fact the code cannot show. Tests may be commented freely.
- **No blank lines inside methods.** Keep method bodies compact without empty line separators.
- **Keep destructuring compact.** Group multiple destructured properties on the same line rather than one per line. Break into multiple lines only when a single line would exceed ~120 characters.
- **Never use single-letter abbreviations in lambdas.** Use descriptive names like `entry`, `text`, `value`, `event`, etc.
- **Use types and functions from `@opendaw/lib-std` instead of inline checks:**
  - Use `Optional<T>` instead of `T | undefined`
  - Use `Nullable<T>` instead of `T | null`
  - Use `isDefined(value)` instead of `value !== undefined` or `value !== null`
  - Use `!isDefined(value)` instead of `value === undefined` or `value === null`
  - Use `isAbsent(value)` instead of `value === undefined || value === null`
  - **Never use falsy checks like `!value` or `if (!value)` for null/undefined checks** - always use `!isDefined(value)` or `isAbsent(value)`
  - Never write `| null` or `| undefined` inline - always use the lib-std types.
  - Use `MutableObservableOption<T>` instead of `DefaultObservableValue<Nullable<T>>`. Use `wrap(value)`/`clear()` instead of `setValue(value)`/`setValue(null)`.
- **Never use `!` definite assignment assertions** (`let x!: Type`) to suppress compiler errors. Create elements as `const` upfront and embed them in JSX with `{el}`.
- **Use the `.hidden` CSS class** instead of `element.style.display = "none"`. Use `element.classList.add("hidden")` / `element.classList.remove("hidden")`.
- **Never use `as any`** — always define proper types instead.
- **Never use `try/catch`** — use `tryCatch()` from `@opendaw/lib-std`.
- **Never use `"foo" in bar`** for type checks — use proper type guards.
- **Never use `Set`/`Map` with `UUID.Bytes`** — use `UUID.newSet` / `UUID.newMap` (SortedSet) for correct byte-level comparison.
- **Use `Option<T>`, not `Optional<T>`**, for fallible return types.
- **Use the actual type from its source** — never create ad-hoc structural types like `{ name: string, value: number }` when a proper type exists.
- **Move complex field initializations into the constructor** rather than using inline field initializers.
- **Always use `--noEmit` when type-checking** to avoid generating waste `.js`/`.d.ts` files.

## Workflow

- **Analyze bugs and propose fixes, but wait for approval before editing code.**
- **Never commit.** Only run `git commit` when explicitly asked, for that commit. Finished, tested and verified work is ready to be committed, it is not permission to commit it. The one standing exception is the remote-update handoff described below, which the user has asked to run without per-change confirmation.
- **Never use `Write` to rewrite existing files** — always use `Edit` (small diffs).

## Remote update process (cross-agent handoff)

The deployed instance runs on a separate host (OMV server), managed by its own agent session with no access to this machine's filesystem. The only channel between "code written here" and "code running there" is GitHub (`origin` = `jazzcat007/gatedDAW`, branch `screwpulp/self-hosted` is the shared base both sides track). Local `npm install` cannot complete on this checkout's drive (no symlink support); `R:\Development\OpenDAW` is a working NTFS sandbox kept in sync for verification only — copy changed files there to build/test, never treat it as the source of truth.

Before asking the user to test anything that needs deployment, finish your OWN portion first:
1. Verify the change as thoroughly as your environment allows (type-check, build, run the relevant tests) — do this before handoff, not after.
2. Stage and commit ONLY the files belonging to this change, on a new branch cut from the latest `origin/screwpulp/self-hosted` (`git fetch origin` first).
3. Push that branch to `origin` and open a PR against `screwpulp/self-hosted` with a short summary and the verification checklist you actually ran.
4. Tell the user (or, for the OMV side, the deploying agent) the branch/PR — not a patch file, zip, or "copy this over," unless GitHub access is genuinely unavailable.

The receiving side's job before it asks the user to test: `git fetch origin && git merge origin/<branch>` (or merge the PR, then `git pull`), rebuild, restart, and confirm the feature is actually live. Neither side hands the user a "please check" until its own half — verified code, actually reachable in the environment the user will test — is done.

## MemPalace

- Search MemPalace before answering questions about prior decisions, project history, architecture choices, unresolved issues, or earlier work when MCP tools are available; use `mempalace_search` with `wing: opendaw` when applicable.
- If MCP is unavailable, use `mempalace search "<query>" --wing opendaw` as a fallback.
- Treat current repository files and git state as authoritative for present behavior; use MemPalace for historical context and reconcile conflicts explicitly.
- Attribute retrieved memories with wing, room, drawer/source, and relevance when available.
- Record meaningful decisions, milestones, root causes, and durable conventions when a MemPalace write tool is available. Never record secrets, credentials, tokens, or sensitive personal data.
- Ask before mining repository files, conversation logs, or other directories; state the source path and mining mode first.
- Keep MemPalace local-first and do not send project content to external services without explicit user approval.
