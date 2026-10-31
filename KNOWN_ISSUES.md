# Whisper — Known Issues

## Active (needs fixing)

**[BUG] summarize-memory edge function not deployed**

Memory never accumulates across sessions until this is deployed.

pick-milestone has the same problem.

Priority: High — blocks Phase 4 completion.

**[BUG] Memory injection empty at runtime**

memoryInjection logs as blank string at Chat.tsx:511.

Likely cause: Supabase tables (character_memory, character_milestones,

character_preferences) may not exist or RLS is blocking reads.

Priority: High — blocks memory system.

**[BUG] Emotion classifier occasional timeout**

classify-emotion edge function times out (~500ms limit) under load.

Logs: AbortError: signal is aborted without reason

Non-breaking — chat still works, axes just don't update that exchange.

Priority: Medium.

**[BEHAVIOR] Thought frequency may need tuning**

Eli produces thoughts only on emotionally weighted messages.

Casual messages correctly return thought: null but early-stage crush

context may warrant more frequent internal reactions.

Leave until behavioral testing phase.

Priority: Low.

**[BEHAVIOR] Repeated phrasing not fully suppressed**

avoidPatterns block sends repeated phrases to Gemini but model

partially ignores it. "Hoodie strings" appeared twice despite being

in the avoid list.

Priority: Low — tuning pass later.

**[BEHAVIOR] emotion/intensity always null in character mode**

parseCharacterOutput returns emotion: null, intensity: null on the

character path. Downstream features assume defaults.

Non-breaking currently but will matter when emotion display is built.

Priority: Medium.

## Architectural (known risks, not active bugs)

**[RISK] Two CORE_RULES sources**

One in buildSystemPrompt.ts (active), one in Chat.tsx (dead path only).

Easy to edit the wrong file. Dead one should be removed in Phase 5 cleanup.

**[RISK] Dual relationship cues**

Client builds relationshipState prose AND edge adds a server relationshipBlock.

Possible redundancy or mismatch if they fall out of sync.

**[RISK] Rivalry/NSFW/axes prose not on live prompt path**

buildDynamicPromptBlock from promptInjection.ts contains rich behavioral

content (rivalry, tier, boundaries, dom/sub) that never reaches Gemini.

Only wired into dead buildLegacySystemPrompt. Phase 5 work.

**[RISK] EVENT_WEIGHTS sync**

classify-emotion edge function weights must stay manually aligned with

relationshipAxes EVENT_WEIGHTS on the client. No enforcement exists.

**[RISK] JSON formatting depends heavily on prompt compliance**

Character mode currently relies on Gemini obeying the mandatory JSON

response block. There is no schema validation or structured decoding

server-side yet. Malformed JSON falls back to raw dialogue rendering.

Priority: Medium — robust parser/schema layer needed later.

**[RISK] Context window pressure increasing**

Large character prompts + memory injection + server override blocks

already exceed ~1.5k input tokens on some requests. Future additions

(rivalry, milestones, richer memory) may increase latency/cost and

reduce response consistency if prompt size is not managed carefully.

Priority: Medium.

**[RISK] Client-authoritative behavioral state**

Most emotional/relationship prose is assembled client-side before

being sent to Gemini. A desynced or stale client state could create

behavior inconsistencies until more logic is server-authoritative.

Priority: Low for local/dev, higher for public deployment.

## Visual / Asset

**[ASSET] Marcus Familiar video needs clean retry**

Credit exhaustion caused artifacts in second attempt.

Lighting recipe locked. Retry on fresh Luma account.

**[ASSET] Camera drift in Luma generations**

Static camera prompt partially ignored — slow push-in still occurs.

Mitigation: add "no camera drift, fixed frame throughout" explicitly.

Already added to Visual Behavior Bible.

## FLUFF / Low priority

**[FLUFF] CSS @import ordering warning**

Vite reports that the Google Fonts `@import` appears after Tailwind
directives in the application stylesheet.

The production build succeeds. No fix needed for repo-prep.

Priority: Low.

**[FLUFF] Large production JavaScript bundle**

Vite reports a minified JavaScript chunk of approximately 976 KB,
above its 500 KB warning threshold.

The production build succeeds. Consider bundle analysis and code
splitting during a future performance pass.

Priority: Low.

## Deferred (intentional, not bugs)

**[DEFERRED] Existing ESLint baseline**

`npm run lint` currently reports 29 errors and 11 warnings across
the existing codebase.

Not addressed during repo-prep. Track as a separate lint cleanup task.

Priority: Medium.

**[DEFERRED] Remaining dependency security advisories**

After compatible `npm audit fix` updates, 10 audit findings remain:
3 in production dependencies and 7 in development dependencies.

Production findings involve React Router (moderate) and Zod (high).
Development findings involve Vitest/Tinypool, Vite/esbuild, and
PostCSS selector parsing.

The remaining fixes proposed by npm require breaking or major-version
dependency changes. Do not use `npm audit fix --force` as a blanket
remediation. Review each dependency and its actual use before planning
an upgrade. High severity describes the Zod advisory, not an instruction
to upgrade immediately.

Priority: Separate security review; remediation timing to be planned.

**[DEFERRED] React Router future flag warnings**

v7_startTransition and v7_relativeSplatPath flags not set.

Non-breaking. One-line fix when React Router is upgraded.

**[DEFERRED] Missing DialogContent description**

Accessibility warning on an unidentified modal component.

Non-breaking. Fix during UI polish pass.

**[DEFERRED] Streaming architecture full cleanup**

Character mode non-stream path works but some legacy stream

assumptions may still exist in edge function.

Stable enough for now. Clean up in Phase 5.

**[DEFERRED] Dead code cleanup**

Unused prompt systems (buildLegacySystemPrompt, promptInjection.ts)

remain in repository for reference but increase maintenance confusion.

Remove after Phase 5 migration is complete and stable.