/**
 * Extract only dialogue text from a message, stripping action/description text
 * wrapped in *asterisks*. The TTS should only read the white text (dialogue),
 * not the purple text (actions).
 */
export function extractDialogueText(content: string): string {
  return content
    .replace(/\*[^*]+\*/g, "") // Remove *action descriptions*
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Common abbreviations that should NOT terminate a sentence. */
const ABBREVIATIONS = new Set([
  "mr.", "mrs.", "ms.", "dr.", "st.", "jr.", "sr.", "vs.",
  "e.g.", "i.e.", "etc.", "prof.", "sgt.", "lt.", "gen.",
  "no.", "vol.", "fig.", "approx.",
]);

const MIN_FRAGMENT_LEN = 25;
const MAX_SENTENCE_LEN = 280;

/** Split an over-long sentence at commas / natural pauses near the middle. */
function splitLongSentence(s: string): string[] {
  if (s.length <= MAX_SENTENCE_LEN) return [s];
  const out: string[] = [];
  let remaining = s;
  while (remaining.length > MAX_SENTENCE_LEN) {
    // Find a good break point: comma, semicolon, or em-dash near the middle.
    const target = Math.floor(remaining.length / 2);
    const window = remaining.slice(0, MAX_SENTENCE_LEN);
    const breakRegex = /[,;—–]\s+/g;
    let bestIdx = -1;
    let m: RegExpExecArray | null;
    while ((m = breakRegex.exec(window)) !== null) {
      if (m.index > 20 && Math.abs(m.index - target) < Math.abs(bestIdx - target)) {
        bestIdx = m.index + m[0].length;
      }
    }
    if (bestIdx === -1) {
      // No good break — hard split at last whitespace before MAX.
      const ws = remaining.lastIndexOf(" ", MAX_SENTENCE_LEN);
      bestIdx = ws > 20 ? ws + 1 : MAX_SENTENCE_LEN;
    }
    out.push(remaining.slice(0, bestIdx).trim());
    remaining = remaining.slice(bestIdx).trim();
  }
  if (remaining) out.push(remaining);
  return out;
}

/**
 * Split text into sentences for TTS pipelining.
 *
 * Rules:
 *  - Split on `.`, `!`, `?`, `…` followed by whitespace + a capital/quote/opening char.
 *  - Merge forward when:
 *      • fragment ends with a known abbreviation (Dr., e.g., etc.)
 *      • fragment ends with `<digit>.` (decimals like 3.14)
 *      • fragment is shorter than MIN_FRAGMENT_LEN
 *  - Sentences longer than MAX_SENTENCE_LEN are split at commas/semicolons.
 *  - Always returns at least one sentence (the full input as fallback).
 */
export function splitIntoSentences(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];

  // Split on . ! ? (NOT ellipses) followed by whitespace + capital/quote opener.
  // Also split on closing-quote + whitespace + capital letter.
  const raw = clean.split(/(?<=[.!?])\s+(?=["“”'‘’(\[]?[A-Z])|(?<=["”’])\s+(?=[A-Z])/);

  const merged: string[] = [];
  let buffer = "";

  const endsWithAbbrev = (s: string): boolean => {
    const lower = s.toLowerCase();
    for (const abbr of ABBREVIATIONS) {
      if (lower.endsWith(" " + abbr) || lower === abbr) return true;
    }
    return false;
  };

  const endsWithDecimal = (s: string): boolean => /\d\.$/.test(s);

  for (let i = 0; i < raw.length; i++) {
    const piece = raw[i].trim();
    if (!piece) continue;

    buffer = buffer ? `${buffer} ${piece}` : piece;

    const isLast = i === raw.length - 1;
    const tooShort = buffer.length < MIN_FRAGMENT_LEN;
    const shouldMerge =
      !isLast && (tooShort || endsWithAbbrev(buffer) || endsWithDecimal(buffer));

    if (!shouldMerge) {
      merged.push(buffer);
      buffer = "";
    }
  }

  if (buffer) merged.push(buffer);

  // Post-process: split any over-long sentences at natural pauses.
  const final: string[] = [];
  for (const s of merged) {
    final.push(...splitLongSentence(s));
  }

  return final.length ? final : [clean];
}
