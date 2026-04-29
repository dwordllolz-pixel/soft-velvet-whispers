import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { message, memories } = await req.json();
    if (typeof message !== "string" || !Array.isArray(memories) || memories.length === 0) {
      return new Response(JSON.stringify({ index: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ index: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const list = (memories as string[])
      .map((m, i) => `${i}. ${m}`)
      .join("\n");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Given a user message, return only the index number of the most emotionally relevant memory. Output a single integer and nothing else." },
          { role: "user", content: `MESSAGE: ${message}\n\nMEMORIES:\n${list}` },
        ],
        max_tokens: 5,
      }),
    });
    if (!resp.ok) {
      return new Response(JSON.stringify({ index: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const j = await resp.json();
    const text = (j.choices?.[0]?.message?.content ?? "").toString().trim();
    const m = text.match(/-?\d+/);
    const idx = m ? parseInt(m[0], 10) : 0;
    return new Response(JSON.stringify({ index: Number.isFinite(idx) ? idx : 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[pick-milestone] error", e);
    return new Response(JSON.stringify({ index: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
