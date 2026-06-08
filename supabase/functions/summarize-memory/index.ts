import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_MILESTONES = 10;
const MILESTONE_THRESHOLD = 0.7;
const PREF_FLOOR = 0.2;
const PREF_DECAY = 0.1;
const PREF_START = 0.6;

interface Msg { role: "user" | "assistant"; content: string }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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

    const contentLength = Number(req.headers.get("content-length") || 0);

    if (contentLength > 100_000) {
      return new Response(
        JSON.stringify({ error: "Payload too large" }),
        {
          status: 413,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const body = await req.json();
    const { characterId, messages, lastEventWeight } = body ?? {};

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

    const MAX_MSG_CHARS = 2000;
    const MAX_DIALOGUE_CHARS = 20000;
    let dialogue = (messages as Msg[])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-10)
      .map((m) => `${m.role === "user" ? "USER" : "HIM"}: ${m.content.trim().slice(0, MAX_MSG_CHARS)}`)
      .join("\n");
    if (dialogue.length > MAX_DIALOGUE_CHARS) dialogue = dialogue.slice(0, MAX_DIALOGUE_CHARS);

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");

    // ---- Layer 1: Narrative state (rewrite) ----
    const narrativePrompt = `You are writing long-term memory for an AI companion character system.

Your output will be read by the character in future conversations to remember what happened.

Write 2-3 sentences in past tense. Record what occurred between the user and the character — not the character's personality or writing style.

Structure your answer around:
1. What the user did or said (their behavior, not just their words)
2. How the character actually responded
3. What shifted in the relationship as a result

Bad (character analysis — DO NOT do this):
"The character maintained a steady and composed demeanor."

Bad (atmosphere — DO NOT do this):
"The exchange carried a quiet tenderness and emotional weight."

Good (what actually happened):
"The user pushed for emotional honesty and closed physical distance deliberately. The character responded with measured openness, acknowledging the user's directness rather than deflecting. The interaction moved from polite tension into something more personally engaged."

Rules:
- Past tense only
- No poetry, no atmosphere, no prose style
- No incomplete sentences
- Record events and changes, not personality traits
- If nothing meaningful happened, write: The conversation was casual with no significant relational development.

Return ONLY the memory. No labels, no preamble.`;

    let narrativeState = "";
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
            { role: "system", content: narrativePrompt },
            { role: "user", content: dialogue },
          ],
          max_completion_tokens: 150,
        }),
      });
      if (r.ok) {
        const j = await r.json();

        console.log(
          "[summarize-memory] raw narrative response:",
          JSON.stringify(j, null, 2)
        );

        console.log(
          "[summarize-memory] finish reason:",
          j.choices?.[0]?.finish_reason
        );

        narrativeState = (j.choices?.[0]?.message?.content ?? "").trim();

        console.log(
          "[summarize-memory] extracted narrative:",
          narrativeState
        );

        console.log(
          "[summarize-memory] narrative length:",
          narrativeState.length
        );
      } else {
        console.error("[summarize-memory] narrative gateway error", r.status);
      }
    } catch (e) {
      console.error("[summarize-memory] narrative error", e);
    }

    if (narrativeState && narrativeState.length >= 40 && /[.!?]$/.test(narrativeState.trim())) {
      const memoryPayload = {
        user_id: userId,
        character_id: characterId,
        narrative_state: narrativeState,
        memory_text: narrativeState,
        updated_at: new Date().toISOString(),
      };

      const { error: upErr } = await supabase
        .from("character_memory")
        .upsert(memoryPayload, {
          onConflict: "user_id,character_id",
        });
      if (upErr) console.error("[summarize-memory] memory upsert error", upErr);
    } else if (narrativeState) {
      console.warn("[memory] rejected malformed summary — too short", narrativeState);
    }

    // ---- Layer 2: Milestone (only if weight high) ----
    const weight = typeof lastEventWeight === "number" ? lastEventWeight : 0;
    if (weight > MILESTONE_THRESHOLD && narrativeState) {
      const milestonePrompt = `
      Determine whether this conversation contains
      a meaningful emotional turning point.

      Examples:
      - emotional vulnerability
      - confession
      - trust shift
      - emotional breakthrough
      - conflict escalation
      - reconciliation
      - deepening intimacy

      If YES:
      Return ONE short sentence summarizing the emotional turning point.

      If NO:
      Return exactly:
      NONE

      Return only the result.
      `;

      let summary = "";

      try {
        const milestoneResp = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${GEMINI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "gemini-2.5-flash",
              messages: [
                { role: "system", content: milestonePrompt },
                { role: "user", content: dialogue },
              ],
              max_completion_tokens: 80,
            }),
          }
        );

        if (milestoneResp.ok) {
          const milestoneJson = await milestoneResp.json();

          summary = (
            milestoneJson?.choices?.[0]?.message?.content ?? ""
          )
            .toString()
            .trim();

          if (summary === "NONE") {
            summary = "";
          }
        }
      } catch (e) {
        console.error("[summarize-memory] milestone generation error", e);
      }

      if (!summary) {
        console.log("[summarize-memory] milestone skipped — no milestone detected");
      } else {
        const { data: existing } = await supabase
          .from("character_milestones")
          .select("id, emotional_summary, emotional_weight, times_referenced, created_at")
          .eq("user_id", userId)
          .eq("character_id", characterId)
          .order("created_at", { ascending: true });

        const list = existing ?? [];

        // Quality gate Check 2 — Deduplication
        const significantWords = (s: string): string[] =>
          s.toLowerCase().match(/[a-z]+/g)?.filter((w) => w.length > 4) ?? [];

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
          console.log("[summarize-memory] milestone deduplicated");
          await supabase
            .from("character_milestones")
            .update({ times_referenced: bestMatch.times_referenced + 1 })
            .eq("id", bestMatch.id);
        } else {
          if (list.length >= MAX_MILESTONES) {
            // 1) drop oldest where times_referenced <= 2
            const droppable = list.find((m) => (m.times_referenced ?? 0) <= 2);
            const toDrop = droppable ?? [...list].sort((a, b) => (a.emotional_weight ?? 0) - (b.emotional_weight ?? 0))[0];
            if (toDrop) {
              await supabase.from("character_milestones").delete().eq("id", toDrop.id);
            }
          }

          const { error: insErr } = await supabase
          .from("character_milestones")
          .insert({
            user_id: userId,
            character_id: characterId,
            milestone_type: "emotional",
            milestone_text: summary,
            emotional_summary: summary,
            emotional_weight: weight,
            times_referenced: 0,
          });
          if (insErr) console.error("[summarize-memory] milestone insert error", insErr);
        }
      }
    }

    // ---- Layer 3: Learned preferences ----
    try {
      const prefPrompt = `
        Identify 0–2 stable user behavioral preferences emerging from this conversation.

        A preference is HOW the user likes to be related to.

        GOOD:
        - "responds well to brief, grounded reassurance"
        - "prefers gentle teasing before praise"

        BAD:
        - topics
        - events
        - factual memories
        - specific names

        Return ONLY valid JSON in this format:

        {
          "preferences": ["preference 1", "preference 2"]
        }

        If nothing clear emerges:

        {
          "preferences": []
        }
        IMPORTANT: Return ONLY valid JSON. No explanations. No markdown. No code fences.
        `;

      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GEMINI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: prefPrompt },
            { role: "user", content: dialogue },
          ],
          max_completion_tokens: 200,
        }),
      });

      if (r.ok) {
        const j = await r.json();
        const argsStr = j.choices?.[0]?.message?.content;
        if (argsStr) {
          const cleaned = argsStr.replace(/```json\n?|```\n?/g, "").trim();
          const parsed = JSON.parse(cleaned);
          const newPrefs: string[] = Array.isArray(parsed?.preferences) ? parsed.preferences : [];

          const { data: currentPrefs } = await supabase
            .from("character_preferences")
            .select("id, pattern, confidence")
            .eq("user_id", userId)
            .eq("character_id", characterId);

          const current = currentPrefs ?? [];

          for (const p of newPrefs) {
            const trimmed = (p ?? "").trim();
            if (!trimmed) continue;
            const match = current.find(
              (c) => c.pattern.trim().toLowerCase() === trimmed.toLowerCase(),
            );
            if (match) {
              const newConf = Math.min(1, (match.confidence ?? PREF_START) + 0.05);
              await supabase
                .from("character_preferences")
                .update({ confidence: newConf, last_updated: new Date().toISOString() })
                .eq("id", match.id);
            } else {
              await supabase.from("character_preferences").insert({
                user_id: userId,
                character_id: characterId,
                pattern: trimmed,
                confidence: PREF_START,
              });
            }
          }

          // Decay any current preference NOT reaffirmed this cycle
          const reaffirmed = new Set(newPrefs.map((p) => (p ?? "").trim().toLowerCase()));
          for (const c of current) {
            if (!reaffirmed.has(c.pattern.trim().toLowerCase())) {
              const next = Math.max(PREF_FLOOR, (c.confidence ?? PREF_START) - PREF_DECAY);
              if (next !== c.confidence) {
                await supabase
                  .from("character_preferences")
                  .update({ confidence: next, last_updated: new Date().toISOString() })
                  .eq("id", c.id);
              }
            }
          }
        }
      } else {
        console.error("[summarize-memory] prefs gateway error", r.status);
      }
    } catch (e) {
      console.error("[summarize-memory] prefs error", e);
    }

    return new Response(
      JSON.stringify({ ok: true, narrative: narrativeState, milestone: weight > MILESTONE_THRESHOLD }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[summarize-memory] fatal", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
