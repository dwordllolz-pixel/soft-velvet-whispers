# Architecture — chat & prompt pipeline

## Frontend chat flow (`Chat.tsx` → edge)

- Send path: session load; optional `fetchMemoryBundle` before request; `classifyUserMessage` runs **in parallel** with chat (does not block reply).
- `sanitizeApiMessages`: user/assistant only; drop empty; collapse consecutive same-role; tail must be `user`.
- `streamChatAttempt`: builds `systemPrompt`, POST `/functions/v1/chat` with `messages`, `systemPrompt`, `characterId`, `asmrType`, `stream` (`false` in character mode).
- Character mode: `resp.json()`; read text from `choices[0].message.content` or `candidates[0].content.parts[0].text`.
- ASMR mode: SSE stream; live delta updates.
- Post-success character: `parseCharacterOutput(result.text)` → message state + thoughts; axes use awaited `categoryPromise`, not model JSON emotion.

## Prompt assembly pipeline

### Active (production)

- `buildSystemPrompt({ characterId, dynamic })` — `src/lib/buildSystemPrompt.ts`.
- Sections joined: `systemPromptBase` → `CORE_RULES` (this file) → `buildDynamicPrompt(dynamic)` → mandatory JSON-only block.
- `dynamic` from `Chat.tsx` / `streamChatAttempt`: `relationshipState`, `emotionalState`, `recentMemory`, `avoidPatterns`.
- Mandatory JSON response contract enforced client-side through prompt instructions, not schema/tool calling.

### `buildDynamicPrompt` (`src/lib/buildDynamicPrompt.ts`)

- Inserts: `RELATIONSHIP`, `EMOTIONAL STATE`, optional `RECENT MEMORY`, optional `AVOID REPEATING`, response-length hints.

### Edge merge (`supabase/functions/chat/index.ts`)

- `finalSystemPrompt` ← client `systemPrompt` when valid.
- `**serverOverrideBlock`:** from `users.profile_data` — NSFW tier + boundaries (server-authoritative).
- `**relationshipBlock`:** optional short line from DB `relationship_label` + `message_count` for `characterId`.
- **Effective system prompt Gemini receives:** **client `systemPrompt` + `serverOverrideBlock` + `relationshipBlock`** (code appends trailing newlines before history).

## Edge `chat` responsibilities

- JWT auth; validate `messages` / char limits; drop `system` turns from history; collapse same-role; enforce last turn = `user`.
- Build Gemini OpenAI-compatible POST (`gemini-2.5-flash`, temperature, `max_completion_tokens`).
- **Only the last 8 sanitized messages** are sent: `sanitizedMessages.slice(-8)`.
- Branch: ASMR vs character (streaming / response shaping).

## JSON parsing (character mode)

- `**parseCharacterOutput`** (local in `Chat.tsx`): `sanitizeJson` → `JSON.parse` → typed `dialogue` / `action` / `thought`.
- **Fallback:** parse failure or bad fields → `dialogue` = raw string; `action` / `thought` = `null`.
- `**ChatMessage.tsx`:** separate JSON display guard; not the same function as `parseCharacterOutput`.

## Emotional classification (`classify-emotion`)

- Client: `classifyUserMessage` → POST `/functions/v1/classify-emotion` `{ message }` with abort timeout.
- Edge: `supabase/functions/classify-emotion/index.ts` — auth, Gemini call, returns `category` from fixed set; weights documented to mirror `EVENT_WEIGHTS`.
- Client: `mergeCategoryFloor(keywordFloor(...), llmCategory)`; errors / non-OK → floor merged with `light_vulnerability`-style failsafe (see `Chat.tsx` comments).
- Used for **axes / relationship math after reply**, not injected into `systemPrompt`.

## Memory injection

- **When:** character mode, character ∈ `MEMORY_CHARACTERS`, user logged in, not incognito, not `isMemoryInjectionPaused(characterId)`.
- `**fetchMemoryBundle`** → result in `**memoryBundleRef**` (send handler).
- `**buildMemoryBlock(bundle, characterId)**` → string `**memoryInjection**` in `streamChatAttempt` if not paused.
- Wired as `**dynamic.recentMemory**` → `RECENT MEMORY:` in `buildDynamicPrompt`.
- Pause: sessionStorage guard; fetch skipped / bundle cleared when paused.

## Character state (axes / label / scores)

- State lives in profile / `CharacterState` (`relationshipAxes`, `types/profile`); persisted under Supabase `users.profile_data`.
- **Prompt strings:** `Chat.tsx` maps label + affection/trust/tension/jealousy to `relationshipState` / `emotionalState` prose (no raw numeric dump in `buildDynamicPrompt`).
- **Post-reply:** classifier category → `bumpExchangeCount`, `applyAxisEvent`, rivalry helpers, etc. (`Chat.tsx` + `relationshipAxes`).

## Dead / inactive code (explicit)

- `**buildLegacySystemPrompt`** (`Chat.tsx`) is **NOT used** in production chat flow — **no callers** in `src/`.
- `**buildDynamicPromptBlock`** (`src/lib/promptInjection.ts`) is **currently inactive** — only referenced from unused `buildLegacySystemPrompt`.

## Supabase

- Auth JWT on edge functions.
- `users.profile_data` for server tier/boundaries + relationship snippet in `chat`.
- Client: `supabase-js` for session, inserts (e.g. `echo_logs`), memory RPCs / tables as implemented in `src/lib/memory.ts`.
- Other edge functions: `classify-emotion`, `summarize-memory`, `pick-milestone`, TTS variants — separate lifecycles.

## Gemini request lifecycle

- Client builds `systemPrompt` + sanitized messages → `chat` edge.
- Edge concatenates **client `systemPrompt` + `serverOverrideBlock` + `relationshipBlock`** for system role.
- Gemini: `messages` = [system] + `sanitizedMessages.slice(-8)`; `stream` per mode.
- Client consumes JSON (character) or SSE (ASMR).
- Character mode currently uses non-stream JSON responses; ASMR mode uses SSE streaming responses.

## Active vs legacy


| Active                                     | Legacy / inactive                        |
| ------------------------------------------ | ---------------------------------------- |
| `buildSystemPrompt` + `buildDynamicPrompt` | `buildLegacySystemPrompt`                |
| `buildMemoryBlock` + ref                   | `buildDynamicPromptBlock`                |
| `buildSystemPrompt.ts` `CORE_RULES`        | `Chat.tsx` `CORE_RULES` (dead path only) |


## Architectural risks

- **Prompt drift:** rivalry / rich `promptInjection` content not on live `buildSystemPrompt` path.
- **Two `CORE_RULES` sources:** only `buildSystemPrompt.ts` affects production; easy to edit wrong file.
- **Dual relationship cues:** client prose + server `relationshipBlock` — possible redundancy or mismatch.
- **Weight sync:** `classify-emotion` vs `relationshipAxes` `EVENT_WEIGHTS` must stay aligned manually.
- **Character mode emotions:** `streamChatAttempt` returns `emotion`/`intensity` null for character path — downstream features assume defaults.
- **Dead code trap:** changes to `buildLegacySystemPrompt` / `promptInjection` silently do nothing for live chat.
- Context pressure risk: large character prompts + memory injection + server blocks reduce available response budget and may increase truncation risk.
- summarize-memory and pick-milestone edge functions not yet deployed — memory never accumulates until both are live.

