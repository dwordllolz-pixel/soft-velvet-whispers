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

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

    // ---- Layer 1: Narrative state (rewrite) ----
    const narrativePrompt = `Summarize the emotional texture of this conversation in 2–3 sentences. Focus on how the interaction felt, not what was discussed. Avoid concrete nouns unless they describe emotional behavior. Do not mention specific topics, events, or facts. If you find yourself writing a noun that refers to a topic rather than an emotion, rewrite it. Return only the summary. No preamble.`;

    let narrativeState = "";
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: narrativePrompt },
            { role: "user", content: dialogue },
          ],
          max_tokens: 150,
        }),
      });
      if (r.ok) {
        const j = await r.json();
        narrativeState = (j.choices?.[0]?.message?.content ?? "").trim();
      } else {
        console.error("[summarize-memory] narrative gateway error", r.status);
      }
    } catch (e) {
      console.error("[summarize-memory] narrative error", e);
    }

    if (narrativeState) {
      const { error: upErr } = await supabase
        .from("character_memory")
        .upsert(
          { user_id: userId, character_id: characterId, narrative_state: narrativeState, updated_at: new Date().toISOString() },
          { onConflict: "user_id,character_id" },
        );
      if (upErr) console.error("[summarize-memory] memory upsert error", upErr);
    }

    // ---- Layer 2: Milestone (only if weight high) ----
    const weight = typeof lastEventWeight === "number" ? lastEventWeight : 0;
    if (weight > MILESTONE_THRESHOLD && narrativeState) {
      // Use a 2-sentence trim of narrativeState as the milestone summary.
      const summary = narrativeState.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");

      // Quality gate Check 1 — Signal word presence
      const SIGNAL_PHRASES = [
        "first time", "opened up", "admitted", "confessed", "broke down",
        "trusted", "turning point", "vulnerable", "never told", "told me",
        "let me in", "realized", "understood", "changed", "different", "moment",
      ];
      const summaryLower = summary.toLowerCase();
      const hasSignal = SIGNAL_PHRASES.some((p) => summaryLower.includes(p));

      if (!hasSignal) {
        console.log("[summarize-memory] milestone skipped — no signal words");
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
      const prefPrompt = `Identify 0–2 stable user behavioral preferences emerging from this conversation. A preference is HOW the user likes to be related to (e.g. "responds well to brief, grounded reassurance", "prefers being teased gently before being praised"). NOT topics, NOT events. Each preference: one short sentence, no names, no nouns describing topics. If nothing clear emerges, return an empty array.`;

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: prefPrompt },
            { role: "user", content: dialogue },
          ],
          max_tokens: 200,
          tools: [{
            type: "function",
            function: {
              name: "record_preferences",
              description: "Record detected user preferences",
              parameters: {
                type: "object",
                properties: {
                  preferences: {
                    type: "array",
                    items: { type: "string" },
                    maxItems: 2,
                  },
                },
                required: ["preferences"],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "record_preferences" } },
        }),
      });

      if (r.ok) {
        const j = await r.json();
        const argsStr = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (argsStr) {
          const parsed = JSON.parse(argsStr);
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
