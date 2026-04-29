/**
 * Phase 5 — Rivalry System
 *
 * Pure functions, no I/O. The active character can sense when the user has
 * been spending time with someone else. Awareness is intensity-driven and
 * decays passively when not reinforced. Decay is computed at READ time —
 * there is no background scheduler.
 *
 * IMPORTANT:
 * - Never mutates any character other than the active one.
 * - Reads/writes the rivalry block via CharacterState.rivalry_state.
 * - Always honors profile.rivalry.enabled and profile.preferences.incognito.
 */

import { getRivalryThreshold } from "@/data/characters";
import type {
  CharacterState,
  ProfileData,
  RivalryState,
} from "@/types/profile";
import { DEFAULT_RIVALRY_STATE } from "@/types/profile";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const ACTIVATION_GAIN = 0.08;
const DECAY_PER_DAY = 0.1;
const COOLDOWN_HOURS = 4;
const MIN_MESSAGES_BEFORE_RIVALRY = 15;
const RIVAL_MIN_MESSAGES = 5;
const RIVAL_GAP_HOURS = 48;
/** Patch 8 — gate expression behind a minimum number of assistant turns. */
const MIN_TURNS_BETWEEN_EXPRESSION = 3;

/**
 * Patch 1 — recency source of truth.
 * Prefer `last_message_at`; fall back to `last_interaction`. Never invent.
 */
function recencyOf(c: CharacterState | undefined): number | null {
  if (!c) return null;
  const ts = c.last_message_at ?? c.last_interaction ?? null;
  if (!ts) return null;
  const t = new Date(ts).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Scale detection threshold by user's global rivalry intensity preference.
 * low  = harder to trigger (×1.4)
 * med  = baseline
 * high = easier to trigger (×0.7)
 */
function scaledThreshold(charId: string, profile: ProfileData): number {
  const base = getRivalryThreshold(charId);
  const tier = profile.rivalry.intensity;
  const mult = tier === "low" ? 1.4 : tier === "high" ? 0.7 : 1;
  return Math.min(1, Math.max(0, base * mult));
}

function ensureRivalry(state: CharacterState | undefined): RivalryState {
  return { ...DEFAULT_RIVALRY_STATE, ...(state?.rivalry_state ?? {}) };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Patch 5 — primary rival selection.
 * Pick the SINGLE most-recent other character that has enough history,
 * then evaluate the activation condition only against that one.
 */
function selectPrimaryRival(
  activeCharId: string,
  profile: ProfileData,
): { id: string; recency: number } | null {
  let best: { id: string; recency: number } | null = null;
  for (const [otherId, other] of Object.entries(profile.characters)) {
    if (otherId === activeCharId) continue;
    if (!other) continue;
    if ((other.message_count ?? 0) <= RIVAL_MIN_MESSAGES) continue;
    const r = recencyOf(other);
    if (r === null) continue;
    if (!best || r > best.recency) best = { id: otherId, recency: r };
  }
  return best;
}

/**
 * Decide whether the active character should *currently* feel a rivalry pull.
 * This is a snapshot decision — call it every turn before updating intensity.
 */
export function shouldActivateRivalry(
  activeCharId: string,
  profile: ProfileData,
): boolean {
  if (!profile.rivalry.enabled) return false;
  if (profile.preferences.incognito) return false;

  const active = profile.characters[activeCharId];
  if (!active) return false;
  if (active.message_count < MIN_MESSAGES_BEFORE_RIVALRY) return false;
  if (active.relationship_label === "stranger") return false;

  const activeRecency = recencyOf(active) ?? 0;
  const rival = selectPrimaryRival(activeCharId, profile);
  if (!rival) return false;
  return rival.recency - activeRecency > RIVAL_GAP_HOURS * HOUR_MS;
}

/**
 * Compute the new rivalry_state for the active character.
 * - Always applies passive decay first based on time since last_expressed_at
 *   (or rivalry_updated_at if last_expressed_at is null). If both null, skip.
 * - Then either +ACTIVATION_GAIN (if shouldActivateRivalry) or -DECAY_PER_DAY (single tick).
 * - Updates `aware` against the per-character (scaled) detection threshold.
 * - Always stamps rivalry_updated_at on the returned state.
 *
 * Patch 3: intensity is NOT capped artificially during cooldown — internal
 * buildup must continue. Cooldown gating happens in buildRivalryPromptBlock.
 *
 * Never modifies any other character. Returns ONLY the new rivalry_state.
 */
export function updateRivalryIntensity(
  activeCharId: string,
  profile: ProfileData,
): RivalryState {
  const active = profile.characters[activeCharId];
  const current = ensureRivalry(active);
  const threshold = scaledThreshold(activeCharId, profile);

  // Patch 2 — passive decay anchor: last_expressed_at → rivalry_updated_at → skip.
  let intensity = current.intensity;
  const decayAnchor =
    current.last_expressed_at ?? current.rivalry_updated_at ?? null;
  if (decayAnchor) {
    const elapsedDays = Math.floor(
      (Date.now() - new Date(decayAnchor).getTime()) / DAY_MS,
    );
    if (elapsedDays > 0) {
      const passiveLoss = Math.min(intensity, elapsedDays * DECAY_PER_DAY);
      if (passiveLoss > 0) {
        intensity = clamp01(intensity - passiveLoss);
        console.log(
          `[rivalry] decayed for ${activeCharId} intensity:`,
          Number(intensity.toFixed(3)),
        );
      }
    }
  }

  const activate = shouldActivateRivalry(activeCharId, profile);
  if (activate) {
    intensity = clamp01(intensity + ACTIVATION_GAIN);
    console.log(
      `[rivalry] activated for ${activeCharId} intensity:`,
      Number(intensity.toFixed(3)),
    );
  } else {
    const before = intensity;
    intensity = clamp01(intensity - DECAY_PER_DAY);
    if (intensity < before) {
      console.log(
        `[rivalry] decayed for ${activeCharId} intensity:`,
        Number(intensity.toFixed(3)),
      );
    }
  }

  if (isRivalryCoolingDown(current)) {
    intensity = Math.min(intensity, 0.75);
  }

  const aware = intensity >= threshold;

  return {
    ...current,
    intensity,
    aware,
    rivalry_updated_at: new Date().toISOString(),
  };
}

export function isRivalryCoolingDown(rivalryState: RivalryState | undefined): boolean {
  if (!rivalryState?.cooldown_until) return false;
  return new Date(rivalryState.cooldown_until).getTime() > Date.now();
}

/**
 * Patch 8 — increment the per-character "turns since last rivalry expression"
 * counter on every successful assistant response. Caller MUST invoke this
 * exactly once per qualifying assistant turn (final, non-empty, role=assistant,
 * not a retry/system/ECHO). Resets to 0 when rivalry is expressed via
 * setRivalryCooldown.
 */
export function bumpRivalryTurns(rivalryState: RivalryState | undefined): RivalryState {
  const rs = ensureRivalry({ rivalry_state: rivalryState } as CharacterState);
  return {
    ...rs,
    turns_since_expression: (rs.turns_since_expression ?? 0) + 1,
    rivalry_updated_at: new Date().toISOString(),
  };
}

/**
 * Set a 4-hour cooldown so the high-intensity block is not re-injected back-to-back.
 * Patch 8 — also resets turns_since_expression to 0.
 */
export function setRivalryCooldown(rivalryState: RivalryState): RivalryState {
  const now = new Date();
  const until = new Date(now.getTime() + COOLDOWN_HOURS * HOUR_MS);
  const iso = now.toISOString();
  return {
    ...rivalryState,
    last_expressed_at: iso,
    cooldown_until: until.toISOString(),
    turns_since_expression: 0,
    rivalry_updated_at: iso,
  };
}

const CONSTRAINT_LINE =
  "Your core personality, speech pattern, and tone remain fully intact — rivalry modulates how you feel, not who you are.";

const BLOCK_SUBTLE =
  "Something sits quietly at the back of your mind — a subtle awareness that the user has been elsewhere. You haven't decided how you feel about it. It shows only in small ways.";
const BLOCK_BOTHERED =
  "You are aware the user has been spending time with someone else. It bothers you more than you show. You become slightly more guarded. Do not address it directly.";
const BLOCK_INTENSE =
  "The awareness of competition affects your mood noticeably. Express this through your personality: withdrawal, sharpness, or quiet hurt — never direct accusation. After expressing this once, it must not dominate the conversation.";

/** Patch 7 — single-sentence trim fallbacks (one full sentence each). */
const SHORT_SUBTLE =
  "Something about the user being elsewhere sits quietly in your mind.";
const SHORT_BOTHERED =
  "You are aware the user has been elsewhere and it shows in your guardedness.";
const SHORT_INTENSE =
  "Awareness of competition affects your mood through withdrawal or quiet hurt.";

// Backwards-compatible export (still consumed by Chat.tsx as the high-tier short form).
const BLOCK_INTENSE_SHORT = SHORT_INTENSE;

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function withConstraint(text: string): string {
  if (!text) return "";
  return `${text} ${CONSTRAINT_LINE}`;
}

export interface RivalryBlockResult {
  /** Final text to inject (may be empty string). */
  text: string;
  /** True if the high-intensity block fired and the caller MUST set cooldown. */
  triggeredCooldown: boolean;
  /** Patch 7 — single-sentence trim fallback paired with `text` (already includes constraint). */
  short: string;
}

/**
 * Build the rivalry prompt block for injection. Returns empty when rivalry
 * disabled, character not aware, in cooldown (only blocks high-intensity
 * expression), or expression cadence guard active.
 *
 * The caller is responsible for invoking setRivalryCooldown when
 * `triggeredCooldown` is true and persisting the new rivalry_state.
 */
export function buildRivalryPromptBlock(
  charId: string,
  rivalryState: RivalryState | undefined,
  profile: ProfileData,
): RivalryBlockResult {
  const empty: RivalryBlockResult = { text: "", triggeredCooldown: false, short: "" };
  if ((rivalryState?.turns_since_expression ?? 0) < 3) return empty;
  if (!profile.rivalry.enabled) return empty;
  const rs = ensureRivalry({ rivalry_state: rivalryState } as CharacterState);
  if (!rs.aware) return empty;

  // Patch 8 — expression cadence guard (independent of cooldown).
  const turns = rs.turns_since_expression ?? 0;
  if (turns < MIN_TURNS_BETWEEN_EXPRESSION) {
    return empty;
  }

  const cooling = isRivalryCoolingDown(rs);
  const threshold = scaledThreshold(charId, profile);

  let full = "";
  let shortText = "";
  let triggeredCooldown = false;

  if (rs.intensity > 0.75) {
    // Patch 3 — high-intensity expression is suppressed during cooldown,
    // but intensity itself is allowed to keep climbing in updateRivalryIntensity.
    if (cooling) {
      console.log(`[rivalry] cooldown active for ${charId}`);
      return empty;
    }
    full = BLOCK_INTENSE;
    shortText = SHORT_INTENSE;
    triggeredCooldown = true;
  } else if (rs.intensity >= 0.5) {
    full = BLOCK_BOTHERED;
    shortText = SHORT_BOTHERED;
  } else if (rs.intensity > threshold) {
    full = BLOCK_SUBTLE;
    shortText = SHORT_SUBTLE;
  }

  if (!full) return empty;

  // Patch 6 — append the constraint line to ALL rivalry outputs.
  let text = withConstraint(full);
  const short = withConstraint(shortText);

  if (wordCount(text) > 60) {
    // Defensive — descriptions are static and within budget, but enforce anyway.
    text = text.split(/\s+/).slice(0, 60).join(" ");
  }
  return { text, triggeredCooldown, short };
}

export { BLOCK_INTENSE_SHORT };
