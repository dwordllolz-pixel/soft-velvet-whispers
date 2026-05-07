/**
 * Phase 1 — useUserProfile
 *
 * Loads the signed-in user's `users.profile_data`, runs the version migration,
 * and exposes a setter that PATCHES specific paths (preferences, a single
 * character, memory blob, etc.) without round-tripping the whole document.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import {
  DEFAULT_CHARACTER_STATE,
  DEFAULT_PROFILE,
  migrateProfileData,
  type CharacterState,
  type Preferences,
  type ProfileData,
} from "@/types/profile";

interface UserProfileContextValue {
  profile: ProfileData;
  loading: boolean;
  /** Patch the entire preferences object (shallow-merged). */
  updatePreferences: (patch: Partial<Preferences>) => Promise<void>;
  /** Replace a single character's state. */
  setCharacterState: (characterId: string, next: CharacterState) => Promise<void>;
  /**
   * Reset a single character's relationship state (axes, message_count,
   * daily_count, attachmentShift, label) back to defaults. Other characters
   * and all preferences are untouched. Single atomic write.
   */
  resetCharacterState: (characterId: string) => Promise<void>;
  /**
   * Reset EVERY character's relationship state in a single atomic write.
   * Avoids the race where parallel setCharacterState calls clobber each
   * other (each one reads profileRef and writes back the whole document).
   */
  resetAllCharacterStates: () => Promise<void>;
  /** Update the last-active character pointer + meta. */
  touchCharacter: (characterId: string) => Promise<void>;
  /** Force a reload from the server (e.g. after account switch). */
  reload: () => Promise<void>;
}

const UserProfileContext = createContext<UserProfileContextValue | undefined>(undefined);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  /** In-flight version of profile so rapid patches don't clobber each other. */
  const profileRef = useRef<ProfileData>(DEFAULT_PROFILE);

  const writeBack = useCallback(
    async (next: ProfileData) => {
      profileRef.current = next;
      setProfile(next);
      if (!user) return;
      const { error } = await supabase
        .from("users")
        .update({ profile_data: next as unknown as Json })
        .eq("id", user.id);
      if (error) console.warn("[useUserProfile] write failed:", error.message);
    },
    [user]
  );

  const reload = useCallback(async () => {
    if (!user) {
      profileRef.current = DEFAULT_PROFILE;
      setProfile(DEFAULT_PROFILE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("users")
        .select("profile_data")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.warn("User profile fetch failed:", error.message, "— using defaults");
        profileRef.current = DEFAULT_PROFILE;
        setProfile(DEFAULT_PROFILE);
        setLoading(false);
        return;
      }

      if (!data) {
        // Row missing — try to create it, but fall back to defaults if blocked
        try {
          const { data: created } = await supabase
            .from("users")
            .insert({ id: user.id })
            .select("profile_data")
            .maybeSingle();
          const migrated = migrateProfileData(created?.profile_data);
          profileRef.current = migrated;
          setProfile(migrated);
        } catch (insertErr) {
          console.warn("User profile create failed, using defaults:", insertErr);
          profileRef.current = DEFAULT_PROFILE;
          setProfile(DEFAULT_PROFILE);
        }
      } else {
        const migrated = migrateProfileData(data.profile_data);
        profileRef.current = migrated;
        setProfile(migrated);
        if (JSON.stringify(migrated) !== JSON.stringify(data.profile_data)) {
          void writeBack(migrated);
        }
      }
    } catch (err) {
      console.warn("User profile fetch failed:", err, "— using defaults");
      profileRef.current = DEFAULT_PROFILE;
      setProfile(DEFAULT_PROFILE);
    } finally {
      setLoading(false);
    }
  }, [user, writeBack]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updatePreferences = useCallback(
    async (patch: Partial<Preferences>) => {
      const next: ProfileData = {
        ...profileRef.current,
        preferences: { ...profileRef.current.preferences, ...patch },
      };
      await writeBack(next);
    },
    [writeBack]
  );

  const setCharacterState = useCallback(
    async (characterId: string, charState: CharacterState) => {
      const next: ProfileData = {
        ...profileRef.current,
        characters: { ...profileRef.current.characters, [characterId]: charState },
      };
      await writeBack(next);
    },
    [writeBack]
  );

  const resetCharacterState = useCallback(
    async (characterId: string) => {
      const fresh: CharacterState = { ...DEFAULT_CHARACTER_STATE };
      const next: ProfileData = {
        ...profileRef.current,
        characters: { ...profileRef.current.characters, [characterId]: fresh },
      };
      await writeBack(next);
    },
    [writeBack]
  );

  const resetAllCharacterStates = useCallback(async () => {
    const cur = profileRef.current;
    const resetChars: Record<string, CharacterState> = {};
    for (const id of Object.keys(cur.characters)) {
      resetChars[id] = { ...DEFAULT_CHARACTER_STATE };
    }
    const next: ProfileData = { ...cur, characters: resetChars };
    await writeBack(next);
  }, [writeBack]);

  const touchCharacter = useCallback(
    async (characterId: string) => {
      const cur = profileRef.current;
      const next: ProfileData = {
        ...cur,
        meta: { ...cur.meta, last_used_character: characterId, total_sessions: cur.meta.total_sessions + 1 },
      };
      profileRef.current = next;
      setProfile(next);
      if (!user) return;
      await supabase
        .from("users")
        .update({
          last_active_character: characterId,
          profile_data: next as unknown as Json,
        })
        .eq("id", user.id);
    },
    [user]
  );

  return (
    <UserProfileContext.Provider
      value={{
        profile,
        loading,
        updatePreferences,
        setCharacterState,
        resetCharacterState,
        resetAllCharacterStates,
        touchCharacter,
        reload,
      }}
    >
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile(): UserProfileContextValue {
  const ctx = useContext(UserProfileContext);
  if (!ctx) throw new Error("useUserProfile must be used within UserProfileProvider");
  return ctx;
}
