import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useFavorites() {
  const { user } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setFavoriteIds(new Set());
      return;
    }
    setLoading(true);
    supabase
      .from("favorites")
      .select("character_id")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setFavoriteIds(new Set((data ?? []).map((f: any) => f.character_id)));
        setLoading(false);
      });
  }, [user]);

  const toggleFavorite = useCallback(
    async (characterId: string) => {
      if (!user) return;
      const isFav = favoriteIds.has(characterId);
      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(characterId);
        else next.add(characterId);
        return next;
      });

      if (isFav) {
        await supabase.from("favorites").delete().eq("user_id", user.id).eq("character_id", characterId);
      } else {
        await supabase.from("favorites").insert({ user_id: user.id, character_id: characterId });
      }
    },
    [user, favoriteIds]
  );

  return { favoriteIds, toggleFavorite, loading, isLoggedIn: !!user };
}
