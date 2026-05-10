import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth guard — require a valid (non-anonymous) Supabase user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice("Bearer ".length);
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user || (userData.user as any).is_anonymous) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { message: rawMessage, memories: rawMemories } = await req.json();
    if (typeof rawMessage !== "string" || !Array.isArray(rawMemories) || rawMemories.length === 0) {
      return new Response(JSON.stringify({ index: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Cost-amplification guard: cap input sizes before they reach OpenAI.
    const MAX_MESSAGE_CHARS = 2000;
    const MAX_MEMORY_ITEMS = 20;
    const MAX_MEMORY_CHARS = 1000;
    const message = rawMessage.slice(0, MAX_MESSAGE_CHARS);
    const memories = (rawMemories as unknown[])
      .slice(0, MAX_MEMORY_ITEMS)
      .map((m) => (typeof m === "string" ? m.slice(0, MAX_MEMORY_CHARS) : ""))
      .filter((m) => m.length > 0);
    if (memories.length === 0) {
      return new Response(JSON.stringify({ index: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ index: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const list = (memories as string[])
      .map((m, i) => `${i}. ${m}`)
      .join("\n");

    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
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
