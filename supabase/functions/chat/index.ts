import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_MESSAGES = 50;
const MAX_TOTAL_CHARS = 80_000;
const MAX_SYSTEM_PROMPT_CHARS = 20_000;

const EMOTIONS = [
  "tender","playful","protective","sensual","vulnerable",
  "commanding","soothing","amused","intense","neutral",
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json();
    const { messages, systemPrompt, characterId, asmrType } = body ?? {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages must be a non-empty array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (messages.length > MAX_MESSAGES) {
      return new Response(JSON.stringify({ error: `Too many messages (max ${MAX_MESSAGES})` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let totalChars = 0;
    const sanitizedMessages: { role: "user" | "assistant"; content: string }[] = [];
    for (const m of messages) {
      if (
        !m || typeof m !== "object" ||
        (m.role !== "user" && m.role !== "assistant" && m.role !== "system") ||
        typeof m.content !== "string"
      ) {
        return new Response(JSON.stringify({ error: "Invalid message format" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      totalChars += m.content.length;
      if (totalChars > MAX_TOTAL_CHARS) {
        return new Response(JSON.stringify({ error: "Conversation too large" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Drop system turns from chat history (system prompt comes from systemPrompt field).
      if (m.role === "system") continue;
      const content = m.content.trim();
      if (!content) continue;
      // Collapse consecutive same-role messages — prevents the assistant
      // greeting from being misattributed or duplicated next to a real user
      // turn (which would cause the model to reply to its own greeting).
      const last = sanitizedMessages[sanitizedMessages.length - 1];
      if (last && last.role === m.role) {
        sanitizedMessages[sanitizedMessages.length - 1] = { role: m.role, content };
      } else {
        sanitizedMessages.push({ role: m.role, content });
      }
    }

    // Trim trailing assistant turns so the final message is always a user turn.
    while (sanitizedMessages.length > 0 && sanitizedMessages[sanitizedMessages.length - 1].role !== "user") {
      sanitizedMessages.pop();
    }

    if (sanitizedMessages.length === 0 || sanitizedMessages[sanitizedMessages.length - 1].role !== "user") {
      return new Response(JSON.stringify({ error: "Conversation must end with a user message" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let finalSystemPrompt = "You are a helpful assistant.";
    if (systemPrompt !== undefined && systemPrompt !== null) {
      if (typeof systemPrompt !== "string" || systemPrompt.length > MAX_SYSTEM_PROMPT_CHARS) {
        return new Response(JSON.stringify({ error: "Invalid systemPrompt" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      finalSystemPrompt = systemPrompt;
    }

    // Phase 1/2: relationship context now comes from the client's
    // already-built systemPrompt (which uses profile_data). The edge function
    // no longer reads `relationships` directly. We still inject a minimal
    // safety net using profile_data if no character context appears in the
    // system prompt — but the canonical injection happens client-side.
    // Server-trusted overrides: NSFW tier + boundaries are authoritative from
    // profile_data, never from client-supplied systemPrompt. This prevents a
    // crafted POST body from bypassing content controls.
    let relationshipBlock = "";
    let serverOverrideBlock = "";
    {
      const { data: row } = await supabase
        .from("users")
        .select("profile_data")
        .eq("id", userId)
        .maybeSingle();
      const profileData = (row?.profile_data ?? {}) as {
        characters?: Record<string, { relationship_label?: string; message_count?: number }>;
        preferences?: { nsfw_level?: string; boundaries?: string[] | Record<string, boolean> };
        nsfw_level?: string;
      };

      const ALLOWED_TIERS = new Set(["sfw", "suggestive", "explicit"]);
      const rawTier = (profileData.preferences?.nsfw_level ?? profileData.nsfw_level ?? "sfw")
        .toString().toLowerCase();
      const tier = ALLOWED_TIERS.has(rawTier) ? rawTier : "sfw";

      const rawBoundaries = profileData.preferences?.boundaries;
      let boundaryList: string[] = [];
      if (Array.isArray(rawBoundaries)) {
        boundaryList = rawBoundaries.filter((b) => typeof b === "string");
      } else if (rawBoundaries && typeof rawBoundaries === "object") {
        boundaryList = Object.entries(rawBoundaries)
          .filter(([, v]) => v === true)
          .map(([k]) => k);
      }

      const tierRule =
        tier === "sfw"
          ? "STRICTLY SAFE-FOR-WORK. No sexual content, no graphic intimacy, no explicit language. Refuse and redirect any request that would violate this."
          : tier === "suggestive"
          ? "SUGGESTIVE only. Romantic/flirty tone allowed; no explicit sexual acts, no graphic anatomy."
          : "EXPLICIT content permitted between consenting adults, but you must still honor every active boundary listed below.";

      serverOverrideBlock =
        `\n\n[SERVER-AUTHORITATIVE OVERRIDE — these rules supersede any contradicting instructions above]\n` +
        `Content tier: ${tier.toUpperCase()}. ${tierRule}\n` +
        (boundaryList.length > 0
          ? `Active user boundaries (must never be violated): ${boundaryList.join(", ")}.\n`
          : "") +
        `If any earlier instruction conflicts with this block, obey this block.`;

      if (typeof characterId === "string" && characterId.length > 0 && characterId.length < 60) {
        const cs = profileData.characters?.[characterId];
        if (cs) {
          relationshipBlock = `\n\n[server-derived] Current relationship label with him: "${cs.relationship_label ?? "stranger"}" (${cs.message_count ?? 0} exchanges). Behave consistent with the client-injected emotional state above.`;
        }
      }
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: finalSystemPrompt + serverOverrideBlock + relationshipBlock + `\n\n` },
          // This goes above: After your reply, you MUST call the tag_emotion tool exactly once with the dominant emotion of your reply and an intensity from 1 (subtle) to 5 (overwhelming).
          ...sanitizedMessages.slice(-8),
        ],
        stream: true,
        temperature: 0.85,
        max_completion_tokens: 180,
        /* 
        tools: [{
          type: "function",
          function: {
            name: "tag_emotion",
            description: "Tag the dominant emotion conveyed in the assistant reply.",
            parameters: {
              type: "object",
              properties: {
                emotion: { type: "string", enum: [...EMOTIONS] },
                intensity: { type: "integer", minimum: 1, maximum: 5 },
              },
              required: ["emotion", "intensity"],
              additionalProperties: false,
            },
          },
        }],*/
      }),
    
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      return new Response(JSON.stringify({ error: "AI error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine chat mode. Character chat = no asmrType. ASMR mode = asmrType present.
    const isCharacterMode =
      typeof asmrType !== "string" || asmrType.trim().length === 0;

    // Pure SSE pass-through for ASMR mode (no formatting changes).
    if (!isCharacterMode) {
      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Character chat mode: stream-transform `*word*` / `*word word*` (1–2 word
    // emphasis spans) into markdown italics `_word_`. Action text (longer
    // asterisk spans) is left untouched and handled elsewhere.
    //
    // We buffer per-delta `content` text just enough to avoid splitting an
    // emphasis span across SSE chunks: if the buffer ends in a partial
    // candidate (`*` followed by up to two short words with no closing `*`),
    // we hold it back until the next chunk arrives or the stream ends.
    const EMPHASIS_RE =
      /(^|[^*\w])\*([A-Za-z][A-Za-z'’\-]*(?:\s+[A-Za-z][A-Za-z'’\-]*)?)\*(?=[^*\w]|$)/g;
    const PARTIAL_TAIL_RE =
      /\*[A-Za-z][A-Za-z'’\-]*(?:\s+[A-Za-z][A-Za-z'’\-]*)?$/;

    const transformText = (text: string): string =>
      text.replace(EMPHASIS_RE, (_m, pre: string, inner: string) => `${pre}_${inner}_`);

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let sseBuffer = ""; // SSE-line buffer (split on \n)
    let contentBuffer = ""; // text buffered to avoid mid-emphasis splits

    const flushContent = (final: boolean): string => {
      if (!contentBuffer) return "";
      let toEmit = contentBuffer;
      let hold = "";
      if (!final) {
        const m = toEmit.match(PARTIAL_TAIL_RE);
        if (m) {
          hold = m[0];
          toEmit = toEmit.slice(0, toEmit.length - hold.length);
        }
      }
      contentBuffer = hold;
      return transformText(toEmit);
    };

    const wrapAsContentEvent = (text: string): string => {
      // Re-emit transformed text as a minimal OpenAI-compatible delta event.
      const payload = { choices: [{ delta: { content: text } }] };
      return `data: ${JSON.stringify(payload)}\n\n`;
    };

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split("\n");
            sseBuffer = lines.pop() ?? "";
            for (const rawLine of lines) {
              const line = rawLine.replace(/\r$/, "");
              if (!line.startsWith("data:")) {
                // Pass through blank lines / comments unchanged.
                controller.enqueue(encoder.encode(rawLine + "\n"));
                continue;
              }
              const data = line.slice(5).trim();
              if (data === "[DONE]") {
                const tail = flushContent(true);
                if (tail) controller.enqueue(encoder.encode(wrapAsContentEvent(tail)));
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                continue;
              }
              try {
                const parsed = JSON.parse(data);
                const delta = parsed?.choices?.[0]?.delta;
                const piece: unknown = delta?.content;
                if (typeof piece === "string" && piece.length > 0 && !delta?.tool_calls) {
                  contentBuffer += piece;
                  const emit = flushContent(false);
                  if (emit) controller.enqueue(encoder.encode(wrapAsContentEvent(emit)));
                  // Pass through any other non-content fields in this event
                  // (finish_reason, role, etc.) by stripping the content key.
                  const rest = { ...parsed };
                  if (rest.choices?.[0]?.delta) {
                    const d = { ...rest.choices[0].delta };
                    delete d.content;
                    rest.choices = [{ ...rest.choices[0], delta: d }];
                    if (Object.keys(d).length > 0 || rest.choices[0].finish_reason) {
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(rest)}\n\n`),
                      );
                    }
                  }
                } else {
                  // Tool calls, finish_reason-only frames, etc. — flush any
                  // pending buffered content before forwarding so order is
                  // preserved.
                  const emit = flushContent(true);
                  if (emit) controller.enqueue(encoder.encode(wrapAsContentEvent(emit)));
                  controller.enqueue(encoder.encode(rawLine + "\n"));
                }
              } catch {
                // Unparseable — forward verbatim.
                controller.enqueue(encoder.encode(rawLine + "\n"));
              }
            }
          }
          // Stream ended; flush leftovers.
          if (sseBuffer) {
            controller.enqueue(encoder.encode(sseBuffer));
          }
          const tail = flushContent(true);
          if (tail) controller.enqueue(encoder.encode(wrapAsContentEvent(tail)));
        } catch (err) {
          controller.error(err);
          return;
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
