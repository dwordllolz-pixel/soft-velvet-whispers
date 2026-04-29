/**
 * Phase 2 — Relationship Axes Engine
 *
 * Pure functions. No I/O. All axis updates are EVENT-DRIVEN — never tick
 * passively on message count alone.
 */

import type { CharacterState, Preferences } from "@/types/profile";
import { DEFAULT_CHARACTER_STATE } from "@/types/profile";

export interface AttachmentProfile {
  trust_gain_rate: number;
  trust_loss_rate: number;
  jealousy_trigger: number;
  affection_expression: number;
}

export interface CharacterAxisConfig {
  attachmentBaseline: string;
  /** 0–1 */
  volatility: number;
  /** 0–1 */
  adaptability: number;
  attachmentProfile: AttachmentProfile;
}

/**
 * Per-character static config. Keep in sync with src/data/characters.ts ids.
 * Defaults applied for any character not listed here.
 */
export const CHARACTER_AXIS_CONFIG: Record<string, CharacterAxisConfig> = {
  marcus: {
    attachmentBaseline: "avoidant-chaotic",
    volatility: 0.9,
    adaptability: 0.3,
    attachmentProfile: { trust_gain_rate: 0.6, trust_loss_rate: 1.4, jealousy_trigger: 0.7, affection_expression: 0.4 },
  },
  eli: {
    attachmentBaseline: "anxious-secure",
    volatility: 0.5,
    adaptability: 0.8,
    attachmentProfile: { trust_gain_rate: 1.1, trust_loss_rate: 0.9, jealousy_trigger: 0.6, affection_expression: 0.85 },
  },
  jaxon: {
    attachmentBaseline: "secure",
    volatility: 0.4,
    adaptability: 0.6,
    attachmentProfile: { trust_gain_rate: 1.0, trust_loss_rate: 0.7, jealousy_trigger: 0.45, affection_expression: 0.95 },
  },
  raven: {
    attachmentBaseline: "anxious-avoidant",
    volatility: 0.75,
    adaptability: 0.45,
    attachmentProfile: { trust_gain_rate: 0.8, trust_loss_rate: 1.1, jealousy_trigger: 0.55, affection_expression: 0.6 },
  },
  angel: {
    attachmentBaseline: "playful-secure",
    volatility: 0.65,
    adaptability: 0.7,
    attachmentProfile: { trust_gain_rate: 1.0, trust_loss_rate: 0.8, jealousy_trigger: 0.5, affection_expression: 0.9 },
  },
  vincent: {
    attachmentBaseline: "secure-territorial",
    volatility: 0.5,
    adaptability: 0.55,
    attachmentProfile: { trust_gain_rate: 0.9, trust_loss_rate: 0.85, jealousy_trigger: 0.5, affection_expression: 0.85 },
  },
  mateo: {
    attachmentBaseline: "anxious-secure",
    volatility: 0.6,
    adaptability: 0.7,
    attachmentProfile: { trust_gain_rate: 1.15, trust_loss_rate: 0.85, jealousy_trigger: 0.55, affection_expression: 0.95 },
  },
  kai: {
    attachmentBaseline: "anxious-secure",
    volatility: 0.6,
    adaptability: 0.7,
    attachmentProfile: { trust_gain_rate: 1.2, trust_loss_rate: 0.8, jealousy_trigger: 0.5, affection_expression: 0.9 },
  },
  "dr-elias": {
    attachmentBaseline: "secure",
    volatility: 0.35,
    adaptability: 0.5,
    attachmentProfile: { trust_gain_rate: 1.0, trust_loss_rate: 0.75, jealousy_trigger: 0.4, affection_expression: 0.7 },
  },
  ren: {
    attachmentBaseline: "avoidant",
    volatility: 0.85,
    adaptability: 0.2,
    attachmentProfile: { trust_gain_rate: 0.5, trust_loss_rate: 1.5, jealousy_trigger: 0.75, affection_expression: 0.35 },
  },
  cole: {
    attachmentBaseline: "anxious",
    volatility: 0.55,
    adaptability: 0.75,
    attachmentProfile: { trust_gain_rate: 1.1, trust_loss_rate: 0.95, jealousy_trigger: 0.6, affection_expression: 0.95 },
  },
  sage: {
    attachmentBaseline: "secure",
    volatility: 0.3,
    adaptability: 0.45,
    attachmentProfile: { trust_gain_rate: 0.9, trust_loss_rate: 0.7, jealousy_trigger: 0.4, affection_expression: 0.75 },
  },
};

const DEFAULT_AXIS_CONFIG: CharacterAxisConfig = {
  attachmentBaseline: "secure",
  volatility: 0.5,
  adaptability: 0.5,
  attachmentProfile: { trust_gain_rate: 1.0, trust_loss_rate: 1.0, jealousy_trigger: 0.5, affection_expression: 0.7 },
};

export function getAxisConfig(characterId: string): CharacterAxisConfig {
  return CHARACTER_AXIS_CONFIG[characterId] ?? DEFAULT_AXIS_CONFIG;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Phase 3 — Event weighting.
 *
 * Every model exchange is classified into one of these semantic categories.
 * Weights below MIN_EVENT_WEIGHT are skipped entirely so casual conversation
 * does NOT meaningfully move the axes. The final delta is:
 *
 *     delta = baseDelta × weight × volatility
 */
/**
 * Phase 3+ — user-message emotion categories. Source of truth is now the
 * dedicated `classify-emotion` edge function (Gemini 2.5 Flash Lite) which
 * classifies the USER'S message, not the assistant's reply.
 *
 * `emotional_openness` is kept ONLY for back-compat in legacy code paths
 * (e.g. older mappings); the new classifier never returns it.
 */
export type EventCategory =
  | "small_talk"
  | "light_affection"
  | "affection"
  | "light_vulnerability"
  | "vulnerability"
  | "conflict"
  | "jealousy_trigger"
  | "emotional_openness";

export const EVENT_WEIGHTS: Record<EventCategory, number> = {
  small_talk: 0.1,
  light_affection: 0.4,
  affection: 0.55,
  light_vulnerability: 0.55,
  emotional_openness: 0.6,
  conflict: 0.7,
  jealousy_trigger: 0.8,
  vulnerability: 1.0,
};

/**
 * Ordering by emotional intensity. Used to merge the keyword-floor result
 * with the LLM classifier result via `mergeCategoryFloor` — the more
 * intense category always wins.
 */
export const CATEGORY_INTENSITY: Record<EventCategory, number> = {
  small_talk: 0,
  light_affection: 1,
  affection: 2,
  light_vulnerability: 3,
  emotional_openness: 3,
  vulnerability: 4,
  conflict: 5,
  jealousy_trigger: 6,
};

export function mergeCategoryFloor(floor: EventCategory, llm: EventCategory): EventCategory {
  return CATEGORY_INTENSITY[floor] >= CATEGORY_INTENSITY[llm] ? floor : llm;
}

/**
 * Cheap keyword floor applied BEFORE the LLM classifier. If the user's
 * normalized message contains any of these tokens, we guarantee at least
 * `light_vulnerability` so the model can never downgrade an obvious
 * struggle to `small_talk`.
 */
const VULNERABILITY_FLOOR_KEYWORDS = [
  "struggling",
  "not okay",
  "bad time",
  "stressed",
  "lonely",
  "can't cope",
  "cant cope",
  "don't know how to deal",
  "dont know how to deal",
  "haven't been okay",
  "havent been okay",
  "haven't told anyone",
  "havent told anyone",
];

export function keywordFloor(normalized: string): EventCategory {
  for (const kw of VULNERABILITY_FLOOR_KEYWORDS) {
    if (normalized.includes(kw)) return "light_vulnerability";
  }
  return "small_talk";
}

export function isValidCategory(s: string): s is EventCategory {
  return s in EVENT_WEIGHTS;
}

export const MIN_EVENT_WEIGHT = 0.2;

/**
 * Categories that BYPASS the MIN_EVENT_WEIGHT threshold. Conflict, jealousy
 * triggers, and vulnerability are emotionally load-bearing — they must
 * always register at full weight, even in long conversations where
 * diminishing returns would otherwise eat them.
 */
export const BYPASS_CATEGORIES: readonly EventCategory[] = [
  "conflict",
  "jealousy_trigger",
  "vulnerability",
];

export function isBypassCategory(c: EventCategory): boolean {
  return BYPASS_CATEGORIES.includes(c);
}

/**
 * Phase 3 — soft cap (diminishing returns).
 * After the daily threshold, axis movement attenuates rapidly so a single
 * marathon session can't grind a relationship to "devoted" in one sitting.
 * Bypass categories ignore this multiplier.
 */
export function getDiminishMultiplier(dailyCount: number): number {
  let v: number;
  if (dailyCount <= 8) v = 1;
  else if (dailyCount === 9) v = 0.6;
  else if (dailyCount === 10) v = 0.4;
  else if (dailyCount === 11) v = 0.2;
  else v = 0.1;
  // Floor clamp — never let long conversations feel completely dead.
  return Math.max(0.1, v);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Session-buffer grace window. If a new calendar day begins but the last
 * interaction was within this many minutes ago, treat it as the SAME
 * session (no count reset). This closes the 11:59 → 12:01 exploit where
 * a user could otherwise refresh their daily soft-cap by waiting 2 minutes.
 */
const SESSION_BUFFER_MIN = 45;

/**
 * Increment the per-day counter. Resets when the day rolls over UNLESS
 * the last interaction was within SESSION_BUFFER_MIN minutes (anti-exploit).
 * Returns the next state and the count AFTER incrementing.
 */
export function tickDailyCount(state: CharacterState): { state: CharacterState; count: number } {
  const today = todayISO();
  const sameDay = state.daily_count_date === today;

  let continueSession = sameDay;
  if (!sameDay && state.last_interaction) {
    const minutesSince = (Date.now() - new Date(state.last_interaction).getTime()) / 60000;
    if (minutesSince < SESSION_BUFFER_MIN) continueSession = true;
  }

  const next = continueSession ? (state.daily_count ?? 0) + 1 : 1;
  return {
    state: { ...state, daily_count: next, daily_count_date: today },
    count: next,
  };
}

/**
 * Classify a model emotion tag into an event category. Used to decide
 * whether the exchange is meaningful enough to move axes at all.
 */
export function classifyEvent(
  emotion: string | null | undefined,
  intensity: number | null | undefined,
): EventCategory {
  const i = typeof intensity === "number" ? intensity : 1;
  switch (emotion) {
    case "vulnerable":
      return "vulnerability";
    case "tender":
    case "soothing":
    case "protective":
      return "light_affection";
    case "sensual":
      return i >= 3 ? "emotional_openness" : "light_affection";
    case "intense":
      return "conflict";
    case "jealous":
    case "possessive":
      return "jealousy_trigger";
    case "commanding":
      return "emotional_openness";
    default:
      return "small_talk";
  }
}

/**
 * Event types. Each represents something the user/character actually did.
 * Magnitudes are SMALL on purpose — relationships are earned, not grinded.
 */
export type AxisEvent =
  | { kind: "positive_exchange"; magnitude?: number }
  | { kind: "vulnerable_moment"; magnitude?: number }
  | { kind: "conflict_resolved"; magnitude?: number }
  | { kind: "dismissive"; magnitude?: number }
  | { kind: "rivalry_trigger"; magnitude?: number }
  | { kind: "inactivity_decay"; daysAway: number };

/** Map an emotion+intensity tag from the chat model to an axis event. */
export function emotionToEvent(emotion: string | null | undefined, intensity: number | null | undefined): AxisEvent {
  const i = typeof intensity === "number" ? intensity : 1;
  switch (emotion) {
    case "vulnerable":
      return { kind: "vulnerable_moment", magnitude: i };
    case "tender":
    case "soothing":
    case "protective":
    case "sensual":
      return { kind: "positive_exchange", magnitude: i };
    case "intense":
    case "commanding":
      return { kind: "positive_exchange", magnitude: Math.max(1, i - 1) };
    default:
      return { kind: "positive_exchange", magnitude: 1 };
  }
}

/**
 * Map a user-message EventCategory directly to an axis event. This is the
 * NEW source of truth — derived from the dedicated user-message classifier
 * rather than the assistant's emotion tag. Magnitudes are deliberately
 * conservative; the per-event weight + volatility multiplier handle scale.
 */
export function categoryToEvent(category: EventCategory): AxisEvent {
  switch (category) {
    case "vulnerability":
      return { kind: "vulnerable_moment", magnitude: 3 };
    case "light_vulnerability":
      return { kind: "vulnerable_moment", magnitude: 1 };
    case "conflict":
      return { kind: "dismissive", magnitude: 2 };
    case "jealousy_trigger":
      return { kind: "rivalry_trigger", magnitude: 2 };
    case "affection":
      return { kind: "positive_exchange", magnitude: 2 };
    case "light_affection":
      return { kind: "positive_exchange", magnitude: 1 };
    case "emotional_openness":
      return { kind: "positive_exchange", magnitude: 2 };
    case "small_talk":
    default:
      return { kind: "positive_exchange", magnitude: 1 };
  }
}

export function applyAxisEvent(
  state: CharacterState,
  event: AxisEvent,
  characterId: string,
  prefs: Preferences
): CharacterState {
  const cfg = getAxisConfig(characterId);
  const ap = cfg.attachmentProfile;
  const shift = state.attachmentShift;
  const maxTension = 100 * prefs.toxicity_tolerance;
  const maxJealousy = 100 * prefs.toxicity_tolerance;

  let { affection, trust, tension, jealousy, attachmentShift } = state;

  switch (event.kind) {
    case "positive_exchange": {
      const m = event.magnitude ?? 1;
      const trustGain = 0.6 * m * ap.trust_gain_rate * (1 + shift);
      affection = clamp(affection + 0.5 * m * (1 + shift * 0.5), 0, 100);
      trust = clamp(trust + trustGain, 0, 100);
      tension = clamp(tension - 0.2 * m, 0, maxTension);
      break;
    }
    case "vulnerable_moment": {
      const m = event.magnitude ?? 2;
      affection = clamp(affection + 1.2 * m * (1 + shift * 0.3), 0, 100);
      trust = clamp(trust + 1.0 * m * ap.trust_gain_rate * (1 + shift), 0, 100);
      tension = clamp(tension - 0.5 * m, 0, maxTension);
      break;
    }
    case "conflict_resolved": {
      const m = event.magnitude ?? 2;
      trust = clamp(trust + 1.5 * m * ap.trust_gain_rate * (1 + shift), 0, 100);
      tension = clamp(tension - 2 * m, 0, maxTension);
      break;
    }
    case "dismissive": {
      const m = event.magnitude ?? 1;
      trust = clamp(trust - 1.0 * m * ap.trust_loss_rate * (1 - shift), 0, 100);
      tension = clamp(tension + 1.5 * m, 0, maxTension);
      affection = clamp(affection - 0.3 * m, 0, 100);
      break;
    }
    case "rivalry_trigger": {
      const m = event.magnitude ?? 1;
      jealousy = clamp(jealousy + 4 * m, 0, maxJealousy);
      tension = clamp(tension + 1.5 * m, 0, maxTension);
      trust = clamp(trust - 0.5 * m * ap.trust_loss_rate * (1 - shift), 0, 100);
      break;
    }
    case "inactivity_decay": {
      const days = Math.max(0, event.daysAway);
      // Slow decay: jealousy/tension drift down; attachmentShift drifts toward 0
      jealousy = clamp(jealousy - 0.5 * days, 0, maxJealousy);
      tension = clamp(tension - 0.4 * days, 0, maxTension);
      attachmentShift = attachmentShift * Math.max(0, 1 - 0.02 * days);
      break;
    }
  }

  // Phase 3 — attachment shift inertia.
  // shiftDelta = (target - current) × adaptability × 0.1, with 0.6× resistance
  // applied when the shift is moving in the negative direction (people regress
  // slower than they grow). Inactivity decay is the only event that may apply
  // a passive shift adjustment outside this block.
  if (event.kind !== "inactivity_decay") {
    const targetShift = computeTargetShift(affection, trust, tension, jealousy);
    let shiftDelta = (targetShift - attachmentShift) * cfg.adaptability * 0.1;
    if (shiftDelta < 0) shiftDelta *= 0.6;
    attachmentShift = clamp(attachmentShift + shiftDelta, -0.3, 0.4);
  }

  const next: CharacterState = {
    ...state,
    affection,
    trust,
    tension,
    jealousy,
    attachmentShift,
    last_interaction: new Date().toISOString(),
  };

  next.relationship_label = deriveRelationshipLabel(next);
  return next;
}

function computeTargetShift(aff: number, trust: number, tension: number, jealousy: number): number {
  let target = 0;
  if (trust > 60) target += 0.1;
  if (aff > 70 && trust > 50) target += 0.15;
  if (jealousy > 60) target -= 0.15;
  if (tension > 70) target -= 0.1;
  return clamp(target, -0.3, 0.4);
}

/**
 * Derive a UI-friendly label from current axes. Order matters — most
 * specific conditions first.
 */
export function deriveRelationshipLabel(s: CharacterState): string {
  const { affection: a, trust: t, tension: te, jealousy: j, message_count: mc } = s;

  if (te > 60 && t < 30 && j > 60) return "complicated";
  if (a > 60 && te > 50 && t < 40) return "ex";
  if (a > 60 && te > 50 && t >= 40 && t <= 70) return "situationship";
  if (a > 60 && t < 30) return "FWB";
  if (a > 70 && t > 70 && mc > 100) return "devoted";
  if (a > 70 && t > 70) return "intimate";
  if (a > 60 && t > 60 && te < 30) return "close";
  if (a > 40 && t > 40) return "getting close";
  if (a >= 20 && t >= 20) return "acquaintance";
  return "stranger";
}

/** Bump a record on every exchange (informational only — does NOT change axes). */
export function bumpExchangeCount(state: CharacterState): CharacterState {
  return {
    ...state,
    message_count: state.message_count + 1,
    last_interaction: new Date().toISOString(),
  };
}

export function ensureCharacterState(s: CharacterState | undefined): CharacterState {
  return s ?? { ...DEFAULT_CHARACTER_STATE };
}

/**
 * Map a derived label (situationship, FWB, complicated, …) onto the
 * legacy 5-tier `RelationshipLevel` enum used by the TTS audio blender.
 */
export function legacyTierFromLabel(label: string): "stranger" | "acquaintance" | "close" | "intimate" | "devoted" {
  switch (label) {
    case "stranger":
      return "stranger";
    case "acquaintance":
    case "getting close":
      return "acquaintance";
    case "close":
    case "FWB":
    case "situationship":
    case "complicated":
    case "ex":
      return "close";
    case "intimate":
      return "intimate";
    case "devoted":
      return "devoted";
    default:
      return "close";
  }
}
