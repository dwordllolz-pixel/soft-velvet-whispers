# RELATIONSHIP STATE V2 — SPECIFICATION
*Locked: July 18, 2026*
*Status: Design complete. Numeric implementation NOT started — see
Implementation Plan at the end, and `whisper-roadmap-v3.md` Phase 4.6 for
how this was found and the priority order it now sits in.*

This document defines what Relationship State means for Whisper, before any
code is changed. It exists because the current implementation was found to
have a real reachability bug (see Origin, below) and the system touches too
much downstream — prompts, memory, RTP, analytics, milestones, character
writing, admin tools — to recalibrate constants without first locking what
the system is supposed to represent.

---

## ORIGIN — why this document exists

Two months of intermittent real-world testing never got a single character
past "stranger," including sessions that reached near-sexual context. An
audit of the actual code (not a redesign from first principles) found two
compounding, mechanical causes:

1. **Unreachable thresholds.** Leaving "stranger" requires
   `affection >= 20 AND trust >= 20`. A genuinely emotionally-loaded
   exchange nets roughly +0.3 to each axis at typical current constants.
   Clearing the threshold requires on the order of 60-70 qualifying
   exchanges, and daily gains are capped after the 8th qualifying exchange
   in a session. At current constants, reaching "acquaintance" requires
   roughly two to three weeks of daily heavy-engagement sessions — longer
   than any single test session could ever reach.
2. **Reset Conversation silently diverging two representations of the same
   relationship.** The reset flow wipes `CharacterState` (axes, label) back
   to defaults while explicitly preserving the memory system's narrative.
   Any reset during testing erased numeric progress while the narrative
   kept describing an established relationship — the exact
   dual-representation risk already flagged as a known risk before this
   audit, now with a concrete reproduction case.

Both are engineering bugs, not design failures. But fixing constants without
first answering "what should this system mean" risks calibrating toward
whatever the current implementation happens to assume, rather than what the
product actually wants. Hence: spec first, code second.

---

## SECTION 1 — PHILOSOPHY

> **Relationship State measures how the character currently perceives and
> feels about the user, based on the accumulated pattern of their
> interactions. It is responsible for emotional interpretation, not
> permission. Relationship State determines how the character emotionally
> receives and responds to ordinary social and romantic interactions.
> Whether a topic is permitted at all is determined by Whisper's separate
> boundary systems, not by Relationship State. Relationship State models
> the interpersonal relationship between the user and the character. It
> does not model the character's personal growth, the passage of time, or
> changes in the wider world, which belong to Real-Time Progression and
> other independent systems.**

### What this rules out, explicitly
- **No romance gates.** There is no relationship tier that unlocks flirting,
  affection, or intimacy as a permission. Every character always receives
  every interaction — the character's current perception determines *how*
  they respond to it, never *whether* they're allowed to receive it.
- **No safety/moderation responsibility.** Relationship State does not
  decide whether a topic is discussed. See the three-layer boundary model
  below — that decision happens before Relationship State is ever consulted.
- **No RTP/World State bleed.** Relationship State never asks "how long have
  we known each other," "what happened in the character's life this week,"
  or "where are we." Those questions belong to systems that don't exist yet
  and must not be simulated early by folding their signals into this one.

### Three-layer boundary model (why safety isn't this system's job)
- **Layer 0 — Platform Safety.** Enforced by the model provider (Gemini).
  Not designed by Whisper, not Whisper's responsibility to enforce.
- **Layer 1 — Whisper Boundaries.** Whisper's own product-level rules — NSFW
  tier, brand-safety topics, anything that's an off-brand or viral-bait risk
  regardless of how close the relationship is. Owned by the existing
  server-side `serverOverrideBlock` (`users.profile_data`), which is
  server-authoritative specifically so it can't be bypassed by prompt
  manipulation. This is where "the user is trying to get a screenshot-bait
  response" gets handled — not by relationship state pretending some topics
  are unreachable at low trust.
- **Layer 2 — Relationship State.** This document. Answers exactly one
  question: *given that an interaction is allowed, how does this character
  currently feel about receiving it?*

If an interaction clears Layers 0-1, Relationship State never blocks it —
it only shapes the response.

### Note on repetition/pressure (a currently-open implementation gap)
Spamming affectionate messages should, psychologically, eventually read as
pressure or overwhelm rather than accumulating as genuine warmth — that's
part of what "perception, not permission" should mean in practice. The
current classifier (`classify-emotion`) evaluates each message in isolation
and has no sense of pace or repetition, so this is not yet true of the
implementation. This is explicitly named as a known limitation (Section 3)
rather than assumed solved.

---

## SECTION 2 — THE RELATIONSHIP LADDER

Six stages. Each one represents a **distinct psychological assumption** the
character makes about the user — not a percentage of accumulated affection.
If two adjacent stages don't produce meaningfully different behavior, they
shouldn't both exist; that test was applied when arriving at six.

**Names are provisional and may change for branding or world-building
without changing the underlying psychological definitions below.** The
definitions are the durable part of this spec; the labels are not.

### Stranger
*"I don't know enough about you to predict you."*
Every interaction is evaluated cautiously. Affection is surprising, not
received as familiar. Conflict carries more weight than it might later.
Silence is ambiguous rather than comfortable.

### Acquaintance
*"I've started building a mental model of you."*
The character begins making small assumptions — "I figured you'd say
that." Recognizable familiarity, not yet emotional investment.

### Getting Close
*"I've begun emotionally investing, not just observing."*
The character starts expecting emotional consistency. Absence is noticed.
Mood is noticed. Affection stops feeling random.

### Close
*"You've become part of my emotional routine."*
Guard is mostly down. The character will initiate contact, will lean on
the user, will miss them.

### Intimate
*"I willingly entrust you with parts of myself I normally protect."*
Not primarily about romance — about safety. The character exposes things
they'd normally guard. This is a matter of choice and trust, not simply
"a vulnerable-tagged message occurred" — see Section 3 on why category
labels don't fully capture this distinction yet.

### Devoted
*"You've become part of how I imagine my future."*
The user is no longer just important — their presence is part of the
character's expected future. The character naturally plans around them,
thinks of them during unrelated moments, feels their absence specifically.

**Devoted is intentionally rare.** Most users should never naturally reach
it during casual use. It represents enduring emotional integration, not
emotional intensity — someone can become Intimate quickly under the right
circumstances; Devotion requires endurance. See Section 7 (Devoted-specific
note) for how V2 approximates that endurance requirement without inventing
new tracked state, and how this is expected to evolve once RTP exists.

### Branch states — explicitly deferred to V3
The current implementation also has branch states (FWB, situationship,
complicated, ex) reachable via specific axis combinations. **These are
out of scope for V2.** Reasoning:
- V2 is validating one hypothesis — can Whisper model a believable
  deepening relationship — not six simultaneous ones. Testing the ladder
  and the branches at the same time means any observed problem could be
  either, with no way to isolate which.
- The current branch triggers were never reachability-tested any more than
  the main ladder's thresholds were — building on them now risks inheriting
  the same class of bug this whole document exists to fix.
- Branches will likely be richer and better-informed once observed usage
  of the main ladder exists, and once RTP/World State exist to give them
  more interesting shape than a static axis-combination label.

**Before any V3 branch ships, its thresholds must be explicitly
reachability-tested against real axis gain rates — not assumed reasonable
by inspection.** That check is a required step, not optional polish; it's
the exact category of gap that caused this whole audit.

---

## SECTION 3 — EVIDENCE MODEL

> **Relationship progression is evidence-based, not time-based. Time allows
> evidence to accumulate, but time alone never advances a relationship.**
> **Relationship progression is not guaranteed. Relationships may plateau,
> regress, or end depending on the accumulated pattern of interactions —
> this is intended behavior, not a bug.**

Evidence is **information that updates the character's internal model of
the user** — not interaction volume, and not category labels by themselves.
Small talk is not evidence, by design (existing `MIN_EVENT_WEIGHT`
filtering already reflects this correctly).

### Transition evidence (psychological, implementation-agnostic)

| Transition | What convinces the character |
|---|---|
| Stranger → Acquaintance | Has enough information to begin forming expectations about the user |
| Acquaintance → Getting Close | Begins emotionally investing in the relationship rather than simply observing it |
| Getting Close → Close | Begins depending on the user's continued presence |
| Close → Intimate | Willingly entrusts the user with parts of themselves they normally protect |
| Intimate → Devoted | Naturally includes the user in their vision of the future |

None of these mention sessions, classifiers, or event categories on
purpose — this table is meant to stay true even if the underlying
implementation changes completely.

### Current V2 approximation
Whisper currently approximates the above using the existing classified
interaction events (`affection`, `light_vulnerability`, `vulnerability`,
`conflict`, etc. — see `EVENT_WEIGHTS` in `relationshipAxes.ts`) and
accumulated relationship axes. This approximation intentionally favors
simplicity over perfect psychological accuracy.

### Known limitations (stated explicitly, not silently assumed solved)
**The current classifier detects message category, not the user's intent
or the pattern across messages.** Concretely, this means two things are not
yet distinguishable by the system, even though the psychology above implies
they should be:
- **Entrusted vs. accidental vulnerability.** A character revealing
  something deeply personal because they *chose* to trust the user reads
  identically, to the classifier, as the same character revealing something
  personal because they're exhausted and it slipped out. Both classify as
  `vulnerability`. The evidence-table definition for Close→Intimate implies
  agency ("willingly entrusts") that the classifier cannot currently verify.
- **Genuine warmth vs. repeated pressure.** Fifty rapid "I love you"
  messages currently classify the same way as five well-spaced ones — the
  classifier has no sense of pace or repetition, so it cannot yet register
  the shift from affection to pressure/overwhelm that Section 1 describes
  as the psychologically correct behavior.

Future versions may incorporate higher-order pattern recognition
(consistency, pacing, reciprocity, reliability, manipulation-detection,
etc.) without changing the philosophy or evidence table above — those are
implementation upgrades, not spec changes. **This is explicitly deferred
to V3 or later, not V2** — V2 already has full scope (philosophy, labels,
evidence, reset semantics, persistence, admin tooling, pacing), and
pattern-detection thresholds can't be responsibly tuned without observed
real usage of a *working* V2 first — the same lesson this whole document
exists to apply.

### Pacing expectations (qualitative — see note)
| Transition | Healthy expectation |
|---|---|
| Stranger → Acquaintance | Usually a few genuinely meaningful exchanges |
| Acquaintance → Getting Close | Consistent positive interaction across more than one sitting |
| Getting Close → Close | Sustained trust accumulated over multiple sessions |
| Close → Intimate | A real moment of chosen vulnerability, not just volume |
| Intimate → Devoted | Sustained intimate-level connection across multiple distinct days — see Section 7 |

**Relationship pacing is intentionally qualitative in this document.**
Numerical thresholds are an implementation detail and may change through
testing without altering the intended experience described above. This is
deliberate: the previous thresholds went untested for months specifically
because they were treated as fixed truths rather than tunable
approximations of a stated target.

---

## SECTION 4 — RESET SEMANTICS

**Standing architectural invariant, applies to everything below and to any
future relationship-adjacent state added later:**

> **Every representation of the relationship must reset together. No
> relationship representation may persist independently of another.**

This is the general-form fix for the exact bug that started this document
(axes reset, memory narrative preserved, producing a contradiction). Any
future addition to relationship-adjacent state (a new score, a new flag, a
new table) must be checked against this rule before shipping: *if Restart
Relationship happens, does this reset too?*

### Clear Chat
Clears visible conversation history only. Relationship axes, label, memory
(narrative/milestones/preferences), RTP, and World State are all untouched.

### Restart Relationship
*(renamed from "Restart Story" — the old name implicitly claimed ownership
over the character's whole narrative, which contradicts Section 1's
boundary against RTP. This button resets **us**, not the character's
entire existence.)*

Resets every representation of the relationship together:
- Relationship axes and label, back to Stranger
- `character_memory` narrative, milestones, and preferences, reset in the
  same operation as the axes — never independently
- Active scene / World State context for that character, if applicable

Leaves account-level state untouched (sessions, purchases, other
characters) — not because it's specially protected, but because character
reset was never coupled to account-level state to begin with.

### Forget Me
Complete wipe for that character: relationship axes, label, memory, RTP
state, World State, and any unlocked content. Equivalent to meeting the
character for the first time.

---

## SECTION 5 — PERSISTENCE

What survives beyond a single reset action, across reinstalls and normal
account lifecycle:

- **Normal app use (reinstall, new device, logging back in on the same
  account):** everything persists as-is — relationship state lives in
  Supabase under the account, not on-device.
- **Clear Chat / Restart Relationship:** see Section 4 — scoped exactly as
  described there, nothing broader.
- **Forget Me:** equivalent to a full per-character wipe. The account
  itself is not deleted — this matches the existing data retention policy
  (6-month inactivity → archival with download window; 1-year → full
  deletion, account preserved) rather than introducing a new concept.
- **Account deletion:** out of scope for this document — governed by the
  existing data retention policy, not by Relationship State semantics.
  Forget Me is a per-character action; account deletion is a separate,
  broader action already defined elsewhere.

No new persistence concept is introduced here — this section exists to
confirm Relationship State's reset actions compose correctly with policy
that already exists, not to define new policy.

---

## SECTION 6 — ADMIN / DEBUG REQUIREMENTS

This system must never again require reverse-engineering thresholds from
observed behavior to understand what's happening — that's exactly what cost
two months of testing this pass.

**Minimum requirement:** an admin/debug view showing raw axis values
(affection, trust, tension, jealousy) alongside the currently-derived label,
live, for the currently-active character. This is cheap to build and pairs
naturally with the broader admin/account rework already planned (Phase 6).

This is a hard prerequisite for the recalibration step in the
Implementation Plan below — constants cannot be responsibly retuned without
being able to see them move in real time.

---

## SECTION 7 — DEVOTED (special case, expanded)

Devoted is called out separately because it's the one stage explicitly
designed to require endurance rather than intensity, and the one most
likely to change shape once Real-Time Progression exists.

**V2 approximation:** axis thresholds equivalent to Intimate, sustained
across multiple distinct calendar days — using `daily_count_date`, which
already exists in `CharacterState` — rather than a raw `message_count`
gate (the current implementation) or any new tracked signal (session
counts, summarization-cycle counts, milestone counts — all considered and
rejected for V2, since they're different-grained versions of the same
"just count something" approach, and several would require new engineering
before they could even be tested).

This closes the specific failure mode identified during design: a single
exceptional four-hour conversation maxing every axis should not produce
Devoted, because devotion implies endurance a single sitting cannot
demonstrate, however intense.

**Forward note, not a V2 commitment:** Devoted is explicitly expected to
gain an additional RTP-supplied condition later (e.g., a minimum
relationship duration, once real elapsed time and life-continuity are
things RTP can actually supply) without needing to redefine what Devoted
*means* — only how V2's simple approximation is eventually supplemented.
This is the concrete version of the "keep V2 clean enough that RTP can add
conditions later without rewriting the existing engine" principle that
governs the whole Relationship State / RTP boundary.

---

## IMPLEMENTATION PLAN

Once resumed, small and independently verifiable commits, in this order —
do not redesign and recode simultaneously:

1. **Recalibrate thresholds.** Pick one lever (raise gain rates OR lower
   label thresholds, not both blindly), recompute reachability against the
   pacing table in Section 3 the same way the original audit did, confirm
   the new numbers actually hit the stated qualitative targets before
   shipping.
2. **Fix Reset Conversation.** Implement Clear Chat / Restart Relationship
   / Forget Me as three distinct, correctly-scoped actions per Section 4.
3. **Enforce the reset invariant in code.** Axes and memory narrative must
   reset together, structurally — not just by convention.
4. **Admin debug panel.** Raw axis values next to the label, live, per
   Section 6. Build this before further tuning, not after.
5. **Per-character relationship-stage reaction content.** Marcus shuts it
   down, Vincent gamifies it, Angel flirts, Mateo has his line, Eli gets
   flustered — per Section 2's definitions. This is content work, the same
   bucket as Character Completion, not new engineering. Guiding principle:
   **confidence, not new behavior** — the same caring personality shows up
   at every stage, just with progressively less hesitation. Don't write
   characters who feel like different people at Stranger vs. Close.

Not part of this plan, deliberately: branch states (Section 2), pattern
recognition (Section 3), full RTP integration (Section 7). All explicitly
deferred, all written down so they aren't lost, none blocking the five
steps above.
