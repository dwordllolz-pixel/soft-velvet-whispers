

## Goal
Detect ASMR onomatopoeia (`tap... tap... tap`, `scratch...`, `click-clack`, etc.) in assistant messages, strip them from the TTS text, and play a matching low-volume ambient loop alongside the voice.

## Approach
All detection happens **client-side** in `useTTS.ts` before text is sent to the edge function. A second `Audio` element plays a looping ambient track underneath the voice.

## New files

**`src/data/asmrSounds.ts`** — registry mapping pattern → audio file:
```ts
export const ASMR_SOUNDS = [
  { id: "tap",     file: "/sounds/tapping.mp3",
    patterns: [/(\btap\b[\s.,…-]*){2,}/i, /\btap-tap(-tap)?\b/i] },
  { id: "scratch", file: "/sounds/scratching.mp3",
    patterns: [/(\bscratch\b[\s.,…-]*){2,}/i] },
  { id: "click",   file: "/sounds/clicking.mp3",
    patterns: [/\bclick[-\s]?clack\b/i, /(\bclick\b[\s.,…-]*){2,}/i] },
  { id: "brush",   file: "/sounds/brushing.mp3",
    patterns: [/(\bbrush\b[\s.,…-]*){2,}/i] },
];
```

**`src/lib/asmrDetect.ts`**
```ts
detectAndStripAsmrSounds(text) → { cleanText, triggeredSoundIds: string[] }
```
Iterates the registry, collects unique IDs, and removes matched substrings so Chatterbox never speaks them.

**`public/sounds/README.md`** — documents required filenames; missing files fail silently via `audio.onerror`.

**`src/lib/asmrDetect.test.ts`** — vitest covering tap repeats, click-clack, scratch, and stripping behavior.

## Edits to `src/hooks/useTTS.ts`

1. After `extractDialogueText`, call `detectAndStripAsmrSounds`. Use `cleanText` for `splitIntoSentences`.
2. Add `ambientRef = useRef<HTMLAudioElement | null>(null)`.
3. When the **first** sentence starts playing, instantiate ambient audio (first triggered ID only — mixing multiple loops gets muddy), set `loop = true`, `volume = 0.18`, and `play()`. Failures are swallowed.
4. Extend `cleanupAll()` and `stop()` to pause + clear `ambientRef`.
5. On the final sentence's `onended`, fade ambient `volume` to 0 over ~600ms then stop.

## Edge function
No changes — preprocessing already strips other markup. Detection lives client-side so we control sound mapping without redeploying.

## Open decisions for you

**1. Sound asset source** (only one needed):
- (a) You upload `tapping.mp3`, `scratching.mp3`, `clicking.mp3`, `brushing.mp3` into `public/sounds/` — code ships ready, files fail silently until added.
- (b) New edge function generates loops via ElevenLabs SFX (requires `ELEVENLABS_API_KEY`) and caches them in storage.
- (c) Reference free CDN samples (less reliable).

**2. Detection scope**:
- (a) **Conservative**: only repeated onomatopoeia (`tap... tap`, `click-clack`). Avoids false triggers on narrative words.
- (b) **Broad**: also trigger on bare gerunds (`tapping`, `scratching`) anywhere in the message.

Default if you don't specify: **(1a) + (2a)** — safest, ships immediately, no false positives.

