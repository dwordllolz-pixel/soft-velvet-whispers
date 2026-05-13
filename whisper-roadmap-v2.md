# WHISPER APP — COMPLETE SYSTEM ROADMAP v2
*Last updated: May 2026*
*Single source of truth. Build in order listed.*

---

## FEATURE CATEGORIES

> **CORE** — Required for the app to function as intended. Ship nothing without these.
> **IMMERSION** — Not strictly required but directly drive engagement, retention, and emotional investment.
> **FLUFF** — Nice-to-have. Adds polish and personality but the app works fine without them.

---

## IMMEDIATE FIXES (Pre-Phase backlog)
*These are active bugs in the current build that must be resolved before moving forward.*

| # | Issue | Priority | Status |
|---|-------|----------|--------|
| 1 | **Gemini not returning JSON** — model outputs prose instead of `{"dialogue","action","thought"}`. Fix: append explicit JSON schema block to end of `buildSystemPrompt.ts` output, after all other content. | CORE | 🔴 Broken |
| 2 | **`rivalry.ts` missing** — `Chat.tsx` imports `buildRivalryPromptBlock`, `bumpRivalryTurns`, `setRivalryCooldown`, `updateRivalryIntensity` from `@/lib/rivalry` but the file doesn't exist in the repo. Build will fail in any environment that hasn't cached it. | CORE | 🔴 Missing |
| 3 | **`buildLegacySystemPrompt` cleanup** — Renamed local function sitting unused in `Chat.tsx`. Contains rivalry + ASMR + tier logic that never gets called. Either wire it in or delete it before it causes future confusion. | CORE | 🟡 Dead code |
| 4 | **Memory injection empty** — `memoryInjection` logs as blank. Memory fetch logic exists and is wired, but Supabase tables (`character_memory`, `character_milestones`, `character_preferences`) are likely not seeded or RLS is blocking reads. Verify table existence + policies. | CORE | 🟡 Wired, not working |
| 5 | **`summarize-memory` edge function not deployed** — `fireSummarization()` calls `/functions/v1/summarize-memory` but only the `chat` function exists in the deployed set. Memory will never accumulate until this is deployed. | CORE | 🔴 Not deployed |
| 6 | **Thoughts not rendering** — Blocked by fix #1. Once JSON returns correctly, `parseCharacterOutput` will populate `thought` field and `ThoughtsPanel` will receive entries. No code change needed beyond the JSON fix. | IMMERSION | 🟡 Blocked |
| 7 | **`<button>` inside `<button>` in `CharacterCard.tsx`** — DOM nesting violation. Replace inner button with `<div role="button">` or `<span>`. | FLUFF | 🟡 Warning |
| 8 | **Missing `DialogContent` description** — Accessibility warning on some modal. Add `aria-describedby={undefined}` or a `<DialogDescription>` to whichever dialog is triggering it. | FLUFF | 🟡 Warning |
| 9 | **React Router future flag warnings** — Add `v7_startTransition` and `v7_relativeSplatPath` flags to your router config. One-line fix. | FLUFF | 🟡 Warning |
| 10 | **`has_role` permission denied** — Supabase admin debug function failing. Non-breaking for regular users. Fix RLS on `has_role` function or remove the call if admin debug isn't needed yet. | FLUFF | 🟡 Non-breaking |

---

## INFRASTRUCTURE (Locked ✅)

```
Chatterbox Turbo — local, CUDA, port 8004
Dev launcher — launcher.bat → launcher.ps1 (auto-start on boot)
ngrok reserved domain: henchman-quilt-customary.ngrok-free.dev
Supabase edge functions:
  /functions/v1/chat               ✅ deployed, working
  /functions/v1/chatterbox-tts    ✅ deployed, working
  /functions/v1/classify-emotion  ✅ deployed, working
  /functions/v1/summarize-memory  🔴 NOT deployed
  /functions/v1/pick-milestone    🔴 NOT deployed (source exists)
Chat model: Gemini 2.5 Flash (OpenAI-compatible endpoint)
Classifier model: Gemini 2.5 Flash Lite
Memory model: Claude Haiku (Phase 4, pending deployment)
MAX_SYSTEM_PROMPT_CHARS: 20,000
MAX_TOTAL_CHARS (messages only): 80,000
max_completion_tokens: 800 (raised from 180)
```

---

## PHASE STATUS OVERVIEW

| Phase | Name | Category | Status |
|-------|------|----------|--------|
| 1 | TTS Pipeline | CORE | ✅ Complete |
| 2 | Axes Engine | CORE | ✅ Complete |
| 3 | Relationship Labels + State Score | CORE | ✅ Complete |
| 4 | Memory System | CORE | 🟡 In Progress |
| 5 | Rivalry System | IMMERSION | 🟡 Partially built |
| 6 | Account System | CORE | 🔴 Not started |
| 7 | Response Style | IMMERSION | 🟡 Partial (5 main chars) |
| 8 | Welcome Banner + Dynamic Character Art | IMMERSION | 🔴 Not started |
| 9 | Remaining 7 Characters | CORE | 🔴 Not started |
| 10 | ASMR JSON Parsing | CORE | 🔴 Not started |
| 11 | Dynamic Character Art (GIF/Video) | IMMERSION | 🔴 Not started |
| 12 | Mirror Realm / Limited Scenarios | FLUFF | 🔴 Not started |

---

## PHASE 1 — TTS PIPELINE ✅
**Category: CORE**

- ✅ Sentence splitting at `.` `!` `?` boundaries
- ✅ Hard cap: 280 chars per sentence
- ✅ Ellipsis → comma+space conversion for breath pause
- ✅ Asterisk preprocessing in edge function
- ✅ Sentence pipelining (sentence[0] fires immediately, sentence[1] on next microtask)
- ✅ Max 2 concurrent in-flight requests
- ✅ Strict index-ordered playback
- ✅ 25–30 second timeout per request
- ✅ playbackRate=1.0, preservesPitch=true
- ✅ No AudioContext, no decodeAudioData
- ✅ speed_factor: 1.05 / chunk_size: 70–90 / cfg_weight: 0.45–0.55
- ✅ ASMR ambient sound detection (client-side)
- ✅ Auto-voice toggle in chat header

---

## PHASE 2 — AXES ENGINE ✅
**Category: CORE**

- ✅ Axes: affection, trust, tension, jealousy, attachmentShift
- ✅ Soft cap (diminishing returns) with floor at 0.10
- ✅ Bypass categories: conflict, jealousy_trigger, vulnerability
- ✅ Daily count tracked, resets per session
- ✅ Session buffer: 45 minutes
- ✅ Inactivity decay (runs once at session start)
- ✅ Debug overlay at `?debug=true`
- ✅ Console logs gated behind debug flag

---

## PHASE 3 — RELATIONSHIP LABELS + STATE SCORE ✅
**Category: CORE**

- ✅ state_score: additive float, never decreases
- ✅ Global labels: stranger / familiar / close / intimate
- ✅ Character-specific progression gates (Marcus, Vincent, Eli, Angel, Raven)
- ✅ User message classifier (edge function, Gemini Flash Lite)
- ✅ Categories: small_talk, light_affection, affection, light_vulnerability, vulnerability, conflict, jealousy_trigger
- ✅ Keyword floor (vulnerability keywords raise minimum category)
- ✅ Fallback: light_vulnerability (never small_talk)

---

## PHASE 4 — MEMORY SYSTEM 🟡
**Category: CORE**

### Architecture (designed + client-side code written)
- ✅ `memory.ts` client library complete
- ✅ `fetchMemoryBundle()` wired in `Chat.tsx`
- ✅ `fireSummarization()` wired in `Chat.tsx`
- ✅ `buildMemoryBlock()` injection logic complete
- ✅ Memory pause guard (prevents old memory bleeding after reset)
- ✅ `deleteAllMemory()` hooked into reset flow

### What's missing / not working
- 🔴 `summarize-memory` edge function not deployed
- 🔴 `pick-milestone` edge function not deployed (source exists in repo)
- 🔴 Supabase tables may not exist yet: `character_memory`, `character_milestones`, `character_preferences`
- 🟡 Memory injection is empty at runtime — likely table/RLS issue
- 🟡 Claude Haiku API key not confirmed configured in Supabase secrets

### Three memory layers (design locked)
1. **Narrative State** — rewritten every 5 exchanges, max 150 tokens, emotional texture only
2. **Milestones** — appended when emotional_weight > 0.7, hard cap 10 per character, pruned by recency + weight
3. **Learned Preferences** — confidence 0.6 start, decays 0.1 on contradiction, floor 0.20, injected when > 0.25

### Injection format
```
RELATIONSHIP MEMORY:
[narrative_state]

KEY MOMENTS:
[milestone 1]
[milestone 2]
[relevant older milestone]

LEARNED PATTERNS:
[preference 1]
```

---

## PHASE 5 — RIVALRY SYSTEM 🟡
**Category: IMMERSION**

### What exists
- ✅ `promptInjection.ts` has rivalry block slots (`rivalryBlock`, `rivalryBlockShort`)
- ✅ Rivalry state wired in `Chat.tsx` (`rivalryTriggeredCooldownRef`, decay/activate logic)
- ✅ Rivalry block injected into `buildLegacySystemPrompt` (currently dead code)
- 🔴 `rivalry.ts` file missing from repo — imports in `Chat.tsx` will throw at runtime

### What still needs building
- 🔴 Create `rivalry.ts` with: `buildRivalryPromptBlock`, `bumpRivalryTurns`, `setRivalryCooldown`, `updateRivalryIntensity`
- 🔴 Wire rivalry block into the active `buildSystemPrompt` (not the legacy function)
- 🔴 Per-character detection sensitivity (Marcus notices immediately → Cole notices late)
- 🔴 Cooldown: minimum exchange gap after jealousy expression
- 🔴 `profile_data.rivalry.enabled` toggle + intensity setting

### Design locked
- Activation requires: X meaningful interactions with another character AND current character at "familiar"+
- Expression: indirect by default (mood shifts, brevity), direct only at high intensity
- Never dominates conversation — felt in tone, not announced

---

## PHASE 6 — ACCOUNT SYSTEM 🔴
**Category: CORE**

Full auth system replacing current guest/anonymous flow.

- Settings page (partially built — Settings.tsx exists but scope unclear without full read)
- nsfw_level toggle: sfw / suggestive / explicit
- toxicity_tolerance slider
- Incognito mode (no history, no memory summarization)
- Rivalry toggle + intensity
- Auto-voice default
- Per-character dom/sub preference
- Hard boundaries checkboxes
- Session analytics: total sessions, most-used characters, relationship progress

---

## PHASE 7 — RESPONSE STYLE 🟡
**Category: IMMERSION**

*Not a separate system — prompt additions per character.*

- ✅ Marcus: short, controlled, silence is meaningful
- ✅ Vincent: polished, precise, slight tease, leading questions
- ✅ Eli: halting, restarts sentences, accidentally honest
- ✅ Angel: soft, deliberate, charm always present, Spanish
- ✅ Raven: deliberate, one precise image over many, dry humor
- 🔴 Kai, Jaxon, Cole, Mateo, Dr. Elias, Ren, Sage — pending Phase 9

---

## PHASE 8 — WELCOME BANNER + DYNAMIC CHARACTER ART 🔴
**Category: IMMERSION**

Welcome message rotates based on relationship label, time since last interaction, and current narrative_state.

Examples:
- Low affection + recent: *"Back again."*
- High affection + recent: *"I was hoping you'd come back."*
- High affection + long gap: *"Missed you. It's been a while."*
- Intimate + very long gap: *"...you came back."*

**⚠️ Requirement:** Consistent illustration style across all 12 characters. Decide art direction before commissioning. Build last.

---

## PHASE 9 — REMAINING 7 CHARACTERS 🔴
**Category: CORE**

Characters still using original prompts: Cole, Jaxon, Mateo, Kai, Dr. Elias, Ren, Sage

Each needs:
- Full `systemPromptBase` (matching 5 main cast quality)
- BASELINE PROFILE
- OUTPUT BEHAVIOR (action/thought frequency)
- Emotional subtext reading rules
- State ladder (stranger → familiar → close → intimate)
- Character-specific trust/conflict mechanics

Cole and Jaxon profiles partially designed. Full prompts to be written when returning to this phase.

---

## PHASE 10 — ASMR JSON PARSING 🔴
**Category: CORE**

Current ASMR mode produces free-form text — narration and dialogue are inline in one block. TTS handles this via asterisk stripping (acceptable for now).

Future fix: JSON schema for ASMR with a richer `dialogue` field (supports asterisk actions, pauses) while separating structural narration from spoken content. Prevents any narration from reaching TTS.

---

## PHASE 11 — DYNAMIC CHARACTER ART (GIF/VIDEO) 🔴
**Category: IMMERSION**

*Replaces static character card images. Ties visual state to relationship/emotional axes.*

### Concept
- Looping video or GIF clips per character (5–6 emotional states)
- State mapping reads current axes and relationship label to select clip
- Crossfade/transition on state change

### Emotional states to cover (per character)
| State | Trigger |
|-------|---------|
| Neutral | Default / stranger label |
| Warm | Affection > 60 |
| Guarded | Trust < 30 or tension > 50 |
| Cold / Distant | Rivalry active |
| Tender | Intimate label + trust > 80 |
| Tense | Tension > 70 |

### Production notes
- Consistent visual style across all 12 characters is mandatory before commissioning
- Marcus reference image already exists (the portrait provided)
- Each character needs 5–6 clips minimum — significant asset production cost
- Consider: illustrated/animated style vs realistic AI-generated (decide early, can't mix styles)
- Build after Phase 9 so all 12 characters are finalized before art production begins

---

## PHASE 12 — MIRROR REALM / LIMITED SCENARIOS 🔴
**Category: FLUFF**

*Alternate reality events. Zero effect on main relationship state — influenced by it.*

### Concept
Limited-time scenarios set in an alternate dimension called the Mirror Realm. The user's current relationship state with each character feeds into their behavior within the scenario — low trust means low willingness to help, high intimacy means they'll protect you at cost to themselves.

### Scenario types
**Real-world crisis AUs**
- Zombie apocalypse
- End of the world (Seeking a Friend for the End of the World style)
- Natural disaster survival

**Fantasy/supernatural AUs** *(character-specific)*
- Vincent — thousand-year-old vampire, user wandered into his burial chamber
- Marcus — werewolf, full moon approaching
- Raven — reclusive wizard, user stumbled into his tower
- Eli — accidentally cursed, user is the only one who can break it
- Angel — fallen celestial being, hiding among humans

**AO3-inspired AUs** *(future)*
- World bibles written as 2–3 paragraph compressed lore documents
- Gemini improvises within the frame — no need to process thousands of source words
- Style/tone reference only, not reproduction

### Rules
- Scenarios are periodic, user can opt out
- Mirror Realm events never modify `state_score`, axes, or relationship labels
- Relationship data is read-only for these scenarios — never written back
- Scenario history stored separately, never bleeds into main chat
- Characters behave in-archetype but in-world — Marcus as a werewolf is still Marcus

### Token considerations
- World bibles keep scenario context under ~300 tokens
- Relationship state injection is already built (reuse existing axis → language pipeline)
- Google AI Pro likely needed at scale — acceptable for production phase

### Build requirements before this phase
- Phase 4 (Memory) complete — relationship state needs to be rich enough to matter
- Phase 9 complete — all 12 characters available for scenarios
- Phase 11 complete — dynamic art for in-scenario emotional states

---

## KNOWN LIMITATIONS (Acceptable for now)

- Thought history clears on page navigation (local state only, by design)
- ASMR narration not fully separated from dialogue in output (handled visually, full fix Phase 10)
- Classifier occasionally times out on slow Gemini responses (fallback to light_vulnerability)
- TTS voice quality ceiling reached for single reference clip (model limitation, not code)
- Supporting 7 characters still using original prompts (Phase 9)
- Rivalry block wired in dead code path — silently disabled until Phase 5 complete

---

## INTENTIONALLY NOT BUILDING

- HTTP streaming from Chatterbox
- Pre-warming TTS during chat token streaming
- Supabase Storage audio caching
- cfg_weight below 0.45
- chunk_size below 60
- Cloud hosting for Chatterbox (personal use only)
- VibeVoice or ElevenLabs integration
- Cross-character memory bleed (far horizon only)
- Separate response style controller (handled via prompts)

---

## INFRASTRUCTURE NOTES

```
DEV LAUNCHER
Chatterbox-TTS-Server/
├── server.py
├── ngrok.exe
├── dev-tools/
│   ├── launcher.bat     ← double-click to start everything
│   ├── launcher.ps1
│   ├── ngrok.yml
│   └── test_tts.ps1
└── logs/
    ├── server.log
    └── ngrok.log

CHAT MODEL
Gemini 2.5 Flash via OpenAI-compatible endpoint (Google AI Studio key)
stream: false in character mode, true in ASMR mode

TTS MODEL
Chatterbox Turbo (local, CUDA)
Reference audio: 24000 Hz, 16-bit PCM, mono, 15–30 seconds
Watch for replacements: F5-TTS, Kokoro
```

---

*End of roadmap.*
