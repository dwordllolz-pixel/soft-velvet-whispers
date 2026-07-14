// V2: Add more detailed narrative context to the Gemini prompt.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_MILESTONES = 10;
const MILESTONE_IMPORTANCE = 0.7;
const PREF_FLOOR = 0.2;
const PREF_DECAY = 0.02;
const PREF_START = 0.6;
const MAX_PREFERENCES = 15;
const THREAD_STALE_DAYS = 14;
const MAX_HISTORY = 5;

// Valid values for dimension fields — guards against model drift
const VALID_TRUST = new Set(["increasing", "stable", "decreasing"]);
const VALID_OPENNESS = new Set(["high", "moderate", "low"]);
const VALID_ATTACHMENT = new Set(["strong", "growing", "distant"]);

interface Msg { role: "user" | "assistant"; content: string }

interface RelationshipDimensions {
  trust: string;
  openness: string;
  attachment: string;
}

interface HistoryEntry {
  thread: string;
  importance: number;
  timestamp: string;
}

interface RelationshipState {
  memory_version: number;
  cycle_count: number;
  last_significant_update: string;
  emotional_thread: string;
  thread_importance: number;
  dimensions: RelationshipDimensions;
  history: HistoryEntry[];
}

interface ExtractedEvent {
  description: string;
  importance: number;
}

interface ExtractionResult {
  schema_version: number;
  events: ExtractedEvent[];
  preferences: string[];
  relationship_state: {
    emotional_thread: string;
    thread_importance: number;
    dimensions: RelationshipDimensions;
  };
}

function clamp01(val: unknown): number {
  const n = Number(val);
  if (isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function daysSince(isoTimestamp: string): number {
  const ms = Date.now() - new Date(isoTimestamp).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function buildNarrative(state: RelationshipState): string {
  const trustPhrases: Record<string, string> = {
    increasing: "has been building trust with the character",
    stable: "maintains a stable level of trust with the character",
    decreasing: "has seen some erosion of trust with the character",
  };
  const opennessPhrases: Record<string, string> = {
    high: "Emotional openness is high",
    moderate: "Emotional openness is moderate",
    low: "Emotional openness remains low",
  };
  const attachmentPhrases: Record<string, string> = {
    strong: "Attachment appears strong",
    growing: "Attachment is growing",
    distant: "Attachment remains distant",
  };

  const trust = trustPhrases[state.dimensions.trust] ?? `trust is ${state.dimensions.trust}`;
  const openness = opennessPhrases[state.dimensions.openness] ?? `openness is ${state.dimensions.openness}`;
  const attachment = attachmentPhrases[state.dimensions.attachment] ?? `attachment is ${state.dimensions.attachment}`;

  const parts = [
    `The user ${trust}.`,
    `${openness}.`,
    `${attachment}.`,
  ];
  if (state.emotional_thread) {
    parts.push(`The current emotional focus is ${state.emotional_thread}.`);
  }

  return parts.join(" ").slice(0, 500);
}

function threadWordOverlap(a: string, b: string): number {
  const words = (s: string) =>
    new Set(s.toLowerCase().match(/[a-z]+/g)?.filter((w) => w.length > 3) ?? []);
  const aWords = words(a);
  const bWords = words(b);
  if (aWords.size === 0) return 0;
  let overlap = 0;
  for (const w of bWords) {
    if (aWords.has(w)) overlap++;
  }
  return overlap / aWords.size;
}

function shouldReplaceThread(
  existing: RelationshipState,
  newThread: string,
  newImportance: number,
): boolean {
  if (!existing.emotional_thread) return true;

  // Major emotional event — promote immediately regardless of theme
  if (newImportance >= 0.9) return true;

  // Stale thread — lower bar for replacement
  if (
    daysSince(existing.last_significant_update) >= THREAD_STALE_DAYS &&
    newImportance >= 0.6
  ) return true;

  // If the thread text is largely the same topic, don't replace — just update importance
  const similarity = threadWordOverlap(existing.emotional_thread, newThread);
  if (similarity >= 0.5) return false;

  // Different topic — allow replacement if materially more important
  if (newImportance > existing.thread_importance + 0.1) return true;

  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ---- Auth ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // ---- Payload validation ----
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 100_000) {
      return new Response(JSON.stringify({ error: "Payload too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { characterId, messages, lastEventWeight: _lastEventWeight } = body ?? {};

    if (typeof characterId !== "string" || !characterId) {
      return new Response(JSON.stringify({ error: "characterId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Build dialogue string ----
    // No slice here — memory.ts controls window size (update to slice(-20) there).
    const MAX_MSG_CHARS = 2000;
    const MAX_DIALOGUE_CHARS = 20000;
    let dialogue = (messages as Msg[])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => `${m.role === "user" ? "USER" : "HIM"}: ${m.content.trim().slice(0, MAX_MSG_CHARS)}`)
      .join("\n");
    if (dialogue.length > MAX_DIALOGUE_CHARS) dialogue = dialogue.slice(0, MAX_DIALOGUE_CHARS);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

    // ---- Fetch existing relationship state ----
    const { data: existingMemory } = await supabase
      .from("character_memory")
      .select("narrative_state, relationship_state")
      .eq("user_id", userId)
      .eq("character_id", characterId)
      .maybeSingle();

    const existingState: RelationshipState = (existingMemory?.relationship_state as RelationshipState) ?? {
      memory_version: 1,
      cycle_count: 0,
      last_significant_update: new Date().toISOString(),
      emotional_thread: "",
      thread_importance: 0,
      dimensions: { trust: "stable", openness: "moderate", attachment: "distant" },
      history: [],
    };

    // ---- Build current state context for Gemini ----
    const currentStateContext = existingState.emotional_thread
      ? `CURRENT RELATIONSHIP STATE (do not erase this without clear evidence of change):
Trust: ${existingState.dimensions.trust}
Openness: ${existingState.dimensions.openness}
Attachment: ${existingState.dimensions.attachment}
Current emotional thread: ${existingState.emotional_thread} (importance: ${existingState.thread_importance})

Only update dimensions or emotional_thread if this conversation provides clear evidence of a shift. When in doubt, preserve the existing values.`
      : "No prior relationship state. Extract from this conversation only.";

    // ---- Single extraction pass ----
    const extractionPrompt = `You are extracting structured memory data from a conversation between a user and an AI companion character.

${currentStateContext}

Return ONLY valid JSON matching this exact structure. No markdown. No explanation. No code fences.

{
  "schema_version": 1,
  "events": [
    { "description": "one complete factual sentence about what happened", "importance": 0.0 }
  ],
  "preferences": [
    "how the user likes to be engaged — behavioral style only, not topics or facts"
  ],
  "relationship_state": {
    "emotional_thread": "short phrase — dominant emotional theme of this relationship right now",
    "thread_importance": 0.0,
    "dimensions": {
      "trust": "increasing | stable | decreasing",
      "openness": "high | moderate | low",
      "attachment": "strong | growing | distant"
    }
  }
}

EVENTS rules:
- Extract 1–4 meaningful things that actually happened between the user and the character.
- Each description: one complete sentence, past tense, factual.
- importance: 0.9+ for major emotional disclosure or confession, 0.7–0.89 for meaningful personal exchange, 0.5–0.69 for notable moments, skip below 0.5.
- Do NOT describe atmosphere, tone, or personality traits.
- If nothing meaningful happened, return an empty events array.

Good event examples:
{ "description": "The user admitted he struggles to let people into his life and has felt lonely for longer than he realized.", "importance": 0.91 }
{ "description": "The user challenged the character's habit of redirecting conversation away from himself.", "importance": 0.74 }

Bad event examples — never do these:
{ "description": "The character maintained a composed demeanor." }
{ "description": "The exchange carried emotional weight." }
{ "description": "The user pressed the character." }

RELATIONSHIP STATE rules:
- emotional_thread: short phrase for the dominant emotional theme. Only change if this conversation clearly shifts it.
- thread_importance: 0.0–1.0. How emotionally significant this thread is.
- dimensions: ONLY change a value if this conversation provides clear evidence. Valid values only:
  trust → "increasing" | "stable" | "decreasing"
  openness → "high" | "moderate" | "low"
  attachment → "strong" | "growing" | "distant"

PREFERENCES rules:
- 0–2 items only.
- HOW the user likes to be engaged — behavioral style.
- Good: "responds well to direct emotional honesty", "prefers being challenged over reassured"
- Bad: topics, facts, names, specific events.
- Return empty array if nothing clear emerges.

Return ONLY the JSON object. Nothing else.`;

    // Default extraction falls back to existing state so no data is lost on parse failure
    let extraction: ExtractionResult = {
      schema_version: 1,
      events: [],
      preferences: [],
      relationship_state: {
        emotional_thread: existingState.emotional_thread,
        thread_importance: existingState.thread_importance,
        dimensions: { ...existingState.dimensions },
      },
    };

    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GEMINI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: extractionPrompt },
            { role: "user", content: dialogue },
          ],
          max_completion_tokens: 500,
        }),
      });

      if (r.ok) {
        const j = await r.json();
        const raw = (j.choices?.[0]?.message?.content ?? "").trim();

        console.log("[summarize-memory] finish_reason:", j.choices?.[0]?.finish_reason);
        console.log("[summarize-memory] raw extraction:", raw);

        const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();

        try {
          const parsed = JSON.parse(cleaned);
          const rs = parsed?.relationship_state ?? {};

          // Validate and clamp all values before accepting them
          const parsedTrust = rs?.dimensions?.trust;
          const parsedOpenness = rs?.dimensions?.openness;
          const parsedAttachment = rs?.dimensions?.attachment;

          extraction = {
            schema_version: parsed?.schema_version ?? 1,
            events: Array.isArray(parsed?.events)
              ? parsed.events
                  .filter(
                    (e: unknown) =>
                      e &&
                      typeof (e as ExtractedEvent).description === "string" &&
                      (e as ExtractedEvent).description.trim().length > 10 &&
                      typeof (e as ExtractedEvent).importance === "number",
                  )
                  .map((e: ExtractedEvent) => ({
                    description: e.description.trim(),
                    importance: clamp01(e.importance),
                  }))
              : [],
            preferences: Array.isArray(parsed?.preferences)
              ? parsed.preferences.filter(
                  (p: unknown) => typeof p === "string" && (p as string).trim().length > 0,
                )
              : [],
            relationship_state: {
              emotional_thread:
                typeof rs?.emotional_thread === "string" && rs.emotional_thread.trim()
                  ? rs.emotional_thread.trim()
                  : existingState.emotional_thread,
              thread_importance: clamp01(rs?.thread_importance ?? existingState.thread_importance),
              dimensions: {
                // Only accept valid whitelisted values — fall back to existing on invalid
                trust: VALID_TRUST.has(parsedTrust) ? parsedTrust : existingState.dimensions.trust,
                openness: VALID_OPENNESS.has(parsedOpenness) ? parsedOpenness : existingState.dimensions.openness,
                attachment: VALID_ATTACHMENT.has(parsedAttachment) ? parsedAttachment : existingState.dimensions.attachment,
              },
            },
          };
        } catch (parseErr) {
          console.error("[summarize-memory] extraction parse error:", parseErr, "raw:", cleaned);
          // extraction stays as default (existing state) — no data loss
        }
      } else {
        console.error("[summarize-memory] extraction gateway error:", r.status);
      }
    } catch (e) {
      console.error("[summarize-memory] extraction fetch error:", e);
    }

    console.log("[summarize-memory] extracted events:", extraction.events.length, extraction.events);
    console.log("[summarize-memory] extracted preferences:", extraction.preferences);
    console.log("[summarize-memory] extracted relationship_state:", extraction.relationship_state);

    // ---- Update relationship state ----
    const newThread = extraction.relationship_state.emotional_thread;
    const newThreadImportance = extraction.relationship_state.thread_importance;
    const now = new Date().toISOString();

    const threadChanged = shouldReplaceThread(existingState, newThread, newThreadImportance);

    // Same thread (high word overlap) — allow importance to update upward even without replacement
    const sameThread =
      existingState.emotional_thread
        ? threadWordOverlap(existingState.emotional_thread, newThread) >= 0.5
        : false;

    const resolvedImportance = sameThread
      ? Math.max(existingState.thread_importance, newThreadImportance)
      : threadChanged
        ? newThreadImportance
        : existingState.thread_importance;

    // Only push to history when the thread actually changes — prevents history pollution
    let updatedHistory = existingState.history ?? [];
    if (threadChanged && existingState.emotional_thread) {
      updatedHistory = [
        {
          thread: existingState.emotional_thread,
          importance: existingState.thread_importance,
          timestamp: now,
        },
        ...updatedHistory,
      ].slice(0, MAX_HISTORY);
    }

    const updatedState: RelationshipState = {
      memory_version: 1,
      cycle_count: (existingState.cycle_count ?? 0) + 1,
      last_significant_update: threadChanged ? now : existingState.last_significant_update,
      emotional_thread: threadChanged ? newThread : existingState.emotional_thread,
      thread_importance: resolvedImportance,
      dimensions: extraction.relationship_state.dimensions,
      history: updatedHistory,
    };

    // ---- Assemble narrative from updated state ----
    const narrativeState = buildNarrative(updatedState);
    console.log("[summarize-memory] assembled narrative:", narrativeState);

    // ---- Write to character_memory ----
    if (narrativeState.length > 0) {
      const { error: upErr } = await supabase
        .from("character_memory")
        .upsert(
          {
            user_id: userId,
            character_id: characterId,
            narrative_state: narrativeState,
            memory_text: narrativeState,
            relationship_state: updatedState,
            updated_at: now,
          },
          { onConflict: "user_id,character_id" },
        );
      if (upErr) console.error("[summarize-memory] memory upsert error:", upErr);
      else console.log("[summarize-memory] memory written successfully");
    }

    // ---- Milestones from high-importance events ----
    let milestoneInserted = false;
    const milestoneEvents = extraction.events.filter((e) => e.importance >= MILESTONE_IMPORTANCE);

    if (milestoneEvents.length === 0) {
      console.log("[summarize-memory] no milestone-worthy events");
    } else {
      const { data: existing } = await supabase
        .from("character_milestones")
        .select("id, emotional_summary, emotional_weight, times_referenced, created_at")
        .eq("user_id", userId)
        .eq("character_id", characterId)
        .order("created_at", { ascending: true });

      // Track list length locally so cap check stays accurate across loop iterations
      let listLength = (existing ?? []).length;
      const list = existing ?? [];

      const significantWords = (s: string): string[] =>
        s.toLowerCase().match(/[a-z]+/g)?.filter((w) => w.length > 4) ?? [];

      for (const event of milestoneEvents) {
        const summary = event.description;
        const newWords = significantWords(summary);
        const newWordSet = new Set(newWords);
        let bestMatch: { id: string; times_referenced: number; ratio: number } | null = null;

        if (newWords.length > 0) {
          for (const m of list) {
            const existingWords = new Set(significantWords(m.emotional_summary ?? ""));
            let overlap = 0;
            for (const w of newWordSet) {
              if (existingWords.has(w)) overlap++;
            }
            const ratio = overlap / newWordSet.size;
            if (!bestMatch || ratio > bestMatch.ratio) {
              bestMatch = { id: m.id, times_referenced: m.times_referenced ?? 0, ratio };
            }
          }
        }

        if (bestMatch && bestMatch.ratio > 0.4) {
          console.log("[summarize-memory] milestone deduplicated:", summary);
          await supabase
            .from("character_milestones")
            .update({ times_referenced: bestMatch.times_referenced + 1 })
            .eq("id", bestMatch.id);
        } else {
          if (listLength >= MAX_MILESTONES) {
            const droppable = list.find((m) => (m.times_referenced ?? 0) <= 2);
            const toDrop =
              droppable ??
              [...list].sort(
                (a, b) => (a.emotional_weight ?? 0) - (b.emotional_weight ?? 0),
              )[0];
            if (toDrop) {
              await supabase.from("character_milestones").delete().eq("id", toDrop.id);
              listLength -= 1;
            }
          }

          const { error: insErr } = await supabase.from("character_milestones").insert({
            user_id: userId,
            character_id: characterId,
            milestone_type: "emotional",
            milestone_text: summary,
            emotional_summary: summary,
            emotional_weight: event.importance,
            times_referenced: 0,
          });

          if (insErr) {
            console.error("[summarize-memory] milestone insert error:", insErr);
          } else {
            console.log("[summarize-memory] milestone inserted:", summary);
            milestoneInserted = true;
            listLength += 1;
          }
        }
      }
    }

    // ---- Learned preferences ----
    try {
      const newPrefs = extraction.preferences;

      const { data: currentPrefs } = await supabase
        .from("character_preferences")
        .select("id, pattern, confidence")
        .eq("user_id", userId)
        .eq("character_id", characterId);

      const current = currentPrefs ?? [];
      // Track running count to keep cap accurate across insertions
      let prefCount = current.length;

      for (const p of newPrefs) {
        const trimmed = (p ?? "").trim();
        if (!trimmed) continue;

        const match = current.find(
          (c) => c.pattern?.trim().toLowerCase() === trimmed.toLowerCase(),
        );

        if (match) {
          const newConf = Math.min(1, (Number(match.confidence) || PREF_START) + 0.05);
          await supabase
            .from("character_preferences")
            .update({ confidence: newConf, last_updated: now })
            .eq("id", match.id);
        } else {
          // Enforce cap before inserting
          if (prefCount >= MAX_PREFERENCES) {
            const lowest = [...current].sort(
              (a, b) => (Number(a.confidence) || 0) - (Number(b.confidence) || 0),
            )[0];
            if (lowest) {
              await supabase.from("character_preferences").delete().eq("id", lowest.id);
              prefCount -= 1;
            }
          }

          await supabase.from("character_preferences").insert({
            user_id: userId,
            character_id: characterId,
            pattern: trimmed,
            confidence: PREF_START,
            first_seen: now,
            last_updated: now,
          });
          prefCount += 1;
        }
      }

      // Decay only when new prefs were extracted this cycle
      if (newPrefs.length > 0) {
        const reaffirmed = new Set(newPrefs.map((p) => (p ?? "").trim().toLowerCase()));
        for (const c of current) {
          if (!reaffirmed.has(c.pattern?.trim().toLowerCase() ?? "")) {
            const next = Math.max(PREF_FLOOR, (Number(c.confidence) || PREF_START) - PREF_DECAY);
            if (next !== Number(c.confidence)) {
              await supabase
                .from("character_preferences")
                .update({ confidence: next, last_updated: now })
                .eq("id", c.id);
            }
          }
        }
      }
    } catch (e) {
      console.error("[summarize-memory] prefs error:", e);
    }

    return new Response(
      JSON.stringify({ ok: true, narrative: narrativeState, milestone: milestoneInserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[summarize-memory] fatal:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});