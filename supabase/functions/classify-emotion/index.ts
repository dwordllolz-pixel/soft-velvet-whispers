import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_CATEGORIES = [
  "small_talk",
  "light_affection",
  "affection",
  "light_vulnerability",
  "vulnerability",
  "conflict",
  "jealousy_trigger",
  "emotional_openness",
] as const;
type Category = (typeof VALID_CATEGORIES)[number];

// Mirror of EVENT_WEIGHTS in src/lib/relationshipAxes.ts — kept in sync so the
// classifier log matches what the axes engine will actually apply downstream.
const CATEGORY_WEIGHTS: Record<Category, number> = {
  small_talk: 0.1,
  light_affection: 0.4,
  affection: 0.5,
  light_vulnerability: 0.55,
  emotional_openness: 0.6,
  conflict: 0.7,
  jealousy_trigger: 0.8,
  vulnerability: 1.0,
};

const SYSTEM_PROMPT = `You are an emotion classifier. Read the user message and return EXACTLY ONE category label from this list — no other text, no punctuation, no explanation:

small_talk          (weight 0.1) — greetings, logistics, weather, casual filler with no emotional content. "hey", "what's up", "how was your day", "lol", "ok cool"
light_affection     (weight 0.4) — warm but light: compliments, fondness, mild flirting, "I missed you a little", "you're cute", "thinking of you"
affection           (weight 0.5) — clear warmth or care, "I really like talking to you", "you make me happy"
light_vulnerability (weight 0.55) — mild self-disclosure or stress, "kinda tired today", "work was rough", "feeling a little off"
emotional_openness  (weight 0.6) — meaningful self-disclosure that isn't pain, "I've been thinking about us", "I want to tell you something real"
conflict            (weight 0.7) — tension, frustration, blame, push-back, "you never listen", "I'm pissed", "fuck you"
jealousy_trigger    (weight 0.8) — insecurity, fear of replacement, possessiveness, "are you talking to other guys?", "do you even care about me anymore"
vulnerability       (weight 1.0) — deep pain, distress, private disclosure, struggle, "I can't do this anymore", "I'm really not okay", trauma, suicidal ideation

DECISION RULES (apply in order):
1. If message is purely logistical/greeting with zero emotional content → small_talk
2. Pain and warmth are mutually exclusive. Never label distress as affection.
3. If torn between two categories → pick the more intense one
4. Insecurity about the relationship → jealousy_trigger (not vulnerability)
5. Frustration directed at the other person → conflict (not vulnerability)
6. Default for ambiguous emotional-but-mild messages → light_vulnerability

Return ONLY the category label. Lowercase. No quotes. No period. No explanation.`;

const TIMEOUT_MS = 3000;
const MAX_MESSAGE_CHARS = 2000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.message === "string" ? body.message : "";
    if (!raw) {
      return json({ category: "light_vulnerability", reason: "empty_input" }, 200);
    }
    const message = raw.toLowerCase().trim().slice(0, MAX_MESSAGE_CHARS);

    console.log("[classify-emotion] raw input:", JSON.stringify(message));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[classify-emotion] LOVABLE_API_KEY missing");
      return json({ category: "light_vulnerability", reason: "no_api_key" }, 200);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const classifyCall = (async () => {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: message },
          ],
          stream: false,
        }),
      });

      if (!resp.ok) {
        console.error("[classify-emotion] gateway error", resp.status);
        return { category: "light_vulnerability" as Category, reason: `gateway_${resp.status}` };
      }
      const data = await resp.json();
      const rawOut = (data?.choices?.[0]?.message?.content ?? "").toString().trim().toLowerCase();
      console.log("[classify-emotion] raw output:", JSON.stringify(rawOut));
      const cleaned = rawOut.replace(/[^a-z_]/g, "");
      if ((VALID_CATEGORIES as readonly string[]).includes(cleaned)) {
        return { category: cleaned as Category, reason: "llm" };
      }
      console.warn("[classify-emotion] unrecognized output:", rawOut);
      return { category: "light_vulnerability" as Category, reason: "unrecognized" };
    })();

    const startTime = Date.now();
    try {
      const result = await classifyCall;
      const latency = Date.now() - startTime;
      const weight = CATEGORY_WEIGHTS[result.category] ?? 0.55;
      console.log(
        `[classify-emotion] result: ${result.category} (${weight}) | latency: ${latency}ms | reason: ${result.reason}`,
      );
      clearTimeout(timer);
      return json({ ...result, weight }, 200);
    } catch (err) {
      const latency = Date.now() - startTime;
      console.log("[classify-emotion] FAILED:",
        (err as Error)?.name,
        "| latency:", latency, "ms"
      );
      clearTimeout(timer);
      return json({ category: "light_vulnerability", reason: "failsafe" }, 200);
    }
  } catch (e) {
    console.error("[classify-emotion] fatal", e);
    return json({ category: "light_vulnerability", reason: "fatal" }, 200);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
