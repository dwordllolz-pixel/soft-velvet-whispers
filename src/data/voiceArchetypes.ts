/**
 * Maps each character to a Chatterbox reference voice + emotion archetype.
 * `referenceAudio: null` means no reference voice uploaded yet — UI shows
 * a "voice coming soon" toast instead of attempting playback.
 */

export type EmotionArchetype =
  | "protective_dominant"
  | "soft_supportive"
  | "laid_back_chill"
  | "playful_flirty"
  | "smooth_refined"
  | "warm_romantic"
  | "gentle_narration"
  | "authoritative_calm"
  | "controlled_serious"
  | "deep_protective"
  | "ethereal_mystic";

export interface EmotionParams {
  temperature: number;
  speed_factor: number;
  chunk_size: number;
  exaggeration: number;
  cfg_weight: number;
}

export const EMOTION_PARAMS: Record<EmotionArchetype, EmotionParams> = {
  protective_dominant:  { temperature: 0.6,  speed_factor: 1.02, chunk_size: 80, exaggeration: 0.3, cfg_weight: 0.5 },
  soft_supportive:      { temperature: 0.7,  speed_factor: 1.05, chunk_size: 90, exaggeration: 0.2, cfg_weight: 0.45 },
  laid_back_chill:      { temperature: 0.7,  speed_factor: 1.03, chunk_size: 90, exaggeration: 0.2, cfg_weight: 0.45 },
  playful_flirty:       { temperature: 0.9,  speed_factor: 1.08, chunk_size: 90, exaggeration: 0.5, cfg_weight: 0.5 },
  smooth_refined:       { temperature: 0.65, speed_factor: 1.05, chunk_size: 90, exaggeration: 0.3, cfg_weight: 0.5 },
  warm_romantic:        { temperature: 0.75, speed_factor: 1.05, chunk_size: 90, exaggeration: 0.4, cfg_weight: 0.5 },
  gentle_narration:     { temperature: 0.7,  speed_factor: 1.05, chunk_size: 90, exaggeration: 0.2, cfg_weight: 0.45 },
  authoritative_calm:   { temperature: 0.65, speed_factor: 1.05, chunk_size: 90, exaggeration: 0.3, cfg_weight: 0.5 },
  controlled_serious:   { temperature: 0.6,  speed_factor: 1.0,  chunk_size: 90, exaggeration: 0.3, cfg_weight: 0.55 },
  deep_protective:      { temperature: 0.6,  speed_factor: 1.0,  chunk_size: 80, exaggeration: 0.4, cfg_weight: 0.55 },
  ethereal_mystic:      { temperature: 0.7,  speed_factor: 1.0,  chunk_size: 90, exaggeration: 0.3, cfg_weight: 0.5 },
};

export interface CharacterVoice {
  /** Reference audio filename on the Chatterbox server, or null if not yet uploaded */
  referenceAudio: string | null;
  archetype: EmotionArchetype;
  /** UI label shown next to the listen button */
  label: string;
}

export const CHARACTER_VOICES: Record<string, CharacterVoice> = {
  marcus:    { referenceAudio: null,           archetype: "deep_protective",     label: "Dominant Protector" },
  eli:       { referenceAudio: "eli_3.wav",    archetype: "soft_supportive",     label: "Nerdy Sweetheart" },
  jaxon:     { referenceAudio: null,           archetype: "laid_back_chill",     label: "Chill Comfort" },
  raven:     { referenceAudio: "raven_1.wav",  archetype: "protective_dominant", label: "Dark Devotion" },
  angel:     { referenceAudio: null,           archetype: "playful_flirty",      label: "Playful Tease" },
  vincent:   { referenceAudio: null,           archetype: "smooth_refined",      label: "Refined Lover" },
  mateo:     { referenceAudio: null,           archetype: "warm_romantic",       label: "Passionate Flame" },
  kai:       { referenceAudio: null,           archetype: "soft_supportive",     label: "Soft Caregiver" },
  "dr-elias":{ referenceAudio: null,           archetype: "authoritative_calm",  label: "Calm Authority" },
  ren:       { referenceAudio: null,           archetype: "controlled_serious",  label: "Controlled Guardian" },
  cole:      { referenceAudio: null,           archetype: "gentle_narration",    label: "Sweet Boy Next Door" },
  sage:      { referenceAudio: null,           archetype: "ethereal_mystic",     label: "Ethereal Presence" },
};

export function getCharacterVoice(characterId: string): CharacterVoice | undefined {
  return CHARACTER_VOICES[characterId];
}
