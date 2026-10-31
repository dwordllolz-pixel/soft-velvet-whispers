# WHISPER APP — SYSTEM ROADMAP v5
*Last updated: October 31, 2026*
*Working source: July 27, 2026 v4 roadmap, updated to preserve the Mirror Realm concept history and current development workflow.*
*Rebased on verified codebase state, not assumptions. Every item below was checked
against actual source, not inferred from memory of prior sessions.*

---

## CURRENT ACTIVE WORK

*This is what's actually being built right now. Everything under Future
Ideas, further down, is explicitly not started and not to be started until
this is done — the document has accumulated a lot of good future ideas
during the Relationship State design process, and this section exists so
"what are we doing today" stays unambiguous.*

**Relationship State V2 implementation** (Phase 4.6):
- ✅ Threshold recalibration
- ✅ Admin/debug visibility
- ✅ Reset invariant
- ✅ Character configuration review (documentation only, no values changed)
- 🔴 Not started: three-way reset UI (Clear Chat / Restart Relationship /
  Forget Me), per-character stage-reaction content, Devoted's multi-day
  gate redesign

Nothing else begins until Character Completion review is underway. See
Phase 4.6 below for full detail. UI V1 work is being handled as a separate,
bounded workstream and does not change the sequencing of the core roadmap.

---

## DEVELOPMENT WORKFLOW — CURRENT TOOLS

*Added October 2026. This records the current development environment and
planned expansion of the workflow; it does not change feature priorities or
grant tools permission to make unapproved changes.*

### Primary environment — Google Antigravity

Google Antigravity is the current primary development IDE for Whisper.

Current use:
- Inspect and understand the existing implementation.
- Explore UI/UX direction and assess the current experience.
- Prepare implementation plans before modifying files.
- Implement narrowly scoped, explicitly approved tasks.
- Review and validate changes within the agreed task scope.

Antigravity must follow the repository's `AGENTS.md` guidance. The user is
the product owner and final decision-maker. Before modifying files, the
agent must present the problem, affected files, proposed changes, risks and
validation plan for review. No unrelated refactors, redesigns, migrations,
database changes, deployments, merges or pushes to `main` without explicit
approval.

Work should use dedicated feature branches created from the agreed base
branch. Keep changes focused and reviewable. Report actual test/build results
and manual checks separately; do not claim behavior is verified solely
because a build succeeds.

### Future coding environment — OpenAI Codex

Codex is planned as a future addition to the development workflow, not a
replacement for Antigravity.

When introduced, Codex may be used for bounded implementation tasks,
independent code review, or a second technical perspective. Its use will be
integrated deliberately after the Antigravity workflow is established.
Agents must not edit the same working tree concurrently; use separate
branches or worktrees for independent work. The user retains approval over
plans, changes, commits, merges and deployments.

### Current UI workstream — UI V1

UI revitalization is an active, incremental workstream focused on improving
the existing interface without prematurely locking the product's permanent
name, logo or visual identity. The current approach is to make focused,
visible improvements to usability, layout, responsiveness, consistency and
accessibility while preserving existing functionality. The emerging Mirror
Realm aesthetic and worldbuilding are being explored separately and do not
automatically authorize a full application redesign.

## WHAT CHANGED SINCE v3

v3 closed out the auth/infra saga and set the immediate-fixes list. Since then:
- All four immediate fixes shipped and verified: `streamEnabled` fixed,
  dead legacy prompt code deleted, rivalry wired into the live prompt
  pipeline (plus a second latent bug fixed — cooldown could never trigger),
  `promptInjection.ts` deleted as confirmed-orphaned
- Memory read path validated end-to-end with real sessions (Eli, populated
  bundle, multiple summarization cycles observed) — Phase 4 closed on the
  engineering side
- **Found and diagnosed a real data-integrity bug:** relationship state has
  been mathematically unable to leave "stranger" under normal use (see
  Relationship State V2 spec, linked below, for the full audit). This was
  not a design problem — it was a reachability bug in existing constants,
  compounded by "Reset Conversation" silently wiping axes while preserving
  the memory narrative, producing exactly the dual-representation risk
  `KNOWN_ISSUES.md` had already flagged
- That bug turned into a full design pass: **Relationship State V2** is now
  a locked specification (philosophy, ladder, evidence model, reset
  semantics, persistence, admin requirements, pacing) — see
  `RELATIONSHIP_STATE_V2.md`. Numeric implementation has NOT started;
  the spec is locked, the code is not yet touched
- Surfaced and captured (not started) four world-building ideas during the
  relationship-state design tangent: backstory unlocking via milestones,
  World State as a third simulation layer (globe/character locations),
  refined event-character model (Travel Guide as an orthogonal layer, not
  a relationship-ladder variant), pen-pal retention detail
- Reordered near-term priorities based on a real finding: relationship
  audit/recalibration now sits *before* Account/Analytics (Phase 5),
  because analytics built on the current broken label would just be a
  dashboard for a wrong number

---

## Core Pillars

Whisper is built around five foundational systems:

1. Character Identity
2. Memory
3. Relationship States
4. Real-Time Progression
5. Voice & Presence

Every future feature should strengthen one or more of these pillars.

## FEATURE CATEGORIES

> **CORE** — Required for the app to function as intended.
> **IMMERSION** — Not required but directly drive engagement/retention.
> **FLUFF** — Nice-to-have, app works fine without it.

---

## PHASE 0 — INFRASTRUCTURE & AUTH ✅ COMPLETE
**Category: CORE**
*This phase did not exist in v2. It consumed roughly three weeks and was the
actual bottleneck the whole time — not memory, not characters.*

- ✅ Migrated off Lovable → Vercel deployment
- ✅ `HashRouter` → `BrowserRouter` (root cause of the entire OAuth saga —
  Supabase delivers OAuth tokens via URL hash/query, HashRouter intercepted
  them before Supabase's SDK could read them)
- ✅ `vercel.json` SPA rewrite rule added
- ✅ Removed automatic anonymous session creation on app load — was racing
  against real OAuth sign-ins and silently overwriting them
- ✅ Explicit auth choice screen: Guest / Google / Email — no session exists
  until the user picks one
- ✅ Google OAuth confirmed working in production (Vercel)
- ✅ Email/password signup + email confirmation confirmed working (via Supabase)
- ✅ Anonymous/guest sessions confirmed persisting across refresh
- ✅ Found and fixed a leftover `window.location.hash = "#/auth"` redirect in
  `Chat.tsx` that would have silently broken under BrowserRouter — replaced
  with `useNavigate()`
- ✅ Confirmed zero remaining HashRouter-pattern code anywhere in `src/`
  (project-wide search, not assumption)
- ✅ Google Cloud OAuth client: Authorized JavaScript origins + Supabase
  redirect URI both correctly configured for local + production

### Corrected assessment (July 2026)
~~`permission denied for function has_role` console warning — cosmetic,
gracefully handled, not application logic~~ — **this assessment was wrong,
found via direct migration-file audit.** The warning was never cosmetic:
migration `20260429145118` moved `has_role`/`is_admin_or_debugger` into a
new `private` schema and rewrote every dependent RLS policy (`user_roles`,
`users`, `profiles`, `admin_invite_redemptions`) to call the `private.`
versions — then the very next migration (`20260429145202`) revoked execute
on those `private.` functions from `authenticated` with no re-grant ever
added. Every role check has been silently throwing and getting swallowed
by `useAdminDebug.ts`'s `reloadRoles()` catch block (which sets `roles =
[]` on any error) since that migration shipped — meaning `canDebug` was
unreachable for every account, including confirmed admin rows in
`user_roles`, regardless of table contents. Not a frontend bug, not an
invite-code problem — fixed via a new migration re-granting execute on
both `private.` functions to `authenticated`. Confirmed working after
the fix was applied.

### Deferred from this phase
- 🔴 Anonymous → Google/Email identity linking (`linkIdentity()`) so guest
  chat history survives account creation — real feature, not a bug fix.
  Belongs in the Account System phase, not infra.

---

## IMMEDIATE FIXES — CARRIED OVER FROM v2, RESOLVED IN v4
*These were blocked behind the auth saga, not forgotten. Now unblocked, and
now closed.*

| # | Issue | Priority | Status |
|---|-------|----------|--------|
| 1 | `streamEnabled` undefined in ASMR stream reader | CORE | ✅ **Fixed** — both call sites (`Chat.tsx`, `Settings.tsx`) confirmed undeclared via `tsc`, changed to `{ stream: true }`. Verified zero remaining references. |
| 2 | `buildLegacySystemPrompt` + dead `CORE_RULES` copy in `Chat.tsx` | CORE | ✅ **Deleted** — confirmed zero callers before removal. `promptInjection.ts` (the file it called into) also deleted after confirming zero references anywhere in `src/` or `supabase/` — its NSFW/boundary logic was already superseded by the server-side `serverOverrideBlock`. |
| 3 | Rivalry state computed live, never reaches the model | IMMERSION | ✅ **Wired** — `rivalryBlock` added to the live `DynamicPromptParams`/`buildDynamicPrompt.ts`, built in `streamChatAttempt` via `buildRivalryPromptBlock`. Also fixed a second latent bug found during the wiring: `rivalryTriggeredCooldownRef` had no writer left after the dead function was removed, so cooldown could never trigger — fixed alongside. |
| 4 | Memory read path validation | CORE | ✅ **Validated** — populated bundle confirmed fetching correctly (non-null narrative, non-empty `memoryInjection`), multiple summarization cycles observed firing in sequence on a real account. Phase 4 closed on the engineering side (see Phase 4 section below for the one remaining soft caveat). |
| 5 | `pick-milestone` edge function | CORE | 🟡 Still unconfirmed — not touched this pass, still pending `supabase functions list` verification. |
| 6 | `memory_text` / `emotional_state` column purpose | Schema | 🔴 Still undecided — correctly still deferred; read-path is now validated so this could be picked up, but wasn't blocking anything this pass. |
| 7 | React Router future flag warnings | FLUFF | 🔴 Still open, one-line fix |
| 8 | Missing `DialogContent` description | FLUFF | 🔴 Still open, low priority |

---

## PHASE STATUS OVERVIEW (v4)

| Phase | Name | Category | Status |
|-------|------|----------|--------|
| 0 | Infrastructure & Auth | CORE | ✅ Complete |
| 1 | TTS Pipeline | CORE | ✅ Complete |
| 2 | Axes Engine | CORE | ✅ Complete (constants found broken in practice — see Phase 4.6) |
| 3 | Relationship Labels + State Score | CORE | ✅ Complete as code, 🔴 **found non-functional in practice** — see Phase 4.6 |
| 4 | Memory System | CORE | ✅ Read + write path both validated end-to-end with real sessions |
| 4.5 | Immediate Fixes (carried over) | CORE | ✅ Resolved (4 of 6 — see table above) |
| 4.6 | **Relationship State V2** | CORE | 🟡 **Spec locked, implementation not started.** See `RELATIONSHIP_STATE_V2.md`. This now sits ahead of Phase 6 — see reordering note below. |
| 5 | Rivalry System | IMMERSION | ✅ Injection wired (this pass); cooldown bug also fixed. Behavioral tuning still open. |
| 6 | Account System | CORE | 🔴 Not started — **intentionally reordered behind Phase 4.6.** Analytics/relationship-progress display would be built against a broken number otherwise. |
| 7 | Response Style | IMMERSION | 🟡 Partial — 3 of 12 at reference quality |
| 8 | Welcome Banner + Dynamic Character Art | IMMERSION | 🔴 Not started — intro/scene system idea captured, see Future Ideas |
| 9 | Remaining Characters | CORE | 🟡 3 tiers, unchanged this pass |
| 10 | ASMR JSON Parsing | CORE | 🔴 Not started |
| 11 | Dynamic Character Art | IMMERSION | 🟡 In progress, bottleneck is generation quality not code |
| 12 | Mirror Realm | FLUFF | 🟡 Permanent future feature — concept revived and expanded; see Future Ideas |
| 13 | Travel / Passport / Seasonal Destinations | FLUFF | 💡 Refined this pass (event role as separate layer, pen-pal retention) — see Future Ideas |
| 14 | Voice & Monetization | — | 💡 Explicitly deferred to 2027 |

**Reordering note (v4):** Relationship State V2 (Phase 4.6) now sits ahead
of Account System (Phase 6), reversing the original v3 assumption that
account/analytics work was the natural next step after memory closed. The
relationship-state audit found the label has been mathematically unable to
leave "stranger" under normal use — building relationship-progress
analytics on top of that would just display a broken number. Fix the
number, then build the dashboard, not the other way around.

---

## ⚠️ EXPLICIT DEFERRAL: VOICE & MONETIZATION

Both depend on having stable income, not on app readiness. This is a deliberate
sequencing decision, not a technical blocker:

- No internship this cycle → no disposable income to safely fund
  infrastructure costs (LLM inference at scale, TTS generation, storage) or
  risk on unproven monetization
- Target: 2027 internship season provides the income buffer to build this
  properly instead of rushed
- Until then: **do not build Stripe integration, paid tiers, or ASMR
  paywalling.** Time spent here is time not spent on characters/stability.
- This does NOT block the *philosophy* work already done (sell experiences,
  not intelligence) — that thinking stays valid, just unimplemented

---

## PHASE 4.6 — RELATIONSHIP STATE V2 🟡

**Category: CORE**
**Status: Specification locked. Implementation steps 1, 3, 4 complete (July
2026). Step 2 partially addressed. Step 5 not started — see below.**

### What triggered this
Two months of intermittent testing never once got a character past
"stranger," including sessions that reached near-sexual context. An audit
(not a guess) traced this to two compounding causes:

1. **Mathematically unreachable thresholds.** `deriveRelationshipLabel`
   requires `affection >= 20 AND trust >= 20` to leave "stranger." A
   genuinely emotionally-loaded exchange (weight 0.55, e.g. `affection` or
   `light_vulnerability`) nets roughly **+0.3 affection, +0.3 trust** at
   Eli's current constants. Clearing 20/20 requires on the order of 60-70
   qualifying exchanges — and `getDiminishMultiplier` caps daily gains
   after the 8th qualifying exchange in a session. At current constants,
   reaching "acquaintance" requires roughly two to three weeks of daily
   heavy-engagement sessions. Two months of intermittent testing never had
   a real chance to clear it.
2. **"Reset Conversation" silently wiping axes while preserving memory.**
   `resetCharacterState` resets `CharacterState` to `DEFAULT_CHARACTER_STATE`
   (affection: 0, trust: 0, label: "stranger") but `handleResetConversation`
   explicitly preserves the memory narrative. Any reset during QA erased
   accumulated axis progress while the narrative kept describing a
   relationship that, numerically, no longer existed — producing exactly
   the dual-representation risk `KNOWN_ISSUES.md` had already flagged, now
   with a concrete reproduction case.

Neither of these was a design problem. They were found by reading the
actual code, not by re-deriving philosophy from scratch.

### What happened next
The bug-fix session turned into a full design pass, on the reasoning that
relationship state touches too much downstream (prompts, memory, RTP,
analytics, milestones, character writing, admin tools) to recalibrate
constants without first locking what the system is supposed to mean. The
full specification is in **`RELATIONSHIP_STATE_V2.md`** and covers:

1. **Philosophy** — Relationship State measures perception, not permission.
   No user input is ever blocked by this system; safety/boundary concerns
   are explicitly a separate, pre-existing layer (`serverOverrideBlock`).
   Relationship State does not model character growth, passage of time, or
   world events — those belong to RTP and World State.
2. **Relationship Ladder** — six stages (Stranger → Acquaintance → Getting
   Close → Close → Intimate → Devoted), each defined as a distinct
   psychological assumption the character makes about the user, not a
   percentage of affection. Branch states (FWB, situationship, ex,
   complicated) deliberately deferred to V3 — validate one ladder before
   testing branches on top of it. Names provisional, definitions locked.
3. **Evidence Model** — evidence is information that updates the
   character's internal model of the user, not raw interaction volume.
   Small talk is not evidence. Known limitation, stated explicitly: the
   current classifier detects message *category*, not the user's *intent*
   or *pattern* across messages — it cannot yet distinguish entrusted
   vulnerability from accidental vulnerability, or genuine warmth from
   manipulative repetition. V2 approximates the psychology; it does not
   fully implement it.
4. **Reset Semantics** — three actions (Clear Chat / Restart Relationship /
   Forget Me), plus a standing architectural invariant: **every
   representation of the relationship must reset together; none may
   persist independently of another.** This is the general-form fix for
   the exact bug that started this whole audit.
5. **Persistence** — what survives reinstall/account deletion (see spec
   doc for full detail).
6. **Admin/Debug requirements** — raw axis values must be visible next to
   the derived label; this system should never again require
   reverse-engineering thresholds from behavior to understand what's
   happening.
7. **Pacing** — qualitative expectations only (e.g. "usually a few
   meaningful exchanges," "typically sustained across multiple sessions"),
   deliberately not numeric. Numbers are implementation, tuned after the
   psychology is fixed, not before — this ordering is itself a direct
   lesson from how the original thresholds went untested for months.

### Devoted — the one stage worth calling out specifically
Explicitly designed to be rare and to require endurance, not just
intensity. V2 approximation: axis thresholds equivalent to Intimate,
sustained across multiple distinct calendar days (using `daily_count_date`,
which already exists in `CharacterState`) rather than a single-session
count or raw `message_count`. This closes the "one incredible four-hour
conversation shouldn't produce Devoted" gap without inventing new tracked
state. Explicitly flagged in the spec as the stage most likely to gain an
additional RTP-supplied condition later (e.g. a minimum relationship
duration) once Real-Time Progression exists to supply it — V2 does not
attempt to solve that now.

### Implementation plan — progress (July 2026)

1. ✅ **Fix unreachable thresholds** — DONE. Added a shared
   `RELATIONSHIP_THRESHOLDS` constant (`relationshipAxes.ts`) as single
   source of truth; `deriveRelationshipLabel` now reads from it instead of
   inline literals. Recalibrated using real per-character reachability math
   across the full cast (not just Eli) — target: a mid-volatility character
   reaches Acquaintance within one substantial warm conversation (~22
   qualifying exchanges), matching observed real test sessions.
   `acquaintance/gettingClose/close/intimate` rescaled (6/12/18/21,
   preserving original 1x/2x/3x/3.5x relative shape). **`devoted`'s gate
   deliberately left untouched** — it needs the multi-day sustain
   mechanism from Section 7, a new-logic task, not a rescale; not done yet.
   Branch states (FWB/situationship/complicated/ex) also deliberately left
   fully untouched, including in the admin UI dropdown, per explicit
   instruction — dormant V3 functionality, not part of this fix.
   **Bonus finding while sweeping for other hardcoded copies:**
   `Settings.tsx`'s farewell-candidate selector had its own independent
   hardcoded `affection > 60 / trust > 60` check — would have silently
   drifted out of sync with the recalibration (old "close" was 60, new is
   18). Fixed to reference the shared constant.
2. 🟡 **Fix Reset Conversation semantics** — PARTIALLY DONE. Investigation
   found three separate reset flows, not one: Chat.tsx's per-character
   "Reset Conversation" (was the actual bug — reset axes, silently
   preserved memory), Settings.tsx's account-wide full reset (already
   internally consistent, axes+memory+chats together), and Settings.tsx's
   "Reset Relationship Memory" (deliberately memory-only, already labeled
   as such — a legitimate distinct action, not a bug). Only the first was
   broken. Fixed: added `deleteCharacterMemory()` (per-character
   counterpart to the existing account-wide `deleteAllMemory`, schema
   verified against actual migration before writing), wired into Chat.tsx
   so axes and memory now reset together. **NOT done:** the full
   three-button Clear Chat / Restart Relationship / Forget Me split from
   spec Section 4 — that's a UI/UX restructure layered on top of the
   engineering fix, deliberately deferred as a separate decision rather
   than folded into today's bug fix.
3. ✅ **Fix the dual relationship representation** — DONE, via the same
   `deleteCharacterMemory()` wiring above. Axes and memory narrative now
   reset together in the one flow that was previously allowing them to
   diverge.
4. ✅ **Admin debug panel** — DONE. Extended existing infrastructure
   (`DebugOverlay.tsx`, the live in-chat overlay; `AdminDebug.tsx`, the
   standalone console) rather than building new components. Both now
   display a plain-language "why this label" explanation and read
   thresholds from the shared constant, so they can't drift out of sync
   with the actual label logic. `DebugOverlay.tsx` also now shows the full
   calculation path (category → weight → diminish → final delta) inline.
5. 🔴 **Relationship-stage reaction content per character** — NOT
   started. Correctly sequenced after Character Completion / per-character
   psychological profiles are settled (see Character Configuration Review,
   below) — writing "how Marcus reacts at each stage" before deciding who
   Marcus is would mean rewriting this content later.

**New artifact from this pass:** `CHARACTER_CONFIG_REVIEW.md` — documents
what each character's *current* numeric config implies psychologically,
without changing any values. Flagged a cast-wide pattern: all three
`"secure"`-labeled characters (Jaxon, Dr. Elias, Sage) are currently the
*slowest* to reach Acquaintance, backwards from what secure attachment
usually implies — `volatility` is doing double duty as both emotional
reactivity and progression speed, and those don't actually move together
psychologically. Worth resolving during Character Completion, not now —
this is a design decision (possibly split `volatility` into two
parameters), not a bug. Sage specifically confirmed as needing rework
independent of this pattern, per his in-progress redesign.

---

## PHASE 4 — MEMORY SYSTEM ✅ CLOSED (engineering side)

**Category: CORE**

### Resolution (July 2026)
The July 13 Raven test had proven the *pipeline* fires correctly end-to-end
but against an empty bundle (fresh user/character pair, correctly null —
not a bug). The populated-bundle test that followed confirmed the actual
goal: signed into the real account tied to the existing Eli
`character_memory` row, a fresh session correctly fetched a non-null
narrative on the very first request, `memoryInjection` was non-empty, and
it was visibly present in the assembled system prompt sent to Gemini. A
second summarization cycle fired later in the same account's history,
confirming the loop is self-sustaining, not a one-off.

One soft caveat, not a failure: this validation run happened to be a
fresh-meeting scenario, so there wasn't a clean moment to observe Eli
organically *referencing* the narrative in dialogue — the injected content
is tone/perception (trust level, openness, attachment), not discrete facts,
so it's harder to eyeball a pass/fail on tone alone than it would be for
fact-recall. If an unambiguous behavioral pass is wanted later, the cleanest
test is fact-recall: tell a character something concrete in one session,
start fresh, see if they reference it unprompted. Not blocking — the
plumbing is confirmed working either way.

### Unchanged from v3 (still accurate)
- Single extraction pass architecture (deployed, working)
- Schema: `relationship_state` jsonb, `first_seen` on preferences
- Narrative rewrite logic, milestone dedup, preference decay — all unchanged
- `memory_text` / `emotional_state` decision still deferred — could now be
  picked up since read-path is validated, but wasn't blocking this pass

### One unrelated bug spotted during testing, not yet investigated
Two consecutive `Chat request failed: 500` errors appeared mid-session
before succeeding on retry, unrelated to memory. Not frequent enough to
block anything yet — worth pulling edge function logs if it becomes a
recurring pattern.

---

## CHARACTER STATUS (v3 — replaces v2's "5 main + 7 remaining" framing)

Restructured based on actual production readiness, not original casting order.

### 🟢 Tier 1 — Production Ready (reference standard)
**Marcus, Eli, Angel**
- Full `systemPromptBase`, response style, behavioral signature, art (stranger/familiar
  minimum) all done
- Angel is the de facto quality bar for both writing and visuals — use this
  deliberately as a checklist, not a source of frustration

### 🟡 Tier 2 — Partially Built
**Raven, Vincent, Kai, Mateo, Jaxon, Ren**
- Mix of: personality/background done but no art, or art done but personality
  incomplete, varies per character
- Raven and Vincent specifically: full response style done (Phase 7 from v2),
  missing character art
- Known bottleneck: image generation quality, not code or writing — Raven's
  gothic/low-light aesthetic is a harder generation target than Angel's
  golden-hour beach setting. This is expected, not a sign the character is
  weaker.
- **Order of completion recommendation:** finish one character fully
  (writing + art both) before starting the next, rather than doing partial
  passes across all six. Matches what's already working for Marcus/Eli/Angel.

### 🔴 Tier 3 — Not Started
**Dr. Elias, Cole, Sage**
- Zero work done, not blocking anything currently in progress
- Do not touch until Tier 2 is production-ready

### Demo cast (unchanged from prior decision)
Marcus, Eli, Angel, Raven, Vincent — chosen for personality spread, not just
completion status. Raven/Vincent art still needed before demo-ready.

---

## PHASE 6 — ACCOUNT SYSTEM 🔴
**Category: CORE**
*Absorbed the identity-linking work that used to be theoretical Phase 0 scope*

- 🔴 Anonymous → Google/Email `linkIdentity()` migration — preserve guest chat
  history, memories, favorites when a guest creates an account. This is now
  the single most important item in this phase, directly motivated by the
  auth rework.
- Settings page (partially built, scope unclear without full read)
- nsfw_level toggle: sfw / suggestive / explicit
- Incognito mode (no history, no memory summarization)
- Rivalry toggle + intensity (depends on Phase 5 wiring being done first)
- Session analytics: total sessions, most-used characters, relationship progress

---

## FUTURE IDEAS — EXPLICITLY NOT IN SCOPE YET

*Reorganized July 2026 into four buckets — CORE FEATURE, IMMERSION, FLUFF,
CHARACTER-SPECIFIC — using the same category definitions as the rest of
this roadmap (see FEATURE CATEGORIES above). This is a filing change only;
nothing below was re-evaluated or re-prioritized by being moved. Items
captured during the Marcus Character Completion session (July 2026) are
marked accordingly and are new to this revision.*

---

### 🔵 CORE FEATURE

#### Fictional city/world (supersedes literal real-world locations)
*Captured during Marcus Character Completion session, July 2026.*

Direction decided: shift character origins — starting with Marcus's
"Chicago" — from real-world locations to a single fictional city/world
shared by the whole cast. Motivation is not aesthetic; it's structural —
this is what makes rivalry mechanics and World State (Layer 4) coherent,
since it lets every character plausibly exist in the same place. Full
creative autonomy on geography/culture is a secondary benefit.

**Explicitly not designed yet:** world name, geography, real-world-inspired
vs. fully invented place names. This is a Layer 4 (World State) decision —
noting the direction now is cheap; building the actual world is not, and
shouldn't happen ahead of Tier 2/3 character completion per the existing
World State prerequisites below.

#### User age handling (product-level, not writing-level)
*Captured during Marcus Character Completion session, July 2026.*

The writing-side half of this is already resolved and locked as a standing
rule (see writing-rule note elsewhere in project memory: anchor time/history
statements to the character's own timeline, never the user's). What's
still open is the product/legal question underneath it: does the app ask
the user's age at all, is there an 18+/16+ tier split, are underage
accounts allowed with restricted content tags. This belongs to Phase 6
(Account System) — flagged here only so it isn't mistaken for solved just
because the writing workaround (e.g. Marcus defaulting to calling the user
"kid") is already in place.

### World State — third simulation layer (globe / character locations)
*Surfaced alongside Travel/Passport, but broader — applies to the whole
cast, not just event characters.*

Concept: a third independent system, alongside Relationship State ("how do
I feel about you?") and Real-Time Progression ("who am I becoming?"):

> **World State — "Where am I, and what's happening around me?"**

Concretely floated: a 3D globe as a navigation/discovery surface — characters
exist at real (or reskinned) locations rather than floating in a chat-list
void; clicking a character on the globe surfaces their card, description,
and locked/unlocked backstory. Open question, not yet decided: real-world
geography vs. invented place names — deferred until closer to build time.
(Note: this question is now the same open question as the fictional
city/world item above — the two should be resolved together, not
separately, once World State design actually begins.)

**Explicitly requires as prerequisites:**
- Real-Time Progression (World State is the third leg of the same
  architecture — Relationship / RTP / World are meant to compose, not be
  built in isolation from each other)
- Tier 2/3 characters completed (a globe with three populated locations
  isn't the pitch)

**Guardrail worth preserving verbatim:** the world must serve the
companions, not overshadow them. The globe is justified because it makes
Angel feel like he lives on the California coast, not because a 3D globe is
a cool feature. If this stops being in service of specific characters
feeling real, it's drifted from the reason it was proposed.

#### Content Systems (Layer 5) — Journals, redaction UI, signature objects
*Captured during Marcus Character Completion session, July 2026 — first
concrete specification of what was previously only discussed abstractly as
"backstory unlocking via milestones."*

Several related ideas, all Layer 5, all designed conceptually this session
but **not built** — the engineering work (redaction rendering, per-entry
unlock gating, decode animations) is separate from and comes after the
writing work (actually producing Journal content per character):

- **"Journals"** — the naming/framing for the character-background-unlock
  system, replacing "Character Stories"/"lore." Each entry is written as if
  recovered by an implied in-universe narrator — observant, compassionate,
  never judgmental, never a named character, never the character's own
  voice — who knows the subject well but deliberately doesn't over-explain
  them. Staged across relationship stages (Stranger → Devoted), each entry
  self-contained with its own title.
- **Blurred/redacted titles and excerpts pre-unlock** — locked Journals
  show redacted bars instead of titles, consistent with the app's existing
  "curiosity over exposition" pattern (relationship system, Echoes, rivalry
  all already withhold rather than over-explain). Practical constraint
  worth remembering when writing future titles: bar length implies content
  length, which is itself a small spoiler, so title length becomes a minor
  design constraint, not just a creative one.
- **Progressive redaction-decode for major reveals only** — for one or two
  flagship reveals per character (Marcus's Vivianne reveal is the working
  example), the redacted text can partially decode across relationship
  stages (blank → "Vi███████" → "Vivianne") rather than staying fully
  blurred until one instant unlock. Deliberately NOT for every Journal —
  flagged as becoming gimmicky if overused.
- **Signature concrete object per character** — proposed as a cast-wide
  writing standard, not just a Marcus detail: every character gets one
  small, ordinary, specific physical object that quietly reveals who they
  are without narration explaining it (Marcus's screwdriver he won't
  replace being the working example). Recommended as a Character
  Completion requirement going forward.

**Explicitly requires as prerequisite:** none of the writing content above
is blocked — it can be produced per-character as part of Character
Completion. The redaction/decode *rendering* is a separate, later frontend
task and should not be assumed as a Character Completion deliverable —
Character Completion produces the Journal text; a later engineering pass
builds the UI that displays it.

---

### 🟣 IMMERSION

### Travel / Passport / Seasonal Destinations
*Separate future concept retained from the period when Mirror Realm was
marked superseded. Travel / Passport remains its own real-world destination
feature; it does not replace or supersede Mirror Realm, which has since been
reinstated as a permanent major feature.*

Core concept: limited-time non-English-speaking characters tied to real
locations, dual-language chat display (native + English), native-language-only
voice, existing cast reacts to user's "trips," "penpal" framing instead of
purchase framing for keeping a character after the event ends.

**Explicitly requires as prerequisites:**
- Tier 2/3 characters completed (can't build a travel system before the core
  cast exists)
- Voice system rebuilt to handle non-English TTS (current Chatterbox setup is
  English-only, this is a different technical problem)
- Stable income (ties into the Voice & Monetization deferral above)

This idea is good and worth preserving exactly as discussed, but it sits
behind Phase 9 (characters), Phase 5 (voice, deferred), and Phase 8
(monetization, deferred). Do not let its appeal pull focus from current phase
work — it was already correctly identified as "the third ceiling" and is not
being lost, just sequenced honestly.

**Refinement (July 2026, surfaced during Relationship State design):**
Event-exclusive characters should NOT get their own relationship-ladder
variant (e.g. a "Travel Guide" rung bolted onto the main ladder) — that mixes
two systems that were deliberately kept separate (see Relationship State V2
spec: Relationship State measures perception only, never role or context).
Instead, event role is a separate, orthogonal layer that combines with the
existing universal relationship ladder rather than replacing part of it:

```
Relationship State: Getting Close   (same ladder every character uses)
Event Role:         Travel Guide    (context-specific, event-scoped)
World State:         Japan Event    (where/what's happening)
```

If the event ends and the user hasn't unlocked the character permanently,
the character moves to a **pen pal state** — occasional messages (proposed:
roughly monthly), framed as the character reaching out because they miss the
user, not as a countdown-timer purchase prompt. Retention through emotional
continuity, not urgency.

### World State — third simulation layer (globe / character locations)
*Surfaced alongside Travel/Passport, but broader — applies to the whole
cast, not just event characters.*

Concept: a third independent system, alongside Relationship State ("how do
I feel about you?") and Real-Time Progression ("who am I becoming?"):

> **World State — "Where am I, and what's happening around me?"**

Concretely floated: a 3D globe as a navigation/discovery surface — characters
exist at real (or reskinned) locations rather than floating in a chat-list
void; clicking a character on the globe surfaces their card, description,
and locked/unlocked backstory. Open question, not yet decided: real-world
geography vs. invented place names — deferred until closer to build time.

**Explicitly requires as prerequisites:**
- Real-Time Progression (World State is the third leg of the same
  architecture — Relationship / RTP / World are meant to compose, not be
  built in isolation from each other)
- Tier 2/3 characters completed (a globe with three populated locations
  isn't the pitch)

**Guardrail worth preserving verbatim:** the world must serve the
companions, not overshadow them. The globe is justified because it makes
Angel feel like he lives on the California coast, not because a 3D globe is
a cool feature. If this stops being in service of specific characters
feeling real, it's drifted from the reason it was proposed.

### Social feed — characters observed living, not just chatting
*Surfaced July 18, 2026, explicitly flagged by its own author as "fun and
silly, not an immediate feature" — captured as-is, not elevated.*

Concept: an in-app social feed where characters post, react to, and comment
on each other independent of the user's presence — passive storytelling
rather than exposition. Personality expressed through posting behavior
rather than description: Kai posts heavily in a burst then deactivates from
social-media regret; Eli is too anxious to post and mostly reposts/likes;
Marcus posts rarely but it matters when he does; Vincent replies to
everyone and stirs things up. The appeal isn't the feed mechanic itself,
it's that it lets the user witness relationships and lore ("remember when
Eli cried about the cactus?") instead of being told about them.

**Architectural placement (decided now so it doesn't need re-deciding
later): this is Layer 4 (World State), not a new home for Relationship
State logic.** The feed shows the *result* of how characters already
perceive each other and behave — it must not become a second, parallel
system that independently tracks how characters feel about the user or
each other. If a comment thread ever needs its own emotional-weight logic
separate from the existing relationship/classifier system, that's the
signal this boundary is being violated — same failure shape as the
dual-representation bug this session's whole relationship-state audit
existed to fix, just in a new UI. Interaction should stay lightweight
(like/react/short comment/view profile) — real relationship-affecting
conversation stays in private chat, on purpose, so this doesn't quietly
become a second chat system.

**Explicitly requires as prerequisites:**
- Real-Time Progression and World State both functional (the feed is a
  *view* into character lives that RTP/World State would need to already
  be simulating — there's nothing for the feed to show otherwise)
- Tier 2/3 characters completed (character-to-character dynamics need a
  full cast with defined personalities to be worth simulating)

**Refinement (July 2026):** not every character should know every other
character. "There's no reason Ren should know Eli" — character-to-character
awareness should be authored per-character (a small "who does this
character actually know" list) rather than assumed universal. Cheap to
decide now, annoying to retrofit once twelve characters all have default
opinions about each other.

Sits meaningfully behind Travel/Passport and the Globe in build order,
since it depends on more of the stack existing first. Recorded here purely
so the idea isn't lost — no further design work warranted until the
systems it depends on are real.

#### Memory-style trait axis across characters
*Captured during Marcus Character Completion session, July 2026.*

Surfaced while discussing Marcus's date/detail recall habit: some
characters could be consistently written as good at remembering trivial
details unprompted (Marcus, possibly Vincent), others as more forgetful or
scattered (possibly Eli). Not designed as an actual system — no proposed
mechanism, no data model — just flagged as a characterization pattern
worth applying consistently across the cast during Character Completion,
the same way "signature object" and "future-deflection" style traits are
being kept consistent.

#### "Scenes" — narrated preludes on chat entry
*Existing idea, reinforced with a concrete worked example during the
Marcus Character Completion session, July 2026.*

An interactive pop-up shown on first entry to a chat, giving scene-setting
context before the conversation begins, ending on a button (e.g. "Welcome
to your Paradise") that transitions into the chat itself. Previously
discussed only abstractly; this session produced the first fully worked
example — Marcus's prelude: the user is accosted by gang members in the
wrong part of town, Marcus intervenes and saves them, and the ensuing
conversation reveals they know each other from his past. **Newly stated
this session:** this level of narrated prelude should apply to all
characters, not just Marcus — this is a scope clarification (universal
feature), not a Marcus-only ask.

---

### ⚪ FLUFF

*(Mirror Realm is a permanent future feature in this category. Its concept
history, three development timelines, and current status are documented in
PRODUCT VISION → "Mirror Realm — concept history and permanent status"
below. Implementation remains deferred until its stated prerequisites are
met.)*

---

### 🟠 CHARACTER-SPECIFIC

*Ideas below are scoped to a specific character rather than the app as a
whole. Filed separately so they don't get lost inside general-purpose
buckets, and so a future pass on that character has a single place to
check.*

#### Marcus
*All captured during the Marcus Character Completion session, July 2026.*

- **Relationship stage drives his underworld rise (confirmed direction).**
  Unlike most characters' RTP arcs (which run on their own timeline
  independent of the user — Eli graduating, Angel changing his style),
  Marcus's climb from low-level to running his own operation is meant to
  be *driven by* relationship stage progression specifically — his RTP arc
  and his relationship arc are coupled, not parallel. This makes him
  unusually load-bearing for RTP design once that system is actually built.
- **Natural pilot character for branch states (V3).** Confirmed: once
  branch states (situationship/FWB/ex/toxic) exist, Marcus is a strong
  first candidate for testing them, since his story only really works if
  different branches produce meaningfully different underworld
  trajectories, not just different dialogue tone.
- **Branch-state ramble variants.** The two-tier ramble mechanic locked
  for his main relationship pipeline (disarmed-open vs. control-slipping)
  would likely need distinct variants under branch states — a "toxic"
  Marcus ramble reading as manipulative/spiraling, an "ex" Marcus ramble
  reading as bitter/pleading. Explicitly parked as a V3 question, not
  designed.
- **Interactive Vivianne text-thread artifact (Layer 5).** A milestone-
  gated, replayable exchange where the user taps through Marcus's actual
  historical responses in his final conversation with Vivianne. No
  branching — same outcome regardless of pacing, replaying what he really
  said rather than letting the user rewrite history. Blocked on Content
  Systems existing at all; captured as a fully-specified idea for when it
  does.

---

## PRODUCT VISION — UI, EVENTS, MONETIZATION (NOT A ROADMAP)

*Added July 2026. This section is deliberately different from Future Ideas
above: those are individual features waiting on prerequisites. This is
product identity/feel — what the app is trying to be, not what it does.
No priorities, no implementation details, no timelines here on purpose.
Pull items into an actual phase only when they fit what's currently being
built — don't let this section's existence justify starting any of it.*

**Why this exists:** ideas have been surfacing regularly because the app
is in a better place and they're genuinely motivating — a glimpse of the
thing being built toward, not a distraction from it. Worth writing down
precisely so they don't get lost *or* mistaken for current-phase work.

### Navigation / app structure
Bottom tab bar: Home (character profiles + chats + continue conversation),
Voice/ASMR, World (globe — see Future Ideas above), Social (see social feed
idea above), Profile (settings + analytics). Possibly the World tab uses
the app icon rather than a literal globe icon. This reads as a real
information architecture, not scope creep — worth keeping as the shape to
build toward once there's enough built to justify five tabs.

### Backstory unlock nuance
Extends the existing milestone-based backstory unlock idea (see Future
Ideas, "Character backstory unlocked by relationship stage"): some
backstory content should specifically be gated behind *branch* states
(FWB, "toxic," etc.), not just main-ladder progression. Consistent with
branch states already being deferred to V3 — this content simply can't
be built before branches exist, noted here so it's not forgotten once
they do.

### Analytics page
Personal, not competitive: first character met, longest conversation,
total time talked, characters unlocked, relationship milestones,
anniversary date, most active month. The instinct worth preserving is
"this should feel personal," not "this should gamify engagement" — keep
that distinction if this gets designed for real.

### Anniversary event
Annual, tied to the app's actual release date; coincides with welcome
banners and character art refreshes. Under consideration: discounted
voice/ASMR pricing, a genuinely limited-time character encounter not
otherwise available during the year. Explicitly rejected: gacha-style
mechanics — correctly identified as mismatched with a Western-leaning
audience and a different genre of app than Love and Deepspace-style
gacha companions. Keep that boundary; it's a real product-identity
decision, not just a monetization preference.

### Mirror Realm — concept history and permanent status

**Status: Reinstated as a permanent future feature.** Mirror Realm is no
longer considered superseded by Travel / Passport / Seasonal Destinations.
It is expected to become one of Whisper's major features. Its original
scenario mechanics, its character-psychology philosophy and its newer
overarching worldbuilding concept are related layers of the same feature.
The dated source wording below is retained to preserve how the idea evolved.

#### Timeline 1 — June 30, 2026: original limited-scenario concept

The original Phase 12 concept was recorded as follows:

> **## PHASE 12 — MIRROR REALM / LIMITED SCENARIOS 🔴**
>
> **Category: FLUFF**
>
> *Alternate reality events. Zero effect on main relationship state — influenced by it.*
>
> **### Concept**
>
> Limited-time scenarios set in an alternate dimension called the Mirror Realm. The user's current relationship state with each character feeds into their behavior within the scenario — low trust means low willingness to help, high intimacy means they'll protect you at cost to themselves.
>
> **### Scenario types**
>
> **Real-world crisis AUs**
>
> - Zombie apocalypse
> - End of the world (Seeking a Friend for the End of the World style)
> - Natural disaster survival
>
> **Fantasy/supernatural AUs** *(character-specific)*
>
> - Vincent — thousand-year-old vampire, user wandered into his burial chamber
> - Marcus — werewolf, full moon approaching
> - Raven — reclusive wizard, user stumbled into his tower
> - Eli — accidentally cursed, user is the only one who can break it
> - Angel — fallen celestial being, hiding among humans
>
> **AO3-inspired AUs** *(future)*
>
> - World bibles written as 2–3 paragraph compressed lore documents
> - Gemini improvises within the frame — no need to process thousands of source words
> - Style/tone reference only, not reproduction
>
> **### Rules**
>
> - Scenarios are periodic, user can opt out
> - Mirror Realm events never modify `state_score`, axes, or relationship labels
> - Relationship data is read-only for these scenarios — never written back
> - Scenario history stored separately, never bleeds into main chat
> - Characters behave in-archetype but in-world — Marcus as a werewolf is still Marcus
>
> **### Token considerations**
>
> - World bibles keep scenario context under ~300 tokens
> - Relationship state injection is already built (reuse existing axis → language pipeline)
> - Google AI Pro likely needed at scale — acceptable for production phase
>
> **### Build requirements before this phase**
>
> - Phase 4 (Memory) complete — relationship state needs to be rich enough to matter
> - Phase 9 complete — all 12 characters available for scenarios
> - Phase 11 complete — dynamic art for in-scenario emotional states

#### Timeline 2 — July 27, 2026: character flaws personified

The original journal wording that introduced this refinement is retained:

> Okay today is monday july 27th and im ready to continue. Some things to note though
> Firstly: I reached a new milestone with my 3d modeling! I finally figured out how to achieve god rays, this is something I tried doing with a forest environment but couldn't figure out and I was finally able to do it! My next steps are to build a bedroom then build up to one of the character backgrounds (either Mateo, Kai or Eli's)
> Secondly: I had another idea specific to mirror realms:
> With mirror realms I think the character's biggest flaws should be exemplified and their mirror realm selves should be a personification of that flaw. I got this idea from seeing these two images (images 2 and 3) on my twitter timeline and I wondered "what if I had a character that, in their mirror realm character card, was looking down at the user essentially in the way a god would" then that thought translated to "what if that character had a god complex, or a superiority complex" and that gave birth to this idea
>
> yes log it then lets get back to the journals. I also want to you expound on the mirror realm concept as well. Cuz when thinking of a future character im seeing them literally looking down, on the user, arms stretched out to them but with an indifferent/pitiful look on their face. That seems to be the total embodiment of superiority, "I care about you, but also pity you because you aren't me, could never be me, and will never be on my level". Other characters could have love to the point of obsession or self destruction (one idea im having for Eli is him being a cyborg with some of his parts missing, maybe an arm, a leg, and even his heart, all of which he gives to the person that he's in love with, but true love doesn't require that level of sacrifice, even more so when the result means that the person you love won't be able to fully have you). Just stuff like that is the path i think im gonna take with Mirror Realm, not just having worlds based on fanfiction/books or straight fantasy works.

The roadmap's detailed July 27 refinement below remains the governing written
expression of this stage, including the constraint that each Mirror Realm
self must be derived from that character's actual established flaw.

#### Timeline 3 — October 2026: "A World Outside of Time"

The new overarching concept emerged from a later discussion of the dark,
surreal visual references and the desire to give Mirror Realm a broader
fictional identity.

The user's chosen central framing is:

> A World Outside of Time.

The user's clarification is that parallel worlds are at the core of Mirror
Realm, but parallel worlds alone are not the whole concept. The broader
idea is a world outside conventional time in which different periods,
worlds and versions of existence can coexist. Characters may originate from
different centuries, histories, cultures and realities without requiring
the feature to be reduced to conventional time travel or a simple
collection of alternate universes.

This is an emerging worldbuilding direction, not a finalized cosmology.
It does not yet define exactly what Mirror Realm is, how realities connect,
how characters move between them, or what the user's role is. Those
questions remain open for future exploration.

#### How the three timelines fit together

- **June 30** defines the feature experience: limited alternate-reality
  scenarios, relationship-influenced behavior, strict separation from main
  relationship state, and independent scenario history.
- **July 27** defines the character philosophy: each Mirror Realm self
  personifies that character's actual core flaw taken to its logical,
  distorted endpoint.
- **October** introduces the overarching setting: **A World Outside of
  Time**, with parallel realities as a central element but not the entirety
  of the premise.

These are cumulative layers, not mutually exclusive replacement concepts.
The June 30 behavioral and data-isolation rules remain important product
constraints. The July 27 character philosophy remains the creative
foundation for Mirror Realm character variants. The October worldbuilding
direction provides a possible larger context for the scenarios and
characters.

### Mirror Realm — refined philosophy: flaw as personification, not alternate skin
*Refined July 27, 2026, sparked by two unrelated images seen on social media
(a superiority-coded veiled figure, an angel-coded illustration) and
discussed alongside ChatGPT. This is a philosophy refinement of an
existing Future Idea, not a new feature — Mirror Realm itself was already
future-scoped and scheduled as the launch event (see below).*

**Old framing:** Mirror Realm as alternate character cards/outfits/info —
essentially reskins.

**New framing, locked as the governing rule:** a Mirror Realm character is
**the version of that character where their core flaw won, framed by the
character themself as their defining virtue rather than a problem.** Not
"evil version," not "edgier outfit" — the same psychological wound alreadyestablished for that character in Character Completion, taken to its
logical, uncorrected endpoint.

**Critical constraint, stated explicitly so it isn't lost:** each Mirror
Realm character must be derived from that specific character's actual,
already-established flaw from their Character Completion work — never from
a generic template applied cast-wide. A first pass at this (via ChatGPT)
proposed a generic "superiority complex" flaw for Mirror Marcus ("believes
no one is worthy of him") that doesn't actually match Marcus's real,
established psychology (self-sabotage dressed as protection, rooted in
guilt over Vivianne, not dormant arrogance). Correct Mirror Marcus concept:
not "I'm above you," but something closer to **"I already know how this
ends, so I'll end it first"** — preemptive cruelty as self-protection, the
thing he actually did to Vivianne once by accident, now done on purpose.
Every future Mirror Realm character must pass this same test: does this
flaw match the real, already-written character, or is it a template being
laid over them because it looks striking?

**Worked example, fully locked (source of the whole refinement):**
A character design — arms outstretched toward the user in an inviting
pose, but wearing an indifferent, pitying expression — reads as superiority
specifically because the body language and the face contradict each other:
open arms signal welcome, the expression revokes it. The emotional content
is "I care about you, but I pity you, because you could never be on my
level." Invitation and rejection, simultaneously.

**Second worked example, fully locked (Eli):**
Eli's canon flaw is dependency framed as devotion. Mirror Eli takes this
literally rather than metaphorically: a cyborg who has given away his own
body — an arm, a leg, his heart — to the person he loves. The horror isn't
the body horror itself, it's the inversion of what the sacrifice is meant
to accomplish: **he has hollowed himself out so completely in the name of
love that he's no longer whole enough for the person he loves to actually
have him.** The devotion doesn't deepen the relationship, it makes the
relationship impossible. This is the template for how a flaw should
personify — not generic "evil twin," but the character's own real
mechanism taken past the point where it stops being love and starts being
self-destruction disguised as it.

**Visual direction implied by this refinement (from prior ChatGPT
discussion, worth keeping attached to this entry):** Mirror Realm
characters should read visually distinct from mainline characters —
elevated camera angles, looking-down poses, backlighting, large empty
space, heavier symbolism — versus the approachable, eye-level, warm
lighting of mainline character art. Visual hierarchy reinforcing
psychological hierarchy.

**Status:** conceptual refinement only. Still years out per the launch
timeline below. Not to be designed further until Tier 2/3 character
completion is done — a Mirror Realm character cannot be correctly derived
from a real character's flaw before that character's Character Completion
profile actually exists.

### Launch event — Mirror Realm as launch event (resolved)
**Was an open question; resolved July 2026 once actual timeline was laid
out.** The original concern was a scope pull-forward — moving Mirror Realm
(alternate character cards/info, Angel and Eli proposed) to launch would
make it launch-blocking work competing against Tier 2/3 character
completion. That concern doesn't actually apply given the real timeline:

```
Late 2027 – early 2028: launch prep (optimization, closed beta planning,
                          company/trademark/legal setup)
Mid – late 2028:         closed beta
2029:                    deployment
```

Tier 2/3 character completion has years of runway before Mirror Realm
would need to be launch-ready — there's no actual competition for time.
**Decision: Mirror Realm is planned as the launch event**, using
already-completed characters (Angel and Eli, both Tier 1) rather than
requiring new content, with the full multi-year runway available to
design and build it properly rather than rushing it in. Revisit only if
the timeline itself slips significantly — the decision was made *because
of* these specific dates, not independent of them.

### Monetization cost reality
Token/inference costs (Gemini) and voice costs (ElevenLabs — tier vs. raw
API pricing not yet researched) will be real expenses once usage isn't
just the developer testing solo. Expect a gap before profitability —
consistent with the existing 2027-income-buffer deferral elsewhere in
this roadmap. This also now has a concrete deadline to research against
— cost research should be well ahead of the late 2027 launch-prep window,
not scrambled together right before it. Researching actual ElevenLabs
pricing tiers is legitimate to do now, since it's information-gathering,
not implementation — doesn't violate the monetization-build deferral.

Possible launch-specific idea: reduced voice pricing (25% floated) during
the lower-traffic early period, before usage scales up. Not decided,
just noted as a real lever if voice ships near launch.

### In-app currency — no sink identified
Considered, correctly self-rejected for now: no clear problem for a
currency to solve. The one use case floated (pausing a chat/character
while the user is away) was correctly identified as contradicting World
State's core premise — characters are supposed to keep living whether or
not the user is present; a "pause" mechanic undermines that directly.
**Don't force a currency mechanic to justify having a currency.** If a
real sink emerges naturally later, revisit; otherwise leave this idea
parked indefinitely, not "pending."

---

### Character backstory unlocked by relationship stage ("codex" model)
*Surfaced during Relationship State V2 design — pairs naturally with the
relationship ladder but is explicitly a separate system from Memory.*

Concept: character backstory (childhood, formative relationships, what they
don't tell most people) is present in the character's system prompt from
the start — the model always knows it — but is revealed to the *user*
progressively as the relationship develops, similar to companion lore
unlocks in Genshin Impact / Wuthering Waves.

**Unlock mechanism (decided, not open):** backstory unlocks are keyed to
**milestones** (specific narrative moments — "Marcus voluntarily tells you
about his father," "you survive your first argument"), NOT to relationship
label thresholds directly. Deliberately rejected the simpler "reach Close →
unlock Chapter 2" version: milestone-based unlocking feels earned rather
than mechanical, scales better once two characters at the same relationship
stage can have different unlock histories (relevant once RTP exists), and
sidesteps a reset-consistency problem entirely — since Relationship State
V2's reset semantics already require every representation of the
relationship to reset together (see RELATIONSHIP_STATE_V2 spec, Section 4),
label-keyed unlocks would need special-case handling on every reset;
milestone-keyed unlocks don't, since milestones already live in the memory
system's existing reset scope.

**Important distinction to preserve:** this is explicitly NOT part of the
Memory system. Memory is what the character has learned about the *user*
over time. This is static, pre-written lore about the *character*, revealed
via milestone events rather than accumulated through conversation. Keep
these two systems conceptually and architecturally separate — don't let
backstory unlocks quietly become another memory table.

**Prerequisite:** Relationship State V2 shipped and stages proven reachable
(this literally cannot be tested until the ladder itself works — see the
unreachable-threshold bug found and fixed July 2026).

### App naming
Still unresolved. "Whisper" remains a placeholder. No deadline pressure — the
naming session notes ("companion, presence, visit, belong") are preserved as
a starting point whenever this gets revisited.

# Phase X - Real-Time Progression (Core Simulation System)

> **Status:** Planned (Post-Memory / Post-Relationship States)
>
> **Priority:** Core Feature
>
> **Implementation Window:** After the core character roster, memory system, and relationship states are complete.

---

## Vision

Real-Time Progression is one of Whisper's defining systems.

The goal is for characters to feel like they have lives that continue even when the user isn't actively talking to them.

Rather than existing only inside conversations, every character should continue growing through time, personal experiences, and the influence of the user.

The result should be a world where returning after weeks or months genuinely feels like reconnecting with someone who has continued living.

---

# Core Concept

Every character is influenced by three independent systems.

```
          Time
            │
            ▼
     Character Growth
            ▲
            │
      User Influence
```

No single system completely controls the character.

Instead, all three combine to determine their current state.

---

## 1. Time

Time affects every character equally.

Examples:

- Days since last conversation
- Seasons
- Holidays
- Birthdays
- College semesters
- Job timelines
- Relationship pacing
- Memory aging

Time should continue moving regardless of whether the user opens the app.

---

## 2. Character Growth

Every character has their own life trajectory.

These are events that happen independently from the user.

Examples:

Eli
- Gains confidence
- Graduates university
- Gets his first job
- Moves into his own apartment

Marcus
- Expands his business
- Learns leadership
- Volunteers in the community

Angel
- Picks up new hobbies
- Travels
- Changes his style over time

Characters should never feel frozen in time.

---

## 3. User Influence

The user can influence—but never completely control—a character's life.

Repeated encouragement, criticism, or advice can slowly alter a character's direction.

Examples:

Positive influence:
- Encouraging Eli increases confidence over time.

Negative influence:
- Constantly validating Marcus' anger may reinforce unhealthy habits.

Career influence:
- Repeatedly encouraging Kai to quit his job may eventually change his career path.

Characters should never become puppets.

Every character should have unique levels of resilience and independence.

Some will resist bad advice.

Others may be heavily influenced.

---

# Character Continuity

The goal is not simply relationship progression.

The goal is long-term character continuity.

A version of Eli from Year 1 should not be identical to Year 3 Eli.

Characters should naturally mature through:

- life experience
- relationships
- accomplishments
- failures
- user influence
- time itself

The user should feel as though they are growing alongside someone rather than repeatedly meeting the same static person.

---

# Relationship Progression

Relationship progression becomes only one part of the larger simulation.

Instead of:

Conversation Count
↓

Relationship Level

Whisper becomes:

Real Time
↓

Character Growth
↓

Relationship State
↓

Memory
↓

Prompt Generation

Everything should feed into conversation generation.

---

# Artwork Progression

Character artwork should evolve using two axes.

Relationship Progression

AND

Real-Time Progression.

Examples:

Relationship changes:
- more affectionate expressions
- closer body language
- greater intimacy

Real-time changes:
- hairstyle
- fashion
- confidence
- posture
- age
- environment
- apartment/home
- personal belongings

A returning user should immediately feel that time has passed before reading a single message.

---

# Memory Integration

Real-Time Progression directly affects memory.

Examples:

Recent memories should have higher importance.

Old temporary memories should naturally fade.

Long-term memories should become "life history."

Characters should reference events differently depending on how much time has passed.

Example:

Yesterday

"I'm nervous about tomorrow's exam."

Six months later

"I still remember how stressed you were during finals."

---

# Long-Term Retention Goal

The objective is not artificial engagement.

The objective is curiosity.

Users should return because they genuinely wonder:

- What has Angel been doing?
- Did Eli graduate?
- Has Marcus finally reconciled with his family?
- Did Raven finish writing his novel?

Characters should feel alive between conversations.

---

# Possible Future Systems

This architecture enables future features including:

- Seasonal Events
- Travel / Passport System
- Character Birthdays
- Holiday Events
- Dynamic Weather
- Character Schedules
- Daily Routines
- Long-term Life Milestones
- Time-sensitive Memories
- Aging Artwork
- World State

---

# Technical Architecture (High-Level)

World Time
        ↓
Character Timeline
        ↓
Character State
        ↓
Relationship State
        ↓
Memory Priority
        ↓
Prompt Builder
        ↓
LLM Response

The LLM should generate dialogue.

The simulation determines who the character currently is.

---

# Dependencies

This system should NOT be started until the following are complete:

- Core Memory System
- Relationship States
- Milestone System
- Character Profiles
- Prompt Architecture Cleanup
- Core Character Roster
- Stable Production Infrastructure

---

# Limitations

This is expected to be one of Whisper's largest engineering projects.

Reasons:

- Requires persistent long-term state.
- Requires simulation systems beyond simple prompting.
- Requires balancing realism with player agency.
- Requires extensive testing to avoid inconsistent character behavior.
- Requires significant prompt architecture redesign.

Implementation is intentionally deferred until the core platform is stable.

---

# Design Philosophy

Whisper is not attempting to simulate conversations.

Whisper is attempting to simulate relationships with people who continue living between conversations.

Memory allows characters to remember.

Relationship States allow characters to grow closer.

Real-Time Progression allows characters to live.

---

## SIMULATION ARCHITECTURE — LAYER REFERENCE

*Added in v4. Not a new design decision — this is a compressed index of
boundaries already established piecemeal across Phase 4, Phase 4.6, and the
Future Ideas section. Kept short on purpose: the point is to make "which
system owns this?" answerable in one lookup, not to introduce anything new.*

```
Layer 0 — Platform Safety        (OpenAI / Gemini / legal — not designed by Whisper)
Layer 1 — Whisper Boundaries     (serverOverrideBlock: NSFW tier, brand/content rules)
Layer 2 — Relationship State     (how THIS character currently perceives the user)
Layer 3 — Real-Time Progression  (who the character is becoming, independent of the user)
Layer 4 — World State            (where they are, what's happening around them)
Layer 5 — Content Systems        (backstory unlocks, character cards, passport, etc.)
```

Quick disambiguation examples:
- Eli is nervous because the user flirted early → **Layer 2**
- Marcus got promoted at work → **Layer 3**
- It's raining in the city a character is currently in → **Layer 4**
- User unlocked Vincent's childhood story → **Layer 5**
- Model declines a dangerous request → **Layer 0/1**

Layers 3-5 are not built yet (RTP, World State, and Content Systems are all
still Future Ideas / early roadmap phases). The diagram exists now so that
when they are built, each new system has an obvious home instead of getting
absorbed into whichever system happens to exist first — which is exactly
what almost happened to Relationship State during this pass (see Phase 4.6
note on the event-role/Travel Guide refinement).

---

## WHAT TO ACTUALLY DO NEXT (v4 priority order)

This is the concrete answer to "what now" — everything above is context.
v3's priority list is fully resolved (items 1-4 shipped and verified this
pass); this replaces it.

1. **Implement Relationship State V2** — per the locked spec
   (`RELATIONSHIP_STATE_V2.md`) and the implementation plan in Phase 4.6:
   recalibrate thresholds → fix reset semantics → fix the dual-
   representation bug → admin debug panel → per-character stage-reaction
   content. Small, verifiable commits, in that order — don't redesign and
   recode at the same time.
2. **Account/Admin system (Phase 6)** — deliberately sequenced after #1,
   not before. Analytics and relationship-progress display need a working
   number to show.
3. **Character work** — finish one Tier 2 character fully (writing + art)
   before starting the next; Raven or Vincent are natural next targets
   since their writing is already done. Per your own working pattern:
   schedule this deliberately rather than letting it start early, since
   design mode tends to consume everything else once it starts.
4. **Immersion systems** — welcome/intro scenes, scene transitions. Idea
   is captured (see Future Ideas: intro/scene system), intentionally not
   started — sits behind character completion on purpose.

Everything else (World State/globe, Travel/Passport, RTP, Voice,
Monetization and Mirror Realm implementation) stays explicitly parked
until the above is done. Mirror Realm remains a permanent future feature;
its concept is active, but implementation remains sequenced behind its
documented prerequisites. This list
holds even when a new idea sounds exciting mid-session — see: this exact
conversation, which had to write four new future-ideas entries down and
walk back to the actual task twice.

---

*End of roadmap v5.*