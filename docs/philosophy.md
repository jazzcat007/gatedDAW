# Site Philosophy: Metal-Duck Studios vs. Upstream gatedDAW

This document exists to guide copywriting across the site (landing/meta text, in-app empty states,
onboarding, admin UI, manuals) so it consistently reflects what this fork actually is, instead of
carrying over language written for a different product. Use it as the standard to check new or
rewritten copy against.

## The one-line difference

Upstream gatedDAW is a free browser DAW anyone can open, for everyone. Metal-Duck Studios is a
private studio one person runs, for the specific people they've let in.

Same engine, different building. gatedDAW is the public instrument; this is a room with a lock on
the door, keys handed out one at a time, where the same people keep coming back and their work
stays exactly where they left it.

## What upstream optimizes for (and what we don't copy)

Upstream's copy, metadata, and product decisions are shaped by being a public, anonymous,
zero-commitment tool:

- **Anyone, no account.** Open a link, start making music, no signup required.
- **Local-first, disposable by default.** Work lives in the browser (OPFS); nothing assumes you'll
  come back, and nothing assumes anyone is watching over the data long-term.
- **Education and breadth as the audience.** The upstream metadata literally targets
  `student`/`teacher` roles and describes itself as a learning resource for the general public.
- **Generic, neutral identity.** It has to appeal to a stranger who has never heard of it before,
  so the brand voice stays broad and welcoming-to-anyone.
- **Ephemeral live rooms.** Anyone with a link can join a session; the session is the unit, not a
  persistent shared history.

None of that is wrong for gatedDAW's audience. It is simply not our audience, and copy that still
reads that way (generic taglines, "no signup needed" energy, "for musicians everywhere" framing)
is a leftover, not a feature.

## What this fork actually is

**Centralized.** There is one server, one instance, one home. It is not a multi-tenant SaaS, and
it is not a purely local single-page app that happens to sync sometimes. The server is the source
of truth — Projects are server-backed by default, browser storage is a cache/recovery copy, not
the primary copy. Copy should talk about a *place* ("this studio," "the server," "our instance"),
not a stateless *tool*.

**Self-hosted, not public.** This runs on infrastructure the owner controls, sits behind
authentication, and is explicitly `noindex, nofollow` — it isn't meant to be found. Copy should
never imply the site is discoverable, growable, or optimizing for new-visitor conversion. There is
no funnel. There is a door, and it's usually closed.

**Invite-only, for friends and family.** Access is granted person-by-person through invite links,
not open registration. The audience is a known, bounded set of real people the owner actually
knows — not "musicians," not "the community," not "students and teachers." Copy should feel like
it's addressed to people who were personally let in, not like marketing copy trying to widen the
audience.

**Durable, not disposable.** Projects persist on the server with revision history and are meant to
be returned to, months later, by the same people. Live Rooms link back to Projects and
autosnapshot into that history. The product treats work as something with a future, not a session
that ends when the tab closes. Copy should reflect ownership and continuity ("your projects,"
"pick up where you left off") rather than ephemeral-session language.

**A place with an identity, not a generic tool.** The Metal-Duck Studios brand and retro-future
synthwave direction exist so this reads as *our* studio, not *a* webapp. That's deliberate — a
distinct look and voice signal "this belongs to us" the way a shared physical studio space would,
as opposed to a SaaS product trying to look trustworthy to strangers.

**Known collaborators, not anonymous participants.** Presence, selection highlighting, chat, and
(planned) comments and locking all assume you know who "Alice" is. Copy and UI language should
lean into that — real names, a small roster, familiarity — rather than the generic
multiplayer-cursor language of tools built for strangers collaborating on the open internet.

## Tone and voice for copy

- Write like you're talking to people who already have an account and were personally invited —
  never like you're pitching a stranger on signing up.
- Prefer *studio*, *room*, *project*, *your work* over *app*, *tool*, *platform*, *workspace*
  (the latter reads generic-SaaS).
- It's fine to sound a little insular/clubhouse — that's accurate, not a flaw to soften.
- Don't borrow gatedDAW's "free and open to everyone" framing, education/classroom framing, or
  growth-oriented calls to action ("get started," "join now," "no signup required").
- Ownership and persistence should show up wherever the copy touches saving, history, or returning
  to work — this is the opposite of a scratch pad.
- It's fine to reference that this is built on gatedDAW's engine (attribution, licensing) — the
  distinction is about audience and posture, not about hiding the lineage.

## Quick gut-check for any new copy

Would this sentence make sense on the public gatedDAW site, addressed to a random visitor? If yes,
it's probably still upstream's voice, not ours — rewrite it to assume a specific, known, already-
admitted person on the other end.
