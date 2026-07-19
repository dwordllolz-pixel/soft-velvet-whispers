# Character Configuration Review
*Written: July 2026. Documents what the CURRENT `CHARACTER_AXIS_CONFIG`
values imply psychologically. No values changed. For designer review ahead
of Character Completion — mark each character ✓ correct or ✗ needs rework
as your character direction solidifies (per Sage, some already will).*

## How to read this

Each character has three levers today:
- **`attachmentBaseline`** — a text label (not read by any logic, purely
  documentary in the current code) intended to describe attachment style.
- **`volatility`** (0-1) — scales how much every axis event affects this
  character. Higher = bigger swings in both directions, faster *and* more
  extreme movement. Currently doing double duty: it's meant to represent
  emotional reactivity, but because it also scales axis gain, it
  indirectly controls *how fast the relationship can progress at all* —
  see the pattern flagged below.
- **`attachmentProfile.trust_gain_rate`** — multiplier specifically on
  trust gained per positive/vulnerable exchange. Independent of volatility.
- **`attachmentProfile.trust_loss_rate`** — same, for trust lost on
  negative exchanges.

"Exchanges to acquaintance / intimate" below use the recalibrated July 2026
thresholds (`RELATIONSHIP_THRESHOLDS`, see `RELATIONSHIP_STATE_V2.md`) and
assume a mix of `affection`/`light_vulnerability`-weighted exchanges — the
same calculation used to validate the threshold recalibration itself.

## ⚠️ Pattern worth reviewing across the whole cast

**All three characters labeled `"secure"` (Jaxon, Dr. Elias, Sage) are
currently the three *slowest* characters to reach Acquaintance** — 27, 31,
and 36 exchanges respectively, against a cast average of ~21. Meanwhile the
avoidant-labeled characters (Marcus, Ren) reach Acquaintance fastest.

Observation: `volatility` currently influences both emotional reactivity
and progression speed at the same time — a low-volatility character reads
as both "emotionally steady" and "slow to reach any given relationship
stage," since the same number drives both effects. Whether that coupling
matches each character's intended personality is a question for Character
Completion, not something this document resolves. Recorded here so it's
visible during that review rather than buried in constants.

---

## Marcus
```
attachmentBaseline: "avoidant-chaotic"
volatility: 0.90 (highest in cast)
trust_gain_rate: 0.60 (lowest in cast)
trust_loss_rate: 1.40 (highest in cast)
```
**Current implication:** Big, fast emotional swings (high volatility) but
trust itself is hard-won (lowest gain rate) and easily lost (highest loss
rate). Reads as: intense in the moment, but doesn't translate intensity
into durable trust easily, and one bad exchange costs a lot. Internally
consistent with "avoidant-chaotic" as a label — this one reads correctly.
**Exchanges to Acquaintance: ~17. To Intimate: ~59.**

✓ / ✗ — _______________

---

## Eli
```
attachmentBaseline: "anxious-secure"
volatility: 0.50 (mid)
trust_gain_rate: 1.10 (above average)
trust_loss_rate: 0.90 (below average)
```
**Current implication:** Moderate emotional swings, trusts a bit faster
than average and doesn't lose trust easily once given. Matches "wants
connection, anxiety slows him down but doesn't block him" — consistent
with how he's been written and tested (see July 2026 test sessions).
**Exchanges to Acquaintance: ~22. To Intimate: ~76.**

✓ / ✗ — _______________

---

## Jaxon
```
attachmentBaseline: "secure"
volatility: 0.40 (low)
trust_gain_rate: 1.00 (average)
trust_loss_rate: 0.70 (low)
```
**Current implication:** Low reactivity, average trust formation, hard to
lose once trusted. Reads as steady and stable — which is a reasonable
translation of "secure" — but the low volatility makes him one of the
slower characters to reach Acquaintance at all (27 exchanges), which is a
different thing from stability once there. Worth checking whether this
matches intended direction or is the same volatility-conflation issue
flagged above.
**Exchanges to Acquaintance: ~27. To Intimate: ~96.**

✓ / ✗ — _______________

---

## Raven
```
attachmentBaseline: "anxious-avoidant"
volatility: 0.75 (high)
trust_gain_rate: 0.80 (below average)
trust_loss_rate: 1.10 (above average)
```
**Current implication:** Reactive and intense, trust is somewhat hard to
build and easier than average to lose. Matches an anxious-avoidant
push-pull dynamic reasonably well.
**Exchanges to Acquaintance: ~15 (fastest in cast). To Intimate: ~53.**

✓ / ✗ — _______________

---

## Angel
```
attachmentBaseline: "playful-secure"
volatility: 0.65 (above average)
trust_gain_rate: 1.00 (average)
trust_loss_rate: 0.80 (below average)
```
**Current implication:** Warm and expressive (higher volatility reading as
enthusiasm rather than instability, given the "playful" framing), trusts
at an average rate, doesn't lose it easily. Reasonably consistent.
**Exchanges to Acquaintance: ~17. To Intimate: ~59.**

✓ / ✗ — _______________

---

## Vincent
```
attachmentBaseline: "secure-territorial"
volatility: 0.50 (mid)
trust_gain_rate: 0.90 (slightly below average)
trust_loss_rate: 0.85 (below average)
```
**Current implication:** Even-keeled, trust builds a bit slower than
average but is well-retained once established. "Territorial" isn't
strongly expressed in these particular numbers (would show up more in
jealousy_trigger, which is separate from this axis set) — worth checking
that's intentional.
**Exchanges to Acquaintance: ~22. To Intimate: ~76.**

✓ / ✗ — _______________

---

## Mateo
```
attachmentBaseline: "anxious-secure"
volatility: 0.60 (above average)
trust_gain_rate: 1.15 (above average)
trust_loss_rate: 0.85 (below average)
```
**Current implication:** Reactive and quick to trust, forgiving once
trust exists. Reads as emotionally open and eager to connect.
**Exchanges to Acquaintance: ~18. To Intimate: ~64.**

✓ / ✗ — _______________

---

## Kai
```
attachmentBaseline: "anxious-secure"
volatility: 0.60 (above average)
trust_gain_rate: 1.20 (highest in cast)
trust_loss_rate: 0.80 (below average)
```
**Current implication:** Fastest trust formation in the whole cast,
reactive, trust well-retained. Matches "overshares constantly, forms
connections quickly" from prior discussion well — this is probably the
most internally consistent config in the cast relative to how Kai's
personality has already been described.
**Exchanges to Acquaintance: ~18. To Intimate: ~64.**

✓ / ✗ — _______________

---

## Dr. Elias
```
attachmentBaseline: "secure"
volatility: 0.35 (2nd lowest in cast)
trust_gain_rate: 1.00 (average)
trust_loss_rate: 0.75 (low)
```
**Current implication:** Very low reactivity, average trust gain, hard to
lose once trusted. Same pattern as Jaxon and Sage — "secure" label paired
with low volatility produces one of the slowest-to-reach-Acquaintance
configs in the cast (31 exchanges). Tier 3, not yet started — flagging now
so it's visible before any writing begins.
**Exchanges to Acquaintance: ~31. To Intimate: ~109.**

✓ / ✗ — _______________

---

## Ren
```
attachmentBaseline: "avoidant"
volatility: 0.85 (2nd highest in cast)
trust_gain_rate: 0.50 (lowest in cast, tied)
trust_loss_rate: 1.50 (highest in cast)
```
**Current implication:** Highly reactive, trust is the hardest to earn in
the entire cast and the easiest to lose. Strongly and consistently
expresses "avoidant" — probably the cleanest label-to-numbers match in the
cast, alongside Kai.
**Exchanges to Acquaintance: ~21. To Intimate: ~75.**

✓ / ✗ — _______________

---

## Cole
```
attachmentBaseline: "anxious"
volatility: 0.55 (mid)
trust_gain_rate: 1.10 (above average)
trust_loss_rate: 0.95 (average)
```
**Current implication:** Moderate reactivity, trusts a bit faster than
average, average trust retention. Reads as a milder version of the
anxious-secure characters without the "secure" stabilizing half — plausible
for a still-developing Tier 3 character, not yet started.
**Exchanges to Acquaintance: ~20. To Intimate: ~69.**

✓ / ✗ — _______________

---

## Sage
```
attachmentBaseline: "secure"
volatility: 0.30 (lowest in cast)
trust_gain_rate: 0.90 (below average)
trust_loss_rate: 0.70 (low)
```
**Current implication:** Lowest reactivity AND below-average trust gain —
this is the character where the "secure = slow" pattern above is most
pronounced, and per discussion this week, Sage's direction has already
moved away from what this config implies (new direction: smoke-shop
setting, approachable/warm on the surface, layered rather than guarded —
"easy to talk to, hard to deeply understand," which is a different shape
of guardedness than what low-volatility-plus-low-trust-gain currently
produces). **Flagged as actively wrong by the person who'd know** — this
entry exists mainly to make the gap between old-Sage-numbers and
new-Sage-direction visible and quantified, not to suggest a fix.
**Exchanges to Acquaintance: ~36 (slowest in cast). To Intimate: ~127.**

✗ — confirmed needs rework, redesign in progress

---

## Summary table

| Character | Baseline label | Exch → Acquaintance | Exch → Intimate | Label/number match? |
|---|---|---|---|---|
| Raven | anxious-avoidant | 15 (fastest) | 53 | ✓ reasonable |
| Marcus | avoidant-chaotic | 17 | 59 | ✓ reasonable |
| Angel | playful-secure | 17 | 59 | ✓ reasonable |
| Mateo | anxious-secure | 18 | 64 | ✓ reasonable |
| Kai | anxious-secure | 18 | 64 | ✓ strong match |
| Cole | anxious | 20 | 69 | ✓ plausible (Tier 3) |
| Eli | anxious-secure | 22 | 76 | ✓ matches testing |
| Vincent | secure-territorial | 22 | 76 | ⚠ territorial not expressed here |
| Ren | avoidant | 21 | 75 | ✓ strong match |
| Jaxon | secure | 27 | 96 | ⚠ secure-but-slow pattern |
| Dr. Elias | secure | 31 | 109 | ⚠ secure-but-slow pattern |
| Sage | secure | 36 (slowest) | 127 | ✗ confirmed needs rework |

Nothing in this document changes any code. Use it as a checklist during
Character Completion — the numbers are cheap to change once you know what
each character is actually supposed to feel like; the goal here was just
making the current implications legible instead of buried in constants.
