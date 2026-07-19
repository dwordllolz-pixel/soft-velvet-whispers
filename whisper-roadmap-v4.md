# WHISPER APP — SYSTEM ROADMAP v4
*Last updated: July 19, 2026*
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
Phase 4.6 below for full detail.

---

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

### Known non-issues (don't touch)
- `permission denied for function has_role` console warning — cosmetic,
  gracefully handled, not application logic (confirmed: only appears in
  auto-generated Supabase types, not called anywhere in `src/`)

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
| 12 | Mirror Realm | FLUFF | 🔴 Superseded — see Phase 13 |
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

### Travel / Passport / Seasonal Destinations
*Supersedes the original Mirror Realm concept — same "limited-time, doesn't
affect main relationship state" design principle, but reframed around
real-world travel rather than alternate-dimension AUs.*

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

Sits meaningfully behind Travel/Passport and the Globe in build order,
since it depends on more of the stack existing first. Recorded here purely
so the idea isn't lost — no further design work warranted until the
systems it depends on are real.

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
Monetization) stays explicitly parked until the above is done. This list
holds even when a new idea sounds exciting mid-session — see: this exact
conversation, which had to write four new future-ideas entries down and
walk back to the actual task twice.

---

*End of roadmap v4.*
