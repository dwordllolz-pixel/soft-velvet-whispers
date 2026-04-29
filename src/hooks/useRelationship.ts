import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { levelFromScore, type Emotion, type RelationshipLevel } from "@/data/emotionMatrix";

export interface Relationship {
  level: RelationshipLevel;
  message_count: number;
  intimacy_score: number;
  last_emotion: Emotion | null;
  last_intensity: number | null;
}

const DEFAULT: Relationship = {
  level: "stranger",
  message_count: 0,
  intimacy_score: 0,
  last_emotion: null,
  last_intensity: null,
};

const EMOTION_WEIGHT: Record<Emotion, number> = {
  tender: 2, playful: 1, protective: 2, sensual: 3, vulnerable: 3,
  commanding: 1, soothing: 2, amused: 1, intense: 2, neutral: 0,
};

export function useRelationship(characterId: string | undefined) {
  const { user } = useAuth();
  const [relationship, setRelationship] = useState<Relationship>(DEFAULT);

  const load = useCallback(async () => {
    if (!user || !characterId) return;
    const { data } = await supabase
      .from("relationships")
      .select("level,message_count,intimacy_score,last_emotion,last_intensity")
      .eq("user_id", user.id)
      .eq("character_id", characterId)
      .maybeSingle();
    if (data) setRelationship(data as Relationship);
    else setRelationship(DEFAULT);
  }, [user, characterId]);

  useEffect(() => { load(); }, [load]);

  const recordExchange = useCallback(
    async (emotion: Emotion | null, intensity: number | null) => {
      if (!user || !characterId) return;
      const eff = emotion ?? "neutral";
      const ints = intensity ?? 1;
      const delta = (EMOTION_WEIGHT[eff] ?? 0) * ints + 1;
      const next: Relationship = {
        message_count: relationship.message_count + 1,
        intimacy_score: relationship.intimacy_score + delta,
        last_emotion: eff,
        last_intensity: ints,
        level: levelFromScore(relationship.intimacy_score + delta),
      };
      setRelationship(next);
      await supabase
        .from("relationships")
        .upsert(
          {
            user_id: user.id,
            character_id: characterId,
            message_count: next.message_count,
            intimacy_score: next.intimacy_score,
            level: next.level,
            last_emotion: next.last_emotion,
            last_intensity: next.last_intensity,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,character_id" }
        );
    },
    [user, characterId, relationship]
  );

  return { relationship, recordExchange, reload: load };
}
