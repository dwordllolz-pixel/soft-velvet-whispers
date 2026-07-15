# WHISPER APP — SYSTEM ROADMAP v3
*Last updated: July 13, 2026*
*Rebased on verified codebase state, not assumptions. Every item below was checked
against actual source, not inferred from memory of prior sessions.*

---

## WHAT CHANGED SINCE v2

v2 was written mid-crisis, before the auth/infra saga. That saga is now fully
resolved. This version:
- Marks the entire auth/infra arc as done (it consumed most of June–July)
- Corrects two things v2 said were fixed but weren't (`streamEnabled`, dead code)
- Reflects the real character tier system (3 groups, not "5 main + 7 remaining")
- Removes phases that no longer match how the app is actually built (Mirror Realm
  is superseded by the Travel/Passport concept — kept as a future idea, not deleted)
- Explicitly pushes voice + monetization to "post-income" — tied to 2027 internship
  season, not app readiness

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

## IMMEDIATE FIXES — CARRIED OVER FROM v2, STILL UNRESOLVED
*These were blocked behind the auth saga, not forgotten. Now unblocked.*

| # | Issue | Priority | Status |
|---|-------|----------|--------|
| 1 | `streamEnabled` undefined in ASMR stream reader (`Chat.tsx` line 653) | CORE | 🔴 **Still broken** — v2 marked this "New," it was never actually fixed despite being trivial. Do this first. |
| 2 | `buildLegacySystemPrompt` + dead `CORE_RULES` copy in `Chat.tsx` | CORE | 🔴 **Still present** — confirmed still in code (line 424). References `CHARACTER_MODE_RULES`/`ASMR_MODE_RULES`, undefined elsewhere, would throw if ever called. |
| 3 | Rivalry state computed live, never reaches the model | IMMERSION | 🔴 **Still not wired** — confirmed `rivalryBlock` does not appear anywhere in `buildDynamicPrompt.ts` or `buildSystemPrompt.ts`. Infrastructure (`rivalry.ts`) still only reachable from the dead legacy function. |
| 4 | Memory read path validation | CORE | 🟡 **Partially validated** — pipeline confirmed firing end-to-end (fetch gate → bundle fetch → prompt injection → classifier → Gemini response → summarize check), but tested against an *empty* bundle (fresh user/character pair). Still need: populated-bundle test against an account with existing `character_memory` rows (e.g. the Eli account with the confirmed June write). |
| 5 | `pick-milestone` edge function | CORE | 🟡 Source now exists in `supabase/functions/pick-milestone/` — deployment status unconfirmed, verify with `supabase functions list` |
| 6 | `memory_text` / `emotional_state` column purpose | Schema | 🔴 Still undecided, confirmed zero references to either column anywhere in `memory.ts`. Don't touch until read-path is fully validated with a populated bundle. |
| 7 | React Router future flag warnings | FLUFF | 🔴 Still open, one-line fix |
| 8 | Missing `DialogContent` description | FLUFF | 🔴 Still open, low priority |

**Why these survived so long:** every session since late June got redirected into
auth debugging before reaching this list. Now that auth is genuinely done, this
is the actual next work, not a new discovery.

---

## PHASE STATUS OVERVIEW (v3)

| Phase | Name | Category | Status |
|-------|------|----------|--------|
| 0 | Infrastructure & Auth | CORE | ✅ Complete |
| 1 | TTS Pipeline | CORE | ✅ Complete |
| 2 | Axes Engine | CORE | ✅ Complete |
| 3 | Relationship Labels + State Score | CORE | ✅ Complete |
| 4 | Memory System | CORE | 🟡 Write path complete; read path structurally confirmed, populated-bundle test pending |
| 4.5 | Immediate Fixes (carried over) | CORE | 🔴 Not started — do this before anything new |
| 5 | Rivalry System | IMMERSION | 🔴 State live, injection still not wired |
| 6 | Account System | CORE | 🔴 Not started (guest→account linking now lives here, not in Phase 0) |
| 7 | Response Style | IMMERSION | 🟡 Partial — 3 of 12 at reference quality |
| 8 | Welcome Banner + Dynamic Character Art | IMMERSION | 🔴 Not started |
| 9 | Remaining Characters | CORE | 🟡 Restructured into 3 tiers (see below) — no longer "5 done + 7 to do" |
| 10 | ASMR JSON Parsing | CORE | 🔴 Not started |
| 11 | Dynamic Character Art | IMMERSION | 🟡 In progress, bottleneck is generation quality not code |
| 12 | Mirror Realm | FLUFF | 🔴 Superseded — see Phase 13 |
| 13 | Travel / Passport / Seasonal Destinations | FLUFF | 💡 New concept, explicitly deferred — see Future Ideas section |
| 14 | Voice & Monetization | — | 💡 Explicitly deferred to 2027 — see note below |

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

## PHASE 4 — MEMORY SYSTEM 🟡
**Category: CORE**

### Status update from v2
Write path: ✅ confirmed via June test (Eli narrative_state write).
Read path: 🟡 **structurally confirmed, behaviorally unvalidated.**

The July 13 Raven test proved the *pipeline* works — gate check fires,
`fetchMemoryBundle` runs, result flows into `buildDynamicPrompt`, injection
happens, classifier runs in parallel, Gemini responds, summarize-check fires
post-reply. Every stage of the chain is provably connected.

What it did NOT prove: whether a *populated* memory bundle actually changes
model behavior. The Raven test used a fresh user/character pair — bundle was
correctly `null`. This is expected behavior, not a bug, but it means the
original Phase 4 goal ("character references prior conversation content not
visible in current message history") is still unverified.

### Next concrete test (do this before anything else in Phase 4)
1. Sign in as the real Google account tied to the existing Eli
   `character_memory` row (narrative: "user maintains stable trust... openness
   moderate... attachment distant")
2. Open a fresh conversation with Eli
3. Confirm `[memory] bundle fetched` returns non-null narrative
4. Confirm `[debug] memoryInjection:` is non-empty (was empty in the Raven log
   — correctly, since that bundle was null)
5. Say something that references the *relationship dynamic*, not specific
   facts (since narrative_state is a relationship snapshot, not a fact log)
   — e.g. does Eli's tone reflect "distant attachment, moderate openness"
   without being told?

### Unchanged from v2 (still accurate)
- Single extraction pass architecture (deployed, working)
- Schema: `relationship_state` jsonb, `first_seen` on preferences
- Narrative rewrite logic, milestone dedup, preference decay — all unchanged,
  don't touch until populated-bundle test passes
- `memory_text` / `emotional_state` decision still deferred

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

## WHAT TO ACTUALLY DO NEXT (v3 priority order)

This is the concrete answer to "what now" — everything above is context.

1. **`streamEnabled` fix** — one line, zero risk, still broken
2. **Delete dead code** — `buildLegacySystemPrompt`, dead `CORE_RULES`, related
   dead imports in `Chat.tsx`
3. **Wire rivalry block** into live `buildDynamicPrompt` → `buildSystemPrompt`
   path (infrastructure already exists on both ends per v2 audit — still true)
4. **Populated-bundle memory read-path test** — sign in as the Eli account,
   confirm behavioral recall
5. **Character work** — finish one Tier 2 character fully (writing + art)
   before starting the next; Raven or Vincent are natural next targets since
   their writing is already done

Everything else (Account System linking, Travel/Passport, Voice, Monetization)
stays explicitly parked until the above is done.

---

*End of roadmap v3.*
