import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_CHARACTER_STATE, migrateProfileData, type CharacterState, type ProfileData } from "@/types/profile";

export type AdminRole = "admin" | "debugger" | "user";

export interface AdminUserRow {
  id: string;
  profile_data: ProfileData;
  last_active_character: string | null;
  updated_at: string;
}

export interface AdminChatSession {
  id: string;
  user_id: string;
  character_id: string;
  asmr_type: string;
  title: string | null;
  updated_at: string;
}

export interface AdminChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | string;
  content: string;
  emotion: string | null;
  intensity: number | null;
  created_at: string;
}

export interface EchoLog {
  id: string;
  user_id: string | null;
  character_id: string | null;
  mode: string | null;
  message: string;
  echo_type: string;
  severity: string;
  created_at: string;
  resolved_at: string | null;
}

export interface AnalyticsEvent {
  id: string;
  event_name: string;
  character_id: string | null;
  mode: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  target_user_id: string | null;
  target_character_id: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  created_at: string;
}

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value.trim());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const makeInviteCode = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `ADM-${token}`;
};

export function useAdminDebug() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);

  const reloadRoles = useCallback(async () => {
    if (!user) {
      setRoles([]);
      setLoadingRoles(false);
      return;
    }
    setLoadingRoles(true);
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    setRoles(((data ?? []).map((r: any) => r.role).filter(Boolean)) as AdminRole[]);
    setLoadingRoles(false);
  }, [user]);

  useEffect(() => {
    void reloadRoles();
  }, [reloadRoles]);

  const isAdmin = roles.includes("admin");
  const isDebugger = roles.includes("debugger");
  const canDebug = isAdmin || isDebugger;

  const redeemInvite = useCallback(async (code: string) => {
    if (!user) throw new Error("Sign in before redeeming an admin invite.");
    const code_hash = await sha256(code);
    const { error } = await supabase.from("admin_invite_redemptions").insert({ user_id: user.id, code_hash });
    if (error) throw error;
    await reloadRoles();
  }, [reloadRoles, user]);

  const createInvite = useCallback(async (role: AdminRole = "debugger", description = "Debug invite") => {
    if (!user) throw new Error("Sign in before creating an invite.");
    const code = makeInviteCode();
    const code_hash = await sha256(code);
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    const { error } = await supabase.from("admin_invites").insert({
      code_hash,
      role,
      description,
      max_uses: 1,
      expires_at: expires,
      created_by: user.id,
    });
    if (error) throw error;
    return code;
  }, [user]);

  const loadDashboard = useCallback(async () => {
    const [usersRes, sessionsRes, messagesRes, echoRes, analyticsRes, auditRes] = await Promise.all([
      supabase.from("users").select("id, profile_data, last_active_character, updated_at").order("updated_at", { ascending: false }).limit(50),
      supabase.from("chat_sessions").select("id, user_id, character_id, asmr_type, title, updated_at").order("updated_at", { ascending: false }).limit(50),
      supabase.from("chat_messages").select("id, session_id, role, content, emotion, intensity, created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("echo_logs").select("id, user_id, character_id, mode, message, echo_type, severity, created_at, resolved_at").order("created_at", { ascending: false }).limit(100),
      supabase.from("admin_analytics_events").select("id, event_name, character_id, mode, metadata, created_at").order("created_at", { ascending: false }).limit(100),
      supabase.from("admin_audit_log").select("id, actor_id, action, target_user_id, target_character_id, before_value, after_value, created_at").order("created_at", { ascending: false }).limit(100),
    ]);

    const firstError = [usersRes, sessionsRes, messagesRes, echoRes, analyticsRes, auditRes].find((r) => r.error)?.error;
    if (firstError) throw firstError;

    return {
      users: (usersRes.data ?? []).map((row: any) => ({ ...row, profile_data: migrateProfileData(row.profile_data) })) as AdminUserRow[],
      sessions: (sessionsRes.data ?? []) as AdminChatSession[],
      messages: (messagesRes.data ?? []) as AdminChatMessage[],
      echoLogs: (echoRes.data ?? []) as EchoLog[],
      analytics: (analyticsRes.data ?? []) as AnalyticsEvent[],
      audit: (auditRes.data ?? []) as AuditLog[],
    };
  }, []);

  const updateCharacterState = useCallback(async (targetUserId: string, characterId: string, patch: Partial<CharacterState>) => {
    if (!user) throw new Error("Sign in before editing debug state.");
    const { data, error } = await supabase.from("users").select("profile_data").eq("id", targetUserId).single();
    if (error) throw error;
    const profile = migrateProfileData((data as any).profile_data);
    const before = profile.characters[characterId] ?? { ...DEFAULT_CHARACTER_STATE };
    const nextState: CharacterState = { ...before, ...patch, last_interaction: new Date().toISOString() };
    const nextProfile: ProfileData = {
      ...profile,
      characters: { ...profile.characters, [characterId]: nextState },
    };
    const { error: updateError } = await supabase.from("users").update({ profile_data: nextProfile as any }).eq("id", targetUserId);
    if (updateError) throw updateError;
    await supabase.from("admin_audit_log").insert({
      actor_id: user.id,
      action: "relationship_state_updated",
      target_user_id: targetUserId,
      target_character_id: characterId,
      before_value: before as any,
      after_value: nextState as any,
    });
    return nextState;
  }, [user]);

  const recordAnalyticsEvent = useCallback(async (event_name: string, character_id?: string, mode?: string, metadata: Record<string, unknown> = {}) => {
    if (!user) return;
    await supabase.from("admin_analytics_events").insert({ user_id: user.id, event_name, character_id, mode, metadata });
  }, [user]);

  return useMemo(() => ({
    roles,
    loadingRoles,
    isAdmin,
    isDebugger,
    canDebug,
    reloadRoles,
    redeemInvite,
    createInvite,
    loadDashboard,
    updateCharacterState,
    recordAnalyticsEvent,
  }), [roles, loadingRoles, isAdmin, isDebugger, canDebug, reloadRoles, redeemInvite, createInvite, loadDashboard, updateCharacterState, recordAnalyticsEvent]);
}
