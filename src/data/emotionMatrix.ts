/**
 * Full flavor matrix: ASMR type × emotion × relationship × archetype
 * → blended Chatterbox TTS params.
 */
import { EMOTION_PARAMS, type EmotionArchetype, type EmotionParams } from "./voiceArchetypes";

export type Emotion =
  | "tender"
  | "playful"
  | "protective"
  | "sensual"
  | "vulnerable"
  | "commanding"
  | "soothing"
  | "amused"
  | "intense"
  | "neutral";

export type RelationshipLevel = "stranger" | "acquaintance" | "close" | "intimate" | "devoted";

export const RELATIONSHIP_THRESHOLDS: { level: RelationshipLevel; min: number }[] = [
  { level: "devoted", min: 80 },
  { level: "intimate", min: 45 },
  { level: "close", min: 20 },
  { level: "acquaintance", min: 6 },
  { level: "stranger", min: 0 },
];

export function levelFromScore(score: number): RelationshipLevel {
  for (const t of RELATIONSHIP_THRESHOLDS) if (score >= t.min) return t.level;
  return "stranger";
}

/** ASMR type modifiers (additive deltas applied to base params). */
const ASMR_MOD: Record<string, Partial<EmotionParams>> = {
  "boyfriend":          { temperature: 0.0,  speed_factor: -0.02, exaggeration: 0.05 },
  "mouth-sounds":       { temperature: 0.05, speed_factor: -0.05, exaggeration: 0.05 },
  "ear-to-ear":         { temperature: 0.0,  speed_factor: -0.05, exaggeration: 0.0  },
  "personal-attention": { temperature: 0.05, speed_factor: -0.03, exaggeration: 0.1  },
  "medical":            { temperature: -0.05, speed_factor: -0.02, exaggeration: -0.05, cfg_weight: 0.05 },
  "tapping":            { temperature: 0.0,  speed_factor: 0.0,   exaggeration: 0.0  },
  "sleep-aid":          { temperature: -0.05, speed_factor: -0.1, exaggeration: -0.1, chunk_size: 10 },
  "confession":         { temperature: 0.05, speed_factor: -0.05, exaggeration: 0.1  },
};

/** Emotion modifiers (additive). */
const EMOTION_MOD: Record<Emotion, Partial<EmotionParams>> = {
  tender:      { temperature: 0.0,  speed_factor: -0.03, exaggeration: 0.05 },
  playful:     { temperature: 0.1,  speed_factor: 0.05,  exaggeration: 0.15 },
  protective:  { temperature: -0.05, speed_factor: -0.05, exaggeration: 0.05, cfg_weight: 0.05 },
  sensual:     { temperature: 0.05, speed_factor: -0.08, exaggeration: 0.15 },
  vulnerable:  { temperature: 0.05, speed_factor: -0.05, exaggeration: 0.1  },
  commanding:  { temperature: -0.1, speed_factor: -0.03, exaggeration: 0.05, cfg_weight: 0.1 },
  soothing:    { temperature: -0.05, speed_factor: -0.08, exaggeration: -0.05 },
  amused:      { temperature: 0.1,  speed_factor: 0.03,  exaggeration: 0.1  },
  intense:     { temperature: 0.05, speed_factor: -0.02, exaggeration: 0.2, cfg_weight: 0.1 },
  neutral:     {},
};

/** Relationship modifiers — closer = softer, slower, more expressive. */
const REL_MOD: Record<RelationshipLevel, Partial<EmotionParams>> = {
  stranger:     { temperature: -0.05, speed_factor: 0.02,  exaggeration: -0.1 },
  acquaintance: { temperature: 0.0,   speed_factor: 0.0,   exaggeration: -0.05 },
  close:        { temperature: 0.0,   speed_factor: -0.02, exaggeration: 0.05 },
  intimate:     { temperature: 0.05,  speed_factor: -0.05, exaggeration: 0.1  },
  devoted:      { temperature: 0.05,  speed_factor: -0.08, exaggeration: 0.15, cfg_weight: 0.05 },
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export interface FlavorInputs {
  archetype: EmotionArchetype;
  asmrType: string;
  emotion: Emotion;
  intensity: number; // 1-5
  relationship: RelationshipLevel;
}

export function blendParams({ archetype, asmrType, emotion, intensity, relationship }: FlavorInputs): EmotionParams {
  const base = EMOTION_PARAMS[archetype];
  const mods = [
    ASMR_MOD[asmrType] || {},
    EMOTION_MOD[emotion] || {},
    REL_MOD[relationship] || {},
  ];
  const intensityScale = clamp((intensity - 3) * 0.05, -0.1, 0.1); // -0.1..+0.1

  let p: EmotionParams = { ...base };
  for (const m of mods) {
    if (m.temperature !== undefined) p.temperature += m.temperature;
    if (m.speed_factor !== undefined) p.speed_factor += m.speed_factor;
    if (m.exaggeration !== undefined) p.exaggeration += m.exaggeration;
    if (m.cfg_weight !== undefined) p.cfg_weight += m.cfg_weight;
    if (m.chunk_size !== undefined) p.chunk_size += m.chunk_size;
  }
  // Intensity nudges exaggeration & temperature
  p.exaggeration += intensityScale;
  p.temperature += intensityScale * 0.5;

  return {
    temperature: clamp(p.temperature, 0.3, 1.2),
    speed_factor: clamp(p.speed_factor, 1.0, 1.1),
    exaggeration: clamp(p.exaggeration, 0.1, 1.0),
    cfg_weight: clamp(p.cfg_weight, 0.2, 0.9),
    chunk_size: Math.round(clamp(p.chunk_size, 60, 160)),
  };
}
