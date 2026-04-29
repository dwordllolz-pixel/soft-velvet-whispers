/**
 * Phase 1 — User State System
 *
 * profile_data is a versioned JSON document. ALWAYS check `version` before
 * reading and run migrateProfileData() to bring it up to current shape.
 */

export const CURRENT_PROFILE_VERSION = 1;

export type NsfwLevel = "sfw" | "suggestive" | "explicit";
export type DomSub = "dom" | "sub" | "neutral";
export type RivalryIntensity = "low" | "medium" | "high";

export interface Boundaries {
  no_non_con: boolean;
  no_degradation: boolean;
  no_extreme_power_dynamics: boolean;
}

export interface Preferences {
  nsfw_level: NsfwLevel;
  toxicity_tolerance: number; // 0–1
  auto_voice: boolean;
  incognito: boolean;
  dom_sub_default: DomSub;
  boundaries: Boundaries;
  /** Per-character override of dom_sub_default. Key = character id. */
  character_dom_sub: Record<string, DomSub>;
}

/**
 * Phase 2 — Relationship Axes (per character).
 * Axes are bounded 0–100. attachmentShift is bounded -0.3..+0.4.
 * relationship_label is derived (cached for UI), not authoritative.
 */
/**
 * Phase 5 — per-character rivalry tracker. Lives inside CharacterState so a
 * single setCharacterState() write persists axis + rivalry together.
 */
export interface RivalryState {
  aware: boolean;
  intensity: number;            // 0..1
  last_expressed_at: string | null; // ISO string
  cooldown_until: string | null;    // ISO string
  /** Phase 5 patch — fallback decay anchor; updated on every rivalry write. */
  rivalry_updated_at?: string | null;
  /** Phase 5 patch — assistant turns since last rivalry expression. */
  turns_since_expression?: number;
}

export interface CharacterState {
  affection: number;
  trust: number;
  tension: number;
  jealousy: number;
  message_count: number;
  last_interaction: string | null;
  /**
   * Phase 5 patch — preferred recency anchor for rivalry comparisons.
   * Falls back to last_interaction when missing. Not written by the rivalry
   * system itself; populated elsewhere if/when available.
   */
  last_message_at?: string | null;
  attachmentShift: number;
  relationship_label: string;
  /**
   * Phase 3 — soft-cap support. Tracks per-day exchange count so axis
   * deltas can be diminished after the daily threshold (~8 messages).
   * Reset automatically when `daily_count_date` !== today.
   */
  daily_count?: number;
  daily_count_date?: string; // YYYY-MM-DD
  /** Carried over from legacy `relationships` table during migration. */
  legacy_intimacy_score?: number;
  last_emotion?: string | null;
  last_intensity?: number | null;
  /** Phase 5 — Rivalry. Initialized lazily when the character is first written. */
  rivalry_state?: RivalryState;
}

export const DEFAULT_RIVALRY_STATE: RivalryState = {
  aware: false,
  intensity: 0,
  last_expressed_at: null,
  cooldown_until: null,
  rivalry_updated_at: null,
  turns_since_expression: 0,
};

export interface Memory {
  milestones?: string[];
  learned_preferences?: string[];
  narrative_state?: Record<string, string>;
}

export interface Rivalry {
  enabled: boolean;
  intensity: RivalryIntensity;
}

export interface Meta {
  last_used_character: string | null;
  total_sessions: number;
}

export interface ProfileData {
  version: number;
  preferences: Preferences;
  characters: Record<string, CharacterState>;
  memory: Record<string, Memory>;
  rivalry: Rivalry;
  meta: Meta;
}

export const DEFAULT_BOUNDARIES: Boundaries = {
  no_non_con: true,
  no_degradation: false,
  no_extreme_power_dynamics: false,
};

export const DEFAULT_PREFERENCES: Preferences = {
  nsfw_level: "sfw",
  toxicity_tolerance: 0.5,
  auto_voice: true,
  incognito: false,
  dom_sub_default: "neutral",
  boundaries: DEFAULT_BOUNDARIES,
  character_dom_sub: {},
};

export const DEFAULT_CHARACTER_STATE: CharacterState = {
  affection: 0,
  trust: 0,
  tension: 0,
  jealousy: 0,
  message_count: 0,
  last_interaction: null,
  attachmentShift: 0,
  relationship_label: "stranger",
  rivalry_state: { ...DEFAULT_RIVALRY_STATE },
};

export const DEFAULT_PROFILE: ProfileData = {
  version: CURRENT_PROFILE_VERSION,
  preferences: DEFAULT_PREFERENCES,
  characters: {},
  memory: {},
  rivalry: { enabled: true, intensity: "medium" },
  meta: { last_used_character: null, total_sessions: 0 },
};

/**
 * Bring an arbitrary profile_data blob up to CURRENT_PROFILE_VERSION.
 * Add a case for every breaking change. Never throw — always return a
 * valid ProfileData by merging onto DEFAULT_PROFILE.
 */
export function migrateProfileData(raw: unknown): ProfileData {
  const incoming = (raw && typeof raw === "object" ? raw : {}) as Partial<ProfileData>;
  const version = typeof incoming.version === "number" ? incoming.version : 0;

  // v0 → v1: ensure preferences.boundaries + character_dom_sub exist
  // Phase 5: ensure each character has rivalry_state without overwriting axes.
  const incomingChars = (incoming.characters ?? {}) as Record<string, CharacterState>;
  const mergedChars: Record<string, CharacterState> = {};
  for (const [id, cs] of Object.entries(incomingChars)) {
    mergedChars[id] = {
      ...cs,
      rivalry_state: {
        ...DEFAULT_RIVALRY_STATE,
        ...(cs?.rivalry_state ?? {}),
      },
    };
  }

  let working: ProfileData = {
    ...DEFAULT_PROFILE,
    ...incoming,
    version: CURRENT_PROFILE_VERSION,
    preferences: {
      ...DEFAULT_PREFERENCES,
      ...(incoming.preferences ?? {}),
      boundaries: {
        ...DEFAULT_BOUNDARIES,
        ...((incoming.preferences as Preferences | undefined)?.boundaries ?? {}),
      },
      character_dom_sub: {
        ...((incoming.preferences as Preferences | undefined)?.character_dom_sub ?? {}),
      },
    },
    characters: mergedChars,
    memory: { ...(incoming.memory ?? {}) },
    rivalry: { ...DEFAULT_PROFILE.rivalry, ...(incoming.rivalry ?? {}) },
    meta: { ...DEFAULT_PROFILE.meta, ...(incoming.meta ?? {}) },
  };

  // Future migrations chain here:
  // if (version < 2) { working = migrateV1ToV2(working); }
  void version;

  return working;
}

export function getCharacterState(profile: ProfileData, characterId: string): CharacterState {
  return profile.characters[characterId] ?? { ...DEFAULT_CHARACTER_STATE };
}
