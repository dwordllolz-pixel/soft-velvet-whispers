import { ASMR_SOUNDS } from "@/data/asmrSounds";

export interface AsmrDetectionResult {
  cleanText: string;
  triggeredSoundIds: string[];
}

/**
 * Scan text for ASMR onomatopoeia patterns. Returns the text with matched
 * substrings removed (so TTS doesn't try to speak them) plus a list of unique
 * sound IDs that were triggered, in order of first occurrence.
 */
export function detectAndStripAsmrSounds(text: string): AsmrDetectionResult {
  if (!text) return { cleanText: "", triggeredSoundIds: [] };

  let working = text;
  const triggered: string[] = [];

  for (const sound of ASMR_SOUNDS) {
    let matched = false;
    for (const pattern of sound.patterns) {
      // Re-create with global flag so we strip every occurrence.
      const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
      const globalPattern = new RegExp(pattern.source, flags);
      if (globalPattern.test(working)) {
        matched = true;
        working = working.replace(globalPattern, " ");
      }
    }
    if (matched && !triggered.includes(sound.id)) {
      triggered.push(sound.id);
    }
  }

  // Collapse whitespace introduced by stripping.
  const cleanText = working.replace(/\s{2,}/g, " ").trim();

  return { cleanText, triggeredSoundIds: triggered };
}
