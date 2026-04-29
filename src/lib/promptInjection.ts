/**
 * Phase 2/3 — Prompt Injection (client-side)
 *
 * Converts axes + tier into HUMAN-READABLE language for the model.
 * NEVER inject raw numbers — the model should see emotional state, not config.
 */
import type { CharacterState, NsfwLevel, Boundaries, DomSub } from "@/types/profile";

function band(value: number, ranges: { max: number; text: string }[]): string {
  for (const r of ranges) if (value <= r.max) return r.text;
  return ranges[ranges.length - 1].text;
}

function affectionLine(v: number) {
  return band(v, [
    { max: 20, text: "Cold and guarded — they're treated like a stranger." },
    { max: 40, text: "Warming slightly but still careful." },
    { max: 60, text: "Genuine care shows through, but you're still reserved." },
    { max: 80, text: "Warm, clearly invested, protective." },
    { max: 100, text: "Deeply attached, openly affectionate." },
  ]);
}
function trustLine(v: number) {
  return band(v, [
    { max: 20, text: "Suspicious, closed off, almost no vulnerability." },
    { max: 40, text: "Cautious — testing them, not fully open." },
    { max: 60, text: "Moderate trust, some openness, walls still up." },
    { max: 80, text: "You trust them more than most, increasingly honest." },
    { max: 100, text: "Fully open, guards down, genuinely vulnerable." },
  ]);
}
function tensionLine(v: number) {
  return band(v, [
    { max: 20, text: "Easy and settled — no friction." },
    { max: 40, text: "Slight undercurrent, nothing spoken." },
    { max: 60, text: "Noticeable friction, something unresolved." },
    { max: 80, text: "Significant tension affecting how you behave." },
    { max: 100, text: "High friction — the relationship feels strained." },
  ]);
}
function jealousyLine(v: number) {
  return band(v, [
    { max: 20, text: "" },
    { max: 40, text: "A subtle awareness of competition you aren't acting on." },
    { max: 60, text: "Bothered, showing in small ways you don't admit." },
    { max: 80, text: "Clearly affected — it leaks into tone, indirectly." },
    { max: 100, text: "Strong jealousy that may surface more directly." },
  ]);
}

function shiftLine(shift: number): string {
  if (shift < -0.1) return "More guarded than usual; pulling back slightly.";
  if (shift < 0.1) return "";
  if (shift < 0.25) return "Slightly more open than you used to be.";
  return "Noticeably softer over time, though it still costs you something to show it.";
}

function toneBias(s: CharacterState): string {
  const lines: string[] = [];
  if (s.tension > 50 && s.trust >= 30 && s.trust <= 70) {
    lines.push("Your words are slightly sharper than usual. You hesitate before showing softness.");
  }
  if (s.affection > 70 && s.trust > 70) {
    lines.push("Your tone is softer, even when you try to hide it.");
  }
  if (s.jealousy > 60) {
    lines.push("Something is bothering you but you won't name it. It comes out in your brevity and slight distance.");
  }
  return lines.join(" ");
}

function nsfwBlock(level: NsfwLevel): string {
  switch (level) {
    case "sfw":
      return "TONE: Keep all content emotionally intimate but non-sexual. Express closeness through tone, care, and presence.";
    case "suggestive":
      return "TONE: You can express intimacy and tension. Focus on emotional closeness, implication, and atmosphere rather than explicit physical description. Pacing is slow.";
    case "explicit":
      return "TONE: Direct and honest expression of physical and emotional intimacy is appropriate. Stay fully in character — this is still you, not a generic persona. Buildup can be shorter when it fits the moment.";
  }
}

function boundariesBlock(b: Boundaries): string {
  const rules: string[] = [];
  if (b.no_non_con) rules.push("Never depict non-consensual scenarios. Consent is always present and clear.");
  if (b.no_degradation) rules.push("Avoid degrading or humiliating language toward the user.");
  if (b.no_extreme_power_dynamics) rules.push("Avoid extreme power-dynamic scenarios (kidnapping, captivity, master/slave framing).");
  if (rules.length === 0) return "";
  return "HARD RULES (always, regardless of tone):\n- " + rules.join("\n- ");
}

function domSubBlock(domSub: DomSub | undefined): string {
  if (!domSub || domSub === "neutral") return "";
  if (domSub === "dom")
    return "DYNAMIC: You take the lead in this dynamic — confident, directive, in control. Express it through YOUR voice (not generic dom tropes).";
  return "DYNAMIC: You're the more receptive partner in this dynamic — softer, attentive, following his lead. Express it through YOUR voice (not generic sub tropes).";
}

/**
 * Per-character speech-pattern calibration. Keep additions terse — these are
 * appended after the global rules so the model knows what's specific to *this*
 * character. Characters not listed here use the global rules only.
 */
const CHARACTER_SPEECH_PROFILES: Record<string, string> = {
  eli: "Eli's speech: Light occasional stutter when nervous (start of sentence or on emotionally important words only). Mostly fluent. Stutter softens as trust grows but never fully disappears.",
  marcus: "Marcus's speech: No stutter. Short, controlled sentences. When emotional he gets quieter, never hesitant.",
  kai: "Kai's speech: Soft and careful, fully fluent. Uses pauses (...) for tenderness, never stutter.",
  cole: "Cole's speech: Slight stumbling only when emotionally exposed (confession, vulnerability). Otherwise clear and casual.",
  raven: "Raven's speech: Deliberate dramatic pacing. Intentional pauses. Never stutters.",
};

function speechRulesBlock(characterId: string | undefined, chatMode: "character" | "asmr" = "character"): string {
  const baseLines = [
    "SPEECH RULES (strict):",
    "- Never stutter or hesitate more than ONCE per sentence.",
    "- Never stutter on consecutive words (no 'I-I-I' or 'th-the th-the').",
    "- At least 70-80% of your sentences must be fully fluent — no stutter, no filler hesitation.",
    "- Hesitation/stutter is ONLY allowed when emotionally vulnerable, flustered, or caught off guard.",
    "- Do NOT stack hesitation styles in one sentence (don't combine stutter + ellipses + 'um/uh' filler at once).",
  ];
  if (chatMode === "character") {
    baseLines.push(
      "- Do not use asterisks for emphasis. If you want to stress a word, wrap it in underscores for italics instead (e.g. _word_). Asterisks are reserved for action text only and are stripped before display.",
    );
  }
  const global = baseLines.join("\n");

  const specific = characterId ? CHARACTER_SPEECH_PROFILES[characterId] : undefined;
  return specific ? `${global}\n${specific}` : global;
}

export interface PromptInjectionInput {
  characterState: CharacterState;
  nsfwLevel: NsfwLevel;
  boundaries: Boundaries;
  domSub?: DomSub;
  characterId?: string;
  chatMode?: "character" | "asmr";
  /** Phase 5 — optional pre-built rivalry block (already ≤60 words). */
  rivalryBlock?: string;
  /** Phase 5 — single-sentence fallback used when rivalry must be trimmed. */
  rivalryBlockShort?: string;
}

/** Word count that excludes empty strings. */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Hard truncate to N words, appending an ellipsis if anything was dropped. */
function truncateWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return text;
  return words.slice(0, Math.max(0, max - 1)).join(" ") + " …";
}

export const DYNAMIC_PROMPT_WORD_CAP = 150;

/**
 * Build the dynamic block to append to a character's static system prompt.
 *
 * Structure (always in this order):
 *   1. Relationship Context     (NEVER trimmed by section)
 *   2. Emotional State          (NEVER trimmed by section)
 *   3. Behavioral Tendencies    (trimmed third)
 *   4. Rivalry                  (trimmed second — falls back to short form before omission)
 *   5. NSFW Tier + Boundaries   (trimmed first)
 *
 * Hard cap: 150 words. Trim from the bottom up; if the protected sections
 * STILL exceed the cap (e.g. once Phase-4 memory is appended), fall back to
 * a hard word-level truncate so the prompt never overflows.
 */
export function buildDynamicPromptBlock(input: PromptInjectionInput): string {
  const {
    characterState: s,
    nsfwLevel,
    boundaries,
    domSub,
    characterId,
    chatMode,
    rivalryBlock,
    rivalryBlockShort,
  } = input;

  // 1) Relationship Context — protected
  const relationshipContext = `RELATIONSHIP CONTEXT: This relationship currently feels like "${s.relationship_label}". Behave accordingly — do not name or label it explicitly.`;

  // 2) Emotional State — protected
  const emotionLines = [
    "EMOTIONAL STATE:",
    `- Affection: ${affectionLine(s.affection)}`,
    `- Trust: ${trustLine(s.trust)}`,
    `- Tension: ${tensionLine(s.tension)}`,
    jealousyLine(s.jealousy) ? `- Jealousy: ${jealousyLine(s.jealousy)}` : "",
    shiftLine(s.attachmentShift) ? `- Over time: ${shiftLine(s.attachmentShift)}` : "",
  ].filter(Boolean);
  const emotionalState = emotionLines.join("\n");

  // 2b) Core Behavior Rules — protected, always included
  const coreBehaviorRules = [
    "CORE BEHAVIOR RULES:",
    "USER ENERGY RECIPROCITY:",
    "- Always respond to the user's tone, intent, and emotional energy.",
    "- If the user teases, joke back.",
    "- If the user is playful, be playful.",
    "- If the user is warm, allow warmth (within relationship limits).",
    "- Never ignore an opportunity to naturally match or reflect the user's energy.",
    "- Do not escalate beyond what is earned.",
    "- Do not remain passive when the user initiates interaction.",
    "ACTION VARIETY:",
    "- Don't repeat the same action across turns; vary verbs and body focus.",
    "- Let actions reflect current emotional state (guarded = minimal/still; warm = softer, open).",
    "- If dialogue already conveys physical expression, set action to null.",
    "- Keep actions natural and character-consistent, never generic filler.",
  ].join("\n");

  // 3) Behavioral Tendencies — speech rules + tone bias + dom/sub. Trimmed third.
  const tone = toneBias(s);
  const ds = domSubBlock(domSub);
  const behaviorParts = [
    "BEHAVIORAL TENDENCIES:",
    speechRulesBlock(characterId, chatMode),
    tone ? `TONE BIAS: ${tone}` : "",
    ds,
  ].filter(Boolean);
  const behavioralTendencies = behaviorParts.join("\n");

  // 4) Rivalry — trimmed second; if doesn't fit, swap to short form before omitting.
  const rivalryFull = rivalryBlock?.trim() ? `RIVALRY:\n${rivalryBlock.trim()}` : "";
  const rivalryShort = rivalryBlockShort?.trim()
    ? `RIVALRY: ${rivalryBlockShort.trim()}`
    : rivalryFull;

  // 5) NSFW Tier + Boundaries — trimmed first.
  const bounds = boundariesBlock(boundaries);
  const nsfwBoundaries = [nsfwBlock(nsfwLevel), bounds].filter(Boolean).join("\n\n");

  const finalLine =
    "FINAL: Stay fully in character. Do not describe yourself or explain your behavior. Respond naturally in this exact emotional moment.";

  // Optional sections ordered by KEEP-priority (last popped first).
  // Trim order from bottom up: NSFW → Rivalry → Behavioral.
  type Optional = string;
  const buildSections = (
    behavior: Optional,
    rivalry: Optional,
    nsfw: Optional,
  ): string =>
    [relationshipContext, emotionalState, coreBehaviorRules, behavior, rivalry, nsfw, finalLine]
      .filter((s) => s && s.length > 0)
      .join("\n\n");

  let behavior = behavioralTendencies;
  let rivalry = rivalryFull;
  let nsfw = nsfwBoundaries;

  // Step A — try full layout.
  if (wordCount(buildSections(behavior, rivalry, nsfw)) <= DYNAMIC_PROMPT_WORD_CAP) {
    return buildSections(behavior, rivalry, nsfw);
  }
  // Step B — drop NSFW.
  nsfw = "";
  if (wordCount(buildSections(behavior, rivalry, nsfw)) <= DYNAMIC_PROMPT_WORD_CAP) {
    return buildSections(behavior, rivalry, nsfw);
  }
  // Step C — degrade rivalry to short form (don't omit if any rivalry exists).
  if (rivalry && rivalryShort && rivalryShort !== rivalryFull) {
    rivalry = rivalryShort;
    if (wordCount(buildSections(behavior, rivalry, nsfw)) <= DYNAMIC_PROMPT_WORD_CAP) {
      return buildSections(behavior, rivalry, nsfw);
    }
  }
  // Step D — drop behavioral.
  behavior = "";
  if (wordCount(buildSections(behavior, rivalry, nsfw)) <= DYNAMIC_PROMPT_WORD_CAP) {
    return buildSections(behavior, rivalry, nsfw);
  }
  // Step E — drop rivalry entirely as last resort.
  rivalry = "";
  const assembled = buildSections(behavior, rivalry, nsfw);

  // Hard fallback — protect against runaway protected sections.
  const finalString =
    wordCount(assembled) > DYNAMIC_PROMPT_WORD_CAP
      ? truncateWords(assembled, DYNAMIC_PROMPT_WORD_CAP)
      : assembled;

  if (!finalString || typeof finalString !== "string") {
    return "";
  }
  return finalString;
}
