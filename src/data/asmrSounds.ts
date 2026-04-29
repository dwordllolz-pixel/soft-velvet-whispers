/**
 * Registry of ASMR ambient sound loops.
 *
 * Each entry maps a set of regex patterns (matched against assistant message
 * text) to a looping audio file. Detection is conservative — only repeated
 * onomatopoeia like "tap... tap... tap" or "click-clack" trigger a sound.
 * Bare narrative words like "tapping his foot" will NOT trigger.
 *
 * Audio files live in /public/sounds/ and are loaded on demand. Missing files
 * fail silently via the <audio> element's onerror handler.
 */
export interface AsmrSound {
  id: string;
  file: string;
  patterns: RegExp[];
}

export const ASMR_SOUNDS: AsmrSound[] = [
  {
    id: "tap",
    file: "/sounds/tapping.mp3",
    patterns: [
      /(\btap\b[\s.,…\-]*){2,}/i,
      /\btap-tap(-tap)?\b/i,
    ],
  },
  {
    id: "scratch",
    file: "/sounds/scratching.mp3",
    patterns: [
      /(\bscratch\b[\s.,…\-]*){2,}/i,
    ],
  },
  {
    id: "click",
    file: "/sounds/clicking.mp3",
    patterns: [
      /\bclick[-\s]?clack\b/i,
      /(\bclick\b[\s.,…\-]*){2,}/i,
    ],
  },
  {
    id: "brush",
    file: "/sounds/brushing.mp3",
    patterns: [
      /(\bbrush\b[\s.,…\-]*){2,}/i,
    ],
  },
];

export function getAsmrSoundFile(id: string): string | undefined {
  return ASMR_SOUNDS.find((s) => s.id === id)?.file;
}
