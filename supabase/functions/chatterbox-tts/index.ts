import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CHATTERBOX_URL = Deno.env.get("CHATTERBOX_URL");

// Allowlist for reference audio filenames to prevent path traversal / abuse
const REF_AUDIO_RE = /^[a-zA-Z0-9_-]{1,64}\.wav$/;

const MAX_TEXT_CHARS = 3000;

interface TTSRequest {
  text: string;
  reference_audio_filename: string;
  temperature?: number;
  speed_factor?: number;
  chunk_size?: number;
  exaggeration?: number;
  cfg_weight?: number;
  seed?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!CHATTERBOX_URL) {
    return new Response(JSON.stringify({ error: "Chatterbox not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: TTSRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validation
  if (typeof body.text !== "string" || !body.text.trim()) {
    return new Response(JSON.stringify({ error: "text required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (body.text.length > MAX_TEXT_CHARS) {
    return new Response(JSON.stringify({ error: `text exceeds ${MAX_TEXT_CHARS} chars` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!REF_AUDIO_RE.test(body.reference_audio_filename || "")) {
    return new Response(JSON.stringify({ error: "Invalid reference_audio_filename" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const processedText = preprocessForChatterbox(body.text);
  if (!processedText.trim()) {
    return new Response(JSON.stringify({ error: "text empty after preprocessing" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = {
    text: processedText,
    voice_mode: "clone",
    reference_audio_filename: body.reference_audio_filename,
    output_format: "wav",
    split_text: true,
    chunk_size: clamp(body.chunk_size ?? 100, 40, 150),
    temperature: clamp(body.temperature ?? 0.7, 0.1, 1.5),
    exaggeration: clamp(body.exaggeration ?? 0.3, 0, 1),
    cfg_weight: clamp(body.cfg_weight ?? 0.5, 0, 1),
    seed: typeof body.seed === "number" ? body.seed : 3000,
    speed_factor: clamp(body.speed_factor ?? 1.05, 1.0, 1.1),
    language: "en",
  };

  try {
    const upstream = await fetch(`${CHATTERBOX_URL.replace(/\/$/, "")}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("Chatterbox upstream error:", upstream.status, errText);
      return new Response(JSON.stringify({ error: "Upstream TTS failed", status: upstream.status }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const audio = await upstream.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "audio/wav" },
    });
  } catch (err) {
    console.error("Chatterbox fetch error:", err);
    return new Response(JSON.stringify({ error: "Could not reach Chatterbox server" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Preprocess text for Chatterbox. For each *...* span, in order:
 *  1. Paralinguistic patterns (laughs, sighs, etc.) → Chatterbox tag.
 *  2. 1–2 word content → emphasis: keep words, drop asterisks.
 *  3. Longer descriptive content → strip entirely.
 * Then convert ellipses to a comma for a natural breath pause.
 */
function preprocessForChatterbox(input: string): string {
  const paralinguisticMap: Array<[RegExp, string]> = [
    [/^(?:laughs?|chuckles?)$/i, "[chuckle]"],
    [/^sighs?$/i, "[sigh]"],
    [/^gasps?$/i, "[gasp]"],
    [/^coughs?$/i, "[cough]"],
    [/^groans?$/i, "[groan]"],
    [/^shush(?:es)?$/i, "[shush]"],
  ];

  let out = input.replace(/\*([^*]+)\*/g, (_match, raw: string) => {
    const inner = raw.trim();
    if (!inner) return "";

    // Rule 1: paralinguistic tag
    for (const [re, tag] of paralinguisticMap) {
      if (re.test(inner)) return tag;
    }

    // Rule 2: 1–2 word emphasis → keep words without asterisks
    const wordCount = inner.split(/\s+/).length;
    if (wordCount <= 2) return inner;

    // Rule 3: longer descriptive content → strip
    return "";
  });

  // Convert ellipses (... or …) to a comma for a natural breath pause.
  out = out.replace(/\s*(?:\.{3,}|…)\s*/g, ", ");
  return out.replace(/\s{2,}/g, " ").trim();
}
