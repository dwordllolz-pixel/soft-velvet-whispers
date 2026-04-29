import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Emotion } from "@/data/emotionMatrix";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  emotion?: Emotion | null;
  intensity?: number | null;
}

export function useChatHistory() {
  const { user } = useAuth();

  const saveSession = useCallback(
    async (characterId: string, asmrType: string, messages: Message[]) => {
      if (!user || messages.length === 0) return;

      const { data: existing } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("character_id", characterId)
        .eq("asmr_type", asmrType)
        .order("created_at", { ascending: false })
        .limit(1);

      let sessionId: string;

      if (existing && existing.length > 0) {
        sessionId = existing[0].id;
        await supabase.from("chat_messages").delete().eq("session_id", sessionId);
      } else {
        const title = `${characterId} — ${asmrType}`;
        const { data: newSession } = await supabase
          .from("chat_sessions")
          .insert({ user_id: user.id, character_id: characterId, asmr_type: asmrType, title })
          .select("id")
          .single();
        if (!newSession) return;
        sessionId = newSession.id;
      }

      const rows = messages.map((m) => ({
        session_id: sessionId,
        role: m.role,
        content: m.content,
        emotion: m.emotion ?? null,
        intensity: m.intensity ?? null,
      }));

      await supabase.from("chat_messages").insert(rows);
    },
    [user]
  );

  const loadSession = useCallback(
    async (characterId: string, asmrType: string): Promise<Message[]> => {
      if (!user) return [];

      const { data: sessions } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("character_id", characterId)
        .eq("asmr_type", asmrType)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!sessions || sessions.length === 0) return [];

      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("id, role, content, emotion, intensity")
        .eq("session_id", sessions[0].id)
        .order("created_at", { ascending: true });

      return (msgs ?? []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        emotion: m.emotion,
        intensity: m.intensity,
      }));
    },
    [user]
  );

  const listSessions = useCallback(async () => {
    if (!user) return [];
    const { data } = await supabase
      .from("chat_sessions")
      .select("id, character_id, asmr_type, title, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    return data ?? [];
  }, [user]);

  /**
   * Delete every session + message for this user. Returns true on success.
   * Backend-first: throws on any error so callers don't show success UI
   * after a partial failure.
   */
  const deleteAllSessions = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    const { data: sessions, error: sErr } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("user_id", user.id);
    if (sErr) throw sErr;
    const ids = (sessions ?? []).map((s) => s.id);
    if (ids.length === 0) return true;
    const { error: mErr } = await supabase
      .from("chat_messages")
      .delete()
      .in("session_id", ids);
    if (mErr) throw mErr;
    const { error: dErr } = await supabase
      .from("chat_sessions")
      .delete()
      .in("id", ids);
    if (dErr) throw dErr;
    return true;
  }, [user]);

  /**
   * Delete every session + message scoped to ONE character for this user.
   * MUST filter by both user_id (RLS-enforced) and character_id — missing
   * character_id would either delete nothing or wipe everything.
   */
  const deleteCharacterSessions = useCallback(
    async (characterId: string): Promise<boolean> => {
      if (!user || !characterId) return false;
      const { data: sessions, error: sErr } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("character_id", characterId);
      if (sErr) throw sErr;
      const ids = (sessions ?? []).map((s) => s.id);
      if (ids.length === 0) return true;
      const { error: mErr } = await supabase
        .from("chat_messages")
        .delete()
        .in("session_id", ids);
      if (mErr) throw mErr;
      const { error: dErr } = await supabase
        .from("chat_sessions")
        .delete()
        .in("id", ids);
      if (dErr) throw dErr;
      return true;
    },
    [user]
  );

  return {
    saveSession,
    loadSession,
    listSessions,
    deleteAllSessions,
    deleteCharacterSessions,
    isLoggedIn: !!user,
  };
}
