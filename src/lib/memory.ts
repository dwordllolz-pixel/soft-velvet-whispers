/**
 * Phase 4 — Memory System (client side)
 *
 * Fetch + inject for character mode, 5 main characters only.
 * All failures are swallowed — chat must never block on memory.
 */
import { supabase, supabaseEnv } from "@/integrations/supabase/client";

export const MEMORY_CHARACTERS = new Set([
  "marcus",
  "vincent",
  "eli",
  "angel",
  "raven",
  "jaxon",
  "kai",
  "mateo",
  "dr-elias",
  "ren",
  "cole",
  "sage",
]);

export interface CharacterMemoryRow {
  narrative_state: string;
}
export interface MilestoneRow {
  id: string;
  emotional_summary: string;
  emotional_weight: number;
  times_referenced: number;
  created_at: string;
}
export interface PreferenceRow {
  id: string;
  pattern: string;
  confidence: number;
}

export interface MemoryBundle {
  narrative: string | null;
  recentMilestones: MilestoneRow[]; // up to 2 most recent
  olderMilestone: MilestoneRow | null; // 1 picked older
  preferences: PreferenceRow[]; // confidence > 0.25
}

export const MEMORY_PREF_INJECT_THRESHOLD = 0.25;

/**
 * Per-character "pause memory injection" guard. Set when the user resets
 * a conversation in-chat — old memory must NOT bleed into the fresh
 * conversation until a new summarization cycle has produced new memory
 * for this character. Cleared on the next successful summarization.
 *
 * Session-scoped (in-memory only). Cleared on page reload by design.
 */
const PAUSE_KEY_PREFIX = "memory_paused_";

function pauseStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function pauseMemoryInjection(characterId: string): void {
  pauseStorage()?.setItem(PAUSE_KEY_PREFIX + characterId, "1");
}

export function isMemoryInjectionPaused(characterId: string): boolean {
  return pauseStorage()?.getItem(PAUSE_KEY_PREFIX + characterId) === "1";
}

export function clearMemoryInjectionPause(characterId: string): void {
  pauseStorage()?.removeItem(PAUSE_KEY_PREFIX + characterId);
}

export async function fetchMemoryBundle(
  userId: string,
  characterId: string,
  userMessage: string,
): Promise<MemoryBundle | null> {
  if (isMemoryInjectionPaused(characterId)) return null;
  if (!MEMORY_CHARACTERS.has(characterId)) return null;
  try {
    const [memRes, msRes, prefRes] = await Promise.all([
      supabase
        .from("character_memory")
        .select("narrative_state")
        .eq("user_id", userId)
        .eq("character_id", characterId)
        .maybeSingle(),
      supabase
        .from("character_milestones")
        .select("id, emotional_summary, emotional_weight, times_referenced, created_at")
        .eq("user_id", userId)
        .eq("character_id", characterId)
        .order("created_at", { ascending: false }),
      supabase
        .from("character_preferences")
        .select("id, pattern, confidence")
        .eq("user_id", userId)
        .eq("character_id", characterId),
    ]);

    const narrative = (memRes.data as CharacterMemoryRow | null)?.narrative_state?.trim() || null;
    const allMs = (msRes.data ?? []) as MilestoneRow[];
    const recentMilestones = allMs.slice(0, 2);
    const olderPool = allMs.slice(2);

    let olderMilestone: MilestoneRow | null = olderPool[0] ?? null; // fallback
    if (olderPool.length > 1) {
      // Try mini relevance pick — fallback already set to most recent older.
      const picked = await pickRelevantMilestone(userMessage, olderPool).catch(() => null);
      if (picked) olderMilestone = picked;
    }

    if (isMemoryInjectionPaused(characterId)) return null;

    // Increment times_referenced for whichever milestones we actually inject.
    const injected = [...recentMilestones, ...(olderMilestone ? [olderMilestone] : [])];
    if (injected.length > 0 && !isMemoryInjectionPaused(characterId)) {
      void incrementTimesReferenced(injected.map((m) => m.id));
    }

    const preferences = ((prefRes.data ?? []) as PreferenceRow[]).filter(
      (p) => (p.confidence ?? 0) > MEMORY_PREF_INJECT_THRESHOLD,
    );

    if (isMemoryInjectionPaused(characterId)) return null;
    return { narrative, recentMilestones, olderMilestone, preferences };
  } catch (e) {
    console.error("[memory] fetch failed", e);
    return null;
  }
}

async function incrementTimesReferenced(ids: string[]) {
  try {
    // Read current values then write back (no rpc available).
    const { data } = await supabase
      .from("character_milestones")
      .select("id, times_referenced")
      .in("id", ids);
    for (const row of data ?? []) {
      await supabase
        .from("character_milestones")
        .update({ times_referenced: (row.times_referenced ?? 0) + 1 })
        .eq("id", row.id);
    }
  } catch {
    // swallow
  }
}

async function pickRelevantMilestone(
  userMessage: string,
  pool: MilestoneRow[],
): Promise<MilestoneRow | null> {
  if (pool.length === 0) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return pool[0];

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 1500);
  try {
    const resp = await fetch(
      `${supabaseEnv.url}/functions/v1/pick-milestone`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: userMessage,
          memories: pool.map((m) => m.emotional_summary),
        }),
      },
    );
    if (!resp.ok) return pool[0];
    const data = await resp.json();
    const idx = typeof data?.index === "number" ? data.index : -1;
    if (idx >= 0 && idx < pool.length) return pool[idx];
    return pool[0];
  } catch {
    return pool[0];
  } finally {
    clearTimeout(t);
  }
}

const MEMORY_BLOCK_CHAR_CAP = 1500;

/** Build the memory injection block. Returns "" if nothing to inject. */
export function buildMemoryBlock(b: MemoryBundle | null, characterId?: string): string {
  // Safety net: even if a stale bundle is held in a ref, the injection guard
  // must still suppress it until the next summarization cycle clears it.
  if (characterId && isMemoryInjectionPaused(characterId)) {
    console.log("[memory] injection paused — skipping block assembly");
    return "";
  }
  if (!b) return "";
  const parts: string[] = [];
  if (b.narrative) parts.push(`RELATIONSHIP MEMORY:\n${b.narrative}`);

  const moments = [
    ...b.recentMilestones.map((m) => m.emotional_summary),
    ...(b.olderMilestone ? [b.olderMilestone.emotional_summary] : []),
  ].filter(Boolean);
  if (moments.length > 0) {
    parts.push(`KEY MOMENTS:\n${moments.map((m) => `- ${m}`).join("\n")}`);
  }

  if (b.preferences.length > 0) {
    parts.push(
      `LEARNED PATTERNS:\n${b.preferences.map((p) => `- ${p.pattern}`).join("\n")}`,
    );
  }

  if (parts.length === 0) return "";
  let block = parts.join("\n\n");
  if (block.length > MEMORY_BLOCK_CHAR_CAP) {
    // Drop preferences first, then older milestone, then recent milestones.
    const fallbackParts: string[] = [];
    if (b.narrative) fallbackParts.push(`RELATIONSHIP MEMORY:\n${b.narrative}`);
    const recentOnly = b.recentMilestones.map((m) => m.emotional_summary);
    if (recentOnly.length) {
      fallbackParts.push(`KEY MOMENTS:\n${recentOnly.map((m) => `- ${m}`).join("\n")}`);
    }
    block = fallbackParts.join("\n\n").slice(0, MEMORY_BLOCK_CHAR_CAP);
  }
  return block;
}

/**
 * Background trigger for summarization. Caller passes the latest exchange
 * weight; the cycle only fires when weight > 0.2 AND it's the 5th qualifying
 * exchange. Fully fire-and-forget — never blocks chat.
 *
 * Returns true if a summarization cycle was actually triggered.
 */
const QUALIFY_THRESHOLD = 0.2;
const CYCLE_EVERY = 5;

export interface MemoryCounterState {
  count: number;
}

export function shouldSummarize(
  weight: number,
  counter: MemoryCounterState,
): boolean {
  if (weight <= QUALIFY_THRESHOLD) return false;
  counter.count += 1;
  if (counter.count >= CYCLE_EVERY) {
    counter.count = 0;
    return true;
  }
  return false;
}

export function fireSummarization(opts: {
  characterId: string;
  messages: Array<{ role: string; content: string }>;
  lastEventWeight: number;
}): void {
  const { characterId, messages, lastEventWeight } = opts;
  if (!MEMORY_CHARACTERS.has(characterId)) return;

  console.log("[memory] summarization cycle firing", {
    characterId,
    lastEventWeight,
    messages: messages.length,
  });

  void (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        console.warn("[memory] no access token, skipping cycle");
        return;
      }
      const resp = await fetch(
        `${supabaseEnv.url}/functions/v1/summarize-memory`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            characterId,
            messages: messages.slice(-10),
            lastEventWeight,
          }),
        },
      );
      if (!resp.ok) {
        console.warn("[memory] cycle non-ok", resp.status);
        return;
      }
      const data = await resp.json().catch(() => null);
      console.log("[memory] summarization cycle complete", data);
      // First successful cycle after an in-chat reset re-enables injection.
      if (isMemoryInjectionPaused(characterId)) {
        clearMemoryInjectionPause(characterId);
        console.log("[memory] injection guard cleared for", characterId);
      }
    } catch (e) {
      console.warn("[memory] cycle failed (swallowed)", e);
    }
  })();
}

/**
 * Hard-delete every memory row (narrative, milestones, preferences) for
 * this user across ALL characters. Used by Settings → "Reset Relationship
 * Memory" and by the full "Reset All Chats" flow.
 */
export async function deleteAllMemory(userId: string): Promise<void> {
  const [m, ms, p] = await Promise.all([
    supabase.from("character_memory").delete().eq("user_id", userId),
    supabase.from("character_milestones").delete().eq("user_id", userId),
    supabase.from("character_preferences").delete().eq("user_id", userId),
  ]);
  if (m.error) throw m.error;
  if (ms.error) throw ms.error;
  if (p.error) throw p.error;
}

/**
 * Per-character counterpart to deleteAllMemory. Added July 2026 to enforce
 * the Relationship State V2 reset invariant (RELATIONSHIP_STATE_V2.md,
 * Section 4): every representation of a relationship must reset together.
 * Previously, only an account-wide memory wipe existed — the per-character
 * "Reset Conversation" flow in Chat.tsx had no way to clear just one
 * character's memory rows, which is exactly how axes and memory narrative
 * ended up able to diverge for a single character.
 */
export async function deleteCharacterMemory(userId: string, characterId: string): Promise<void> {
  const [m, ms, p] = await Promise.all([
    supabase.from("character_memory").delete().eq("user_id", userId).eq("character_id", characterId),
    supabase.from("character_milestones").delete().eq("user_id", userId).eq("character_id", characterId),
    supabase.from("character_preferences").delete().eq("user_id", userId).eq("character_id", characterId),
  ]);
  if (m.error) throw m.error;
  if (ms.error) throw ms.error;
  if (p.error) throw p.error;
}
