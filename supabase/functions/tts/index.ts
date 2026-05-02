import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TRUSTED_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_BASE = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_TOKEN}`;
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Allowlist: Microsoft Edge TTS voice name pattern, e.g. "en-US-GuyNeural", "es-MX-JorgeNeural"
const VOICE_ID_RE = /^[a-z]{2}-[A-Z]{2}-[A-Za-z0-9]+Neural$/;
const RATE_RE = /^[+-]\d{1,3}%$/;
const PITCH_RE = /^[+-]\d{1,3}Hz$/;

function buildSSML(text: string, voice: string, rate: string, pitch: string): string {
  // voice/rate/pitch are validated against strict regexes before reaching here,
  // but we still escape defensively in case the allowlists are ever loosened.
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${escapeXml(voice)}'><prosody rate='${escapeXml(rate)}' pitch='${escapeXml(pitch)}'>${escapeXml(text)}</prosody></voice></speak>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, voiceId, rate = "+0%", pitch = "+0Hz" } = await req.json();

    if (typeof text !== "string" || !text.trim() || typeof voiceId !== "string") {
      return new Response(JSON.stringify({ error: "text and voiceId are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!VOICE_ID_RE.test(voiceId)) {
      return new Response(JSON.stringify({ error: "Invalid voiceId format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof rate !== "string" || !RATE_RE.test(rate)) {
      return new Response(JSON.stringify({ error: "Invalid rate format (expected e.g. +0%)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof pitch !== "string" || !PITCH_RE.test(pitch)) {
      return new Response(JSON.stringify({ error: "Invalid pitch format (expected e.g. +0Hz)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmedText = text.slice(0, 1500);
    const connectionId = crypto.randomUUID().replace(/-/g, "");
    const requestId = crypto.randomUUID().replace(/-/g, "");

    const audioChunks: Uint8Array[] = [];

    const audioData = await new Promise<Uint8Array>((resolve, reject) => {
      const ws = new WebSocket(`${WSS_BASE}&ConnectionId=${connectionId}`);

      const timeout = setTimeout(() => {
        try { ws.close(); } catch (_) { /* ignore */ }
        reject(new Error("TTS timeout after 30s"));
      }, 30000);

      let resolved = false;

      ws.onopen = () => {
        // Send output format config
        ws.send(
          `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: {
                    sentenceBoundaryEnabled: "false",
                    wordBoundaryEnabled: "false",
                  },
                  outputFormat: OUTPUT_FORMAT,
                },
              },
            },
          })
        );

        // Send SSML request
        const ssml = buildSSML(trimmedText, voiceId, rate, pitch);
        ws.send(
          `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`
        );
      };

      ws.onmessage = async (event) => {
        if (typeof event.data === "string") {
          if (event.data.includes("Path:turn.end")) {
            resolved = true;
            clearTimeout(timeout);
            try { ws.close(); } catch (_) { /* ignore */ }

            const totalLen = audioChunks.reduce((s, c) => s + c.length, 0);
            const result = new Uint8Array(totalLen);
            let offset = 0;
            for (const chunk of audioChunks) {
              result.set(chunk, offset);
              offset += chunk.length;
            }
            resolve(result);
          }
        } else {
          // Binary data — could be ArrayBuffer or Blob
          let buf: ArrayBuffer;
          if (event.data instanceof ArrayBuffer) {
            buf = event.data;
          } else if (event.data instanceof Blob) {
            buf = await event.data.arrayBuffer();
          } else {
            return;
          }

          const data = new Uint8Array(buf);
          if (data.length < 3) return;

          const headerSize = (data[0] << 8) | data[1];
          const headerEnd = 2 + headerSize;
          if (headerEnd >= data.length) return;

          const headerStr = new TextDecoder().decode(data.slice(2, headerEnd));
          if (headerStr.includes("Path:audio")) {
            audioChunks.push(data.slice(headerEnd));
          }
        }
      };

      ws.onerror = () => {
        if (!resolved) {
          clearTimeout(timeout);
          reject(new Error("WebSocket connection failed"));
        }
      };

      ws.onclose = () => {
        if (!resolved) {
          clearTimeout(timeout);
          if (audioChunks.length > 0) {
            // Assemble whatever we have
            const totalLen = audioChunks.reduce((s, c) => s + c.length, 0);
            const result = new Uint8Array(totalLen);
            let offset = 0;
            for (const chunk of audioChunks) {
              result.set(chunk, offset);
              offset += chunk.length;
            }
            resolved = true;
            resolve(result);
          } else {
            reject(new Error("Connection closed with no audio data"));
          }
        }
      };
    });

    return new Response(audioData, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.error("TTS error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "TTS synthesis failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
