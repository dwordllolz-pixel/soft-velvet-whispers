import { useState, useRef, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Heart } from "lucide-react";
import { getCharacter, getASMRCategory, type ASMRType } from "@/data/characters";
import { useTTS } from "@/hooks/useTTS";
import { useChatHistory } from "@/hooks/useChatHistory";
import { useUserProfile } from "@/hooks/useUserProfile";
import { supabase, supabaseEnv } from "@/integrations/supabase/client";
import type { Emotion } from "@/data/emotionMatrix";
import type { NsfwLevel, CharacterState, ProfileData } from "@/types/profile";
import {
  applyAxisEvent,
  bumpExchangeCount,
  categoryToEvent,
  ensureCharacterState,
  EVENT_WEIGHTS,
  getAxisConfig,
  getDiminishMultiplier,
  isBypassCategory,
  isValidCategory,
  keywordFloor,
  mergeCategoryFloor,
  MIN_EVENT_WEIGHT,
  tickDailyCount,
  type EventCategory,
} from "@/lib/relationshipAxes";
import { buildDynamicPromptBlock } from "@/lib/promptInjection";
import {
  buildRivalryPromptBlock,
  bumpRivalryTurns,
  setRivalryCooldown,
  updateRivalryIntensity,
} from "@/lib/rivalry";
import {
  buildMemoryBlock,
  fetchMemoryBundle,
  fireSummarization,
  isMemoryInjectionPaused,
  MEMORY_CHARACTERS,
  pauseMemoryInjection,
  shouldSummarize,
  type MemoryBundle,
} from "@/lib/memory";
import ChatHeader from "@/components/chat/ChatHeader";
import ChatMessage from "@/components/chat/ChatMessage";
import ChatInput from "@/components/chat/ChatInput";
import GreetingCard from "@/components/chat/GreetingCard";
import EchoLayer, { type EchoType, type EchoSignal } from "@/components/chat/EchoLayer";
import PresenceFeed from "@/components/chat/PresenceFeed";
import ThoughtsPanel, { type ThoughtEntry } from "@/components/chat/ThoughtsPanel";
import DebugOverlay from "@/components/DebugOverlay";
import { isDebugActive } from "@/lib/debugMode";
import { buildSystemPrompt } from "@/lib/buildSystemPrompt";
import { extractRepeatedPatterns } from "@/lib/repetitionTracker";

type Role = "user" | "assistant" | "system";

interface Message {
  id: string;
  // "system" is reserved for ECHO signals — local-only, never persisted,
  // never sent to the model, never read by axes/memory, never spoken.
  role: Role;
  content: string; // dialogue only — never raw JSON
  action?: string | null;
  thought?: string | null;
  emotion?: Emotion | null;
  intensity?: number | null;
  echoType?: EchoType;
}

interface CharacterOutput {
  dialogue: string;
  action: string | null;
  thought: string | null;
}

/**
 * Parse a character-mode raw response. Characters may emit JSON with
 * { dialogue, action, thought } fields. If parsing fails or fields are
 * missing, fall back to treating the whole raw string as dialogue.
 * Never used in ASMR mode.
 */
function stripToolArtifacts(raw: string): string {
  let out = raw;
  // Remove <tool_code>...</tool_code> blocks (and unclosed variants)
  out = out.replace(/<tool_code\b[^>]*>[\s\S]*?<\/tool_code>/gi, "");
  out = out.replace(/<\/?tool_code\b[^>]*>/gi, "");
  // Remove other tool-like XML tags (tool_call, function_call, etc.)
  out = out.replace(/<\/?(?:tool_call|function_call|tool_use|tool_response)\b[^>]*>[\s\S]*?<\/(?:tool_call|function_call|tool_use|tool_response)>/gi, "");
  out = out.replace(/<\/?(?:tool_call|function_call|tool_use|tool_response)\b[^>]*>/gi, "");
  // Strip ONLY the fence markers (```lang and closing ```), preserving inner
  // content — the JSON we need usually lives inside a ```json fence.
  out = out.replace(/```[a-zA-Z]*\n?/g, "");
  out = out.replace(/```/g, "");
  return out.trim();
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function sanitizeJson(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

const assembledSystemPrompt = buildSystemPrompt({
  characterId: characterId ?? "eli",
  dynamic: {
    relationshipState: (() => {
      const label = characterState.relationship_label ?? "stranger";
      const affection = characterState.affection ?? 0;
      const trust = characterState.trust ?? 0;

      if (label === "stranger") {
        return "Guarded and unfamiliar. Treat the user as someone new.";
      }

      if (label === "familiar") {
        return `Warming up. Affection building (${Math.round(affection)}). Still cautious.`;
      }

      if (label === "close") {
        return `Trust established (${Math.round(trust)}). Emotional openness earned.`;
      }

      return "Deeply connected. Vulnerability is possible.";
    })(),

    emotionalState: (() => {
      const tension = characterState.tension ?? 0;
      const jealousy = characterState.jealousy ?? 0;

      if (tension > 60) {
        return "High tension — something unresolved.";
      }

      if (jealousy > 40) {
        return "Mild jealousy present.";
      }

      if (tension > 20) {
        return "Subtle emotional undercurrent.";
      }

      return "Emotionally settled.";
    })(),

    recentMemory: memoryInjection ?? undefined,

    avoidPatterns: extractRepeatedPatterns(
      messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content)
    ),
  },
});

function parseCharacterOutput(raw: string): CharacterOutput {
  try {
    const cleaned = sanitizeJson(raw);

    if (new URLSearchParams(window.location.search).get("debug") === "true") {
      console.log("[character output raw]:", raw);
      console.log("[character output cleaned]:", cleaned);
    }

    const parsed = JSON.parse(cleaned);

    return {
      dialogue:
        typeof parsed.dialogue === "string" && parsed.dialogue.trim()
          ? parsed.dialogue.trim()
          : raw,
      action:
        typeof parsed.action === "string" && parsed.action.trim()
          ? parsed.action.trim()
          : null,
      thought:
        typeof parsed.thought === "string" && parsed.thought.trim()
          ? parsed.thought.trim()
          : null,
    };
  } catch {
    // Parse failed — treat entire response as dialogue
    if (new URLSearchParams(window.location.search).get("debug") === "true") {
      console.warn("[character output] JSON parse failed, falling back to raw text");
    }
    return { dialogue: raw, action: null, thought: null };
  }
}

const echoMessage = (content: string, type: EchoType): Message => ({
  id: crypto.randomUUID(),
  role: "system",
  content,
  echoType: type,
});

/** Push an ECHO signal, deduping consecutive system messages (anti-spam). */
const pushEcho = (
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  content: string,
  type: EchoType,
) => {
  setMessages((prev) => {
    const last = prev[prev.length - 1];
    if (last?.role === "system") {
      // Replace the existing trailing ECHO instead of stacking duplicates.
      return [...prev.slice(0, -1), echoMessage(content, type)];
    }
    return [...prev, echoMessage(content, type)];
  });
};

/** Strip every ECHO signal from state — used after a successful retry. */
const clearEcho = (
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
) => {
  setMessages((prev) => prev.filter((m) => m.role !== "system"));
};

const CHAT_URL = `${supabaseEnv.url}/functions/v1/chat`;

const TIER_CYCLE: NsfwLevel[] = ["sfw", "suggestive", "explicit"];

const Chat = () => {
  const { characterId, asmrType } = useParams<{ characterId: string; asmrType?: string }>();
  const character = getCharacter(characterId || "");
  const category = asmrType ? getASMRCategory(asmrType as ASMRType) : null;
  // chatMode is derived directly from the route. No asmrType => pure character chat.
  const chatMode: "character" | "asmr" = asmrType ? "asmr" : "character";
  // Storage discriminator. Character mode and each ASMR type get their own
  // saved session bucket so messages and context never bleed between modes.
  const sessionKey = asmrType ?? "__character__";

  const [messages, setMessages] = useState<Message[]>([]);
  const [showGreetingCard, setShowGreetingCard] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Local-only thought log — never persisted, never sent to TTS or the API.
  // Capped at 10, most-recent-first. Cleared on page navigation.
  const [thoughts, setThoughts] = useState<ThoughtEntry[]>([]);
  const [thoughtsOpen, setThoughtsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const prevLoadingRef = useRef(false);
  // Tracks the most recent user text so the ECHO retry button can resend it.
  const lastUserTextRef = useRef<string | null>(null);
  // Phase 4 — Memory: latest fetched bundle (for prompt injection) + qualifying-exchange counter.
  const memoryBundleRef = useRef<MemoryBundle | null>(null);
  const memoryCounterRef = useRef<{ count: number }>({ count: 0 });
  // Phase 5 — Rivalry: tracks whether the most recent prompt build injected
  // a high-intensity block (which must trigger cooldown after a successful reply).
  const rivalryTriggeredCooldownRef = useRef(false);

  const { saveSession, loadSession, deleteCharacterSessions, isLoggedIn } = useChatHistory();
  const { profile, setCharacterState, resetCharacterState, touchCharacter, updatePreferences } = useUserProfile();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const inFlightRef = useRef(false);
  const [isResetting, setIsResetting] = useState(false);

  // Auto voice = global preference (Phase 1 prefs)
  const autoVoice = profile.preferences.auto_voice;

  // Per-session NSFW tier override (defaults to global preference)
  const [sessionTier, setSessionTier] = useState<NsfwLevel>(profile.preferences.nsfw_level);
  useEffect(() => setSessionTier(profile.preferences.nsfw_level), [profile.preferences.nsfw_level]);

  const characterState = useMemo(
    () => ensureCharacterState(characterId ? profile.characters[characterId] : undefined),
    [profile.characters, characterId]
  );

  const domSub = characterId
    ? profile.preferences.character_dom_sub[characterId] ?? profile.preferences.dom_sub_default
    : profile.preferences.dom_sub_default;

  const { speak, stop, playingMessageId, loadingMessageId } = useTTS(characterId || "");

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!character || initialized.current) return;
    initialized.current = true;
    if (characterId) void touchCharacter(characterId);

    // Fresh conversations start with an EMPTY messages array. The greeting
    // is shown as an atmospheric card (GreetingCard) and is never injected
    // into messages or sent to the LLM. Returning conversations skip the
    // card entirely.
    if (isLoggedIn && characterId) {
      loadSession(characterId, sessionKey).then((saved) => {
        if (saved.length > 0) {
          setMessages(saved);
          setShowGreetingCard(false);
          // Seed lastUserTextRef from history so regenerate works on the
          // very first interaction after opening an existing conversation.
          for (let i = saved.length - 1; i >= 0; i--) {
            if (saved[i].role === "user") {
              lastUserTextRef.current = saved[i].content;
              break;
            }
          }
        } else {
          setMessages([]);
          setShowGreetingCard(true);
        }
      });
    } else {
      setMessages([]);
      setShowGreetingCard(true);
    }
  }, [character, isLoggedIn, characterId, sessionKey, loadSession, touchCharacter]);

  useEffect(() => {
    if (prevLoadingRef.current && !isLoading && autoVoice) {
      const last = messages[messages.length - 1];
      // Only speak character replies — never ECHO system notices.
      if (last?.role === "assistant") {
        speak(last.id, last.content, {
          emotion: last.emotion ?? "neutral",
          intensity: last.intensity ?? 3,
          asmrType,
          relationship: characterState.relationship_label,
        });
      }
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, autoVoice, messages, speak, asmrType, characterState.relationship_label]);

  /**
   * If a full reset (Settings → "Reset all chats") wipes this character's
   * state while the chat is open, the visible message list still holds the
   * old transcript. Detect that (axes all zero + transcript longer than the
   * greeting) and snap back to greeting-only. Skips while a reset is being
   * performed locally — that path already replaces messages directly.
   */
  useEffect(() => {
    if (!character || isResetting || isLoading) return;
    const stateIsFresh =
      characterState.message_count === 0 &&
      characterState.affection === 0 &&
      characterState.trust === 0 &&
      characterState.tension === 0 &&
      characterState.jealousy === 0;
    if (!stateIsFresh) return;
    if (messages.length > 0) {
      clearTimeout(saveTimerRef.current);
      setMessages([]);
      setShowGreetingCard(true);
    }
  }, [
    character,
    characterState.message_count,
    characterState.affection,
    characterState.trust,
    characterState.tension,
    characterState.jealousy,
    isResetting,
    isLoading,
    messages,
  ]);

  if (!character) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Session not found.</p>
      </div>
    );
  }
  // ASMR mode requires a valid category; character mode does not.
  if (chatMode === "asmr" && !category) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Session not found.</p>
      </div>
    );
  }

  const buildSystemPrompt = () => {
    // Phase 5 — Rivalry: build block only in character mode and when not incognito.
    let rivalryBlockText = "";
    let rivalryShortText: string | undefined;
    rivalryTriggeredCooldownRef.current = false;
    if (chatMode === "character" && characterId && !profile.preferences.incognito) {
      const rb = buildRivalryPromptBlock(
        characterId,
        characterState.rivalry_state,
        profile,
      );
      rivalryBlockText = rb.text;
      if (rb.text) {
        rivalryShortText = rb.short || undefined;
        console.log(`[rivalry] injecting block for ${characterId}`);
      }
      rivalryTriggeredCooldownRef.current = rb.triggeredCooldown;
    }

    const dynamic = buildDynamicPromptBlock({
      characterState,
      nsfwLevel: sessionTier,
      boundaries: profile.preferences.boundaries,
      domSub,
      characterId,
      chatMode,
      rivalryBlock: rivalryBlockText,
      rivalryBlockShort: rivalryShortText,
    });

    const characterBaseline = ""; // BASELINE PROFILE — to be added per-character in a future pass.

    const scenarioContext = category
      ? `SCENARIO CONTEXT: ${category.label} — ${category.description}`
      : "";

    const modeBlock = chatMode === "character" ? CHARACTER_MODE_RULES : ASMR_MODE_RULES;
    const contextBlock = chatMode === "character" ? characterBaseline : scenarioContext;

    // Phase 4 — Memory: prepend relationship memory block (character mode only).
    if (chatMode === "character" && characterId && isMemoryInjectionPaused(characterId)) {
      return [
        CORE_RULES,
        modeBlock,
        contextBlock,
        character.systemPromptBase,
        dynamic,
      ]
        .filter((s) => s && s.trim().length > 0)
        .join("\n\n");
    }

    const memoryBlock =
      chatMode === "character" ? buildMemoryBlock(memoryBundleRef.current, characterId) : "";

    if (chatMode === "character" && characterId && isMemoryInjectionPaused(characterId)) {
      return [
        CORE_RULES,
        modeBlock,
        contextBlock,
        character.systemPromptBase,
        dynamic,
      ]
        .filter((s) => s && s.trim().length > 0)
        .join("\n\n");
    }

    if (memoryBlock.length > 0) {
      console.log("[memory] injecting block:", memoryBlock);
    }

    return [
      !characterId || !isMemoryInjectionPaused(characterId) ? memoryBlock : "",
      CORE_RULES,
      modeBlock,
      contextBlock,
      character.systemPromptBase,
      dynamic,
    ]
      .filter((s) => s && s.trim().length > 0)
      .join("\n\n");
  };

  const cycleTier = () => {
    const idx = TIER_CYCLE.indexOf(sessionTier);
    setSessionTier(TIER_CYCLE[(idx + 1) % TIER_CYCLE.length]);
  };

  /**
   * Stream a single attempt to the chat edge function.
   * Returns the final assistant text + detected emotion/intensity.
   * Throws on network failure, non-2xx, or empty response.
   */
  const streamChatAttempt = async (
    apiMessages: Array<{ role: string; content: string }>,
    accessToken: string | undefined,
    assistantId: string,
    streamToUI: boolean = true,
  ): Promise<{ text: string; emotion: Emotion | null; intensity: number | null }> => {
    const systemPrompt  = assembledSystemPrompt;
    if (!systemPrompt  || systemPrompt.trim().length === 0) {
      console.warn("[chat] system prompt is empty — aborting request");
      throw new Error("Empty system prompt");
    }
    console.log("[chat] dynamic prompt:", systemPrompt );
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken ?? supabaseEnv.anonKey}`,
      },
      body: JSON.stringify({
        messages: apiMessages,
        systemPrompt: systemPrompt,
        characterId,
        asmrType,
        stream: chatMode !== "character",
      }),
    });

    if (!resp.ok) {
      const err = new Error(`Chat request failed: ${resp.status}`);
      (err as Error & { status?: number }).status = resp.status;
      throw err;
    }
    
    // CHARACTER MODE → NON-STREAMING
    if (chatMode === "character") {
      const json = await resp.json();
    
      console.log("[character raw response]", json);
    
      const text =
        json.choices?.[0]?.message?.content ??
        json.candidates?.[0]?.content?.parts?.[0]?.text ??
        "";
    
      if (!text) {
        throw new Error("Empty response from model");
      }
    
      return {
        text,
        emotion: null,
        intensity: null,
      };
    }
    
    // STREAMING MODES ONLY
    if (!resp.body) {
      throw new Error("Missing response body for stream");
    }
    
    // existing stream reader logic below

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantSoFar = "";
    let toolArgsBuffer = "";
    let detectedEmotion: Emotion | null = null;
    let detectedIntensity: number | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: streamEnabled });

      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") break;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            assistantSoFar += delta.content;
            if (streamToUI) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.id === assistantId)
                  return prev.map((m) => (m.id === assistantId ? { ...m, content: assistantSoFar } : m));
                return [...prev, { id: assistantId, role: "assistant", content: assistantSoFar }];
              });
            }
          }
          const toolCalls = delta?.tool_calls;
          if (Array.isArray(toolCalls)) {
            for (const tc of toolCalls) {
              const args = tc?.function?.arguments;
              if (typeof args === "string") toolArgsBuffer += args;
            }
          }
        } catch {
          /* partial chunk */
        }
      }
    }

    if (toolArgsBuffer) {
      try {
        const parsed = JSON.parse(toolArgsBuffer);
        if (parsed?.emotion) detectedEmotion = parsed.emotion as Emotion;
        if (typeof parsed?.intensity === "number") detectedIntensity = parsed.intensity;
      } catch {
        // ignore
      }
    }

    if (!assistantSoFar.trim()) {
      throw new Error("Empty response from chat function");
    }

    return { text: assistantSoFar, emotion: detectedEmotion, intensity: detectedIntensity };
  };

  /**
   * Pipeline (Phase 3+):
   *   1. Normalize user message
   *   2. Compute keyword floor
   *   3. Call classify-emotion edge function (Gemini 2.5 Flash Lite, 500ms timeout)
   *   4. final_category = max(keyword_floor, llm_category)
   *   5. Stream chat reply
   *   6. Apply axes delta from final_category
   *
   * The classifier call runs in parallel with the chat stream so it never
   * blocks the user-facing reply. If classification fails we fall back to
   * `light_vulnerability` — never `small_talk` (per spec failsafe).
   */
  /**
   * Sanitize the message array before sending to the chat function.
   * Invariants enforced:
   *   - Only role "user" or "assistant" survive
   *   - Empty/whitespace-only content is dropped
   *   - Consecutive same-role messages are collapsed (latest wins) — this is
   *     what prevents the greeting from ever being misattributed as a user
   *     turn or duplicated next to a real user message.
   *   - The final message MUST be role "user" (otherwise the model would be
   *     replying to its own greeting). If it isn't, we drop trailing assistant
   *     turns until it is.
   */
  const sanitizeApiMessages = (
    msgs: Array<{ role: string; content: string }>,
  ): Array<{ role: "user" | "assistant"; content: string }> => {
    const cleaned: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const m of msgs) {
      if (m.role !== "user" && m.role !== "assistant") continue;
      const content = typeof m.content === "string" ? m.content.trim() : "";
      if (!content) continue;
      const last = cleaned[cleaned.length - 1];
      if (last && last.role === m.role) {
        // Same-role collision (e.g. greeting + another assistant line). Keep latest.
        cleaned[cleaned.length - 1] = { role: m.role, content };
      } else {
        cleaned.push({ role: m.role, content });
      }
    }
    while (cleaned.length > 0 && cleaned[cleaned.length - 1].role !== "user") {
      cleaned.pop();
    }
    return cleaned;
  };

  const classifyUserMessage = async (
    normalized: string,
    accessToken: string | undefined,
  ): Promise<EventCategory> => {
    const floor = keywordFloor(normalized);
    // Defensive: classifier must never run on empty/blank input.
    if (!normalized || !normalized.trim()) {
      return mergeCategoryFloor(floor, "light_vulnerability");
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const resp = await fetch(
        `${supabaseEnv.url}/functions/v1/classify-emotion`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken ?? supabaseEnv.anonKey}`,
          },
          body: JSON.stringify({ message: normalized }),
        },
      );
      if (!resp.ok) {
        console.error("[classify-emotion] non-ok", resp.status);
        return mergeCategoryFloor(floor, "light_vulnerability");
      }
      const data = await resp.json();
      const llm = typeof data?.category === "string" && isValidCategory(data.category)
        ? (data.category as EventCategory)
        : "light_vulnerability";
      const finalCategory = mergeCategoryFloor(floor, llm);
      const finalWeight = EVENT_WEIGHTS[finalCategory];
      console.log(`[classify-emotion] result: ${finalCategory} (${finalWeight})`);
      return finalCategory;
    } catch (err) {
      const aborted = (err as Error)?.name === "AbortError";
      console.error(`[classify-emotion] ${aborted ? "timeout" : "error"}`, err);
      return mergeCategoryFloor(floor, "light_vulnerability");
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const recordEchoLog = async (message: string, echoType: EchoType, userId: string | null) => {
    if (!userId || profile.preferences.incognito) return;
    await supabase.from("echo_logs").insert({
      user_id: userId,
      character_id: characterId ?? null,
      mode: chatMode,
      message,
      echo_type: echoType,
      severity: echoType === "error" ? "error" : echoType === "rate_limit" ? "warning" : "info",
    });
  };

  const recordAnalytics = async (eventName: string, userId: string | null, metadata: Record<string, unknown> = {}) => {
    if (!userId || profile.preferences.incognito) return;
    await supabase.from("admin_analytics_events").insert({
      user_id: userId,
      event_name: eventName,
      character_id: characterId ?? null,
      mode: chatMode,
      metadata,
    });
  };

  const sendMessage = async (userText: string, options?: { regenerate?: boolean }) => {
    if (!userText.trim() || isLoading || inFlightRef.current) return;
    inFlightRef.current = true;
    const isRegenerate = options?.regenerate === true;
    const trimmed = userText.trim();
    const normalized = trimmed.toLowerCase();
    lastUserTextRef.current = trimmed;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: trimmed };
    // When regenerating, do NOT append a duplicate user bubble. Instead,
    // strip any trailing assistant message(s) so the new generation replaces
    // the previous (or failed) response. Also clear lingering ECHO either way.
    let newMessages: Message[];
    if (isRegenerate) {
      const withoutEcho = messages.filter((m) => m.role !== "system");
      // Remove trailing assistant messages so the new response replaces them.
      const trimmedTail = [...withoutEcho];
      while (trimmedTail.length > 0 && trimmedTail[trimmedTail.length - 1].role === "assistant") {
        trimmedTail.pop();
      }
      newMessages = trimmedTail;
    } else {
      const baseMessages = messages.filter((m) => m.role !== "system");
      newMessages = [...baseMessages, userMsg];
    }
    setMessages(newMessages);
    // First user message — collapse the atmospheric greeting card.
    if (showGreetingCard) setShowGreetingCard(false);
    if (!isRegenerate) setInput("");
    setIsLoading(true);

    // Sanitize. For a fresh conversation `messages` is empty, so this becomes
    // exactly [{ role: "user", content: trimmed }] — the user's first turn is
    // the true conversational start. The empty-history case is NOT an error.
    const apiMessages = sanitizeApiMessages(
      newMessages.map((m) => ({ role: m.role, content: m.content })),
    );

    // Only abort if there is genuinely no user message after sanitization.
    // An empty prior history is fine — the new user message is appended above.
    if (apiMessages.length === 0 || apiMessages[apiMessages.length - 1].role !== "user") {
      console.error("[chat] aborting send — no user message present", apiMessages);
      setIsLoading(false);
      inFlightRef.current = false;
      return;
    }

    // Defensive: if sanitization left us with no valid user-terminated turn,
    // bail out rather than letting the model reply to its own greeting.
    if (apiMessages.length === 0 || apiMessages[apiMessages.length - 1].role !== "user") {
      console.error("[chat] aborting send — no valid user message at tail of context", apiMessages);
      setIsLoading(false);
      inFlightRef.current = false;
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    const userIdLocal = sessionData.session?.user?.id ?? null;
    if (!accessToken || !userIdLocal) {
      console.warn("[chat] sign-in required to send messages");
      setIsLoading(false);
      inFlightRef.current = false;
      window.location.hash = "#/auth";
      return;
    }

    // Phase 4 — Memory: fetch bundle for the 5 main characters in character mode.
    // Failure is swallowed inside fetchMemoryBundle and yields null (no injection).
    // If an in-chat reset paused injection, skip the fetch entirely until the
    // next summarization cycle clears the guard.
    const memoryFetchPaused = characterId ? isMemoryInjectionPaused(characterId) : false;
    if (memoryFetchPaused) {
      console.log("[memory] injection paused — skipping fetch");
      memoryBundleRef.current = null;
    } else if (
      chatMode === "character" &&
      characterId &&
      userIdLocal &&
      MEMORY_CHARACTERS.has(characterId) &&
      !profile.preferences.incognito
    ) {
      const fetchedMemoryBundle = await fetchMemoryBundle(userIdLocal, characterId, trimmed);
      if (isMemoryInjectionPaused(characterId)) {
        console.log("[memory] injection paused — skipping fetched bundle");
        memoryBundleRef.current = null;
      } else {
        memoryBundleRef.current = fetchedMemoryBundle;
      }
    } else {
      memoryBundleRef.current = null;
    }

    // Fire classifier in parallel with chat stream so it never blocks reply.
    const categoryPromise = classifyUserMessage(normalized, accessToken);

    const assistantId = crypto.randomUUID();

    const removePartialAssistant = () => {
      setMessages((prev) => (prev[prev.length - 1]?.id === assistantId ? prev.slice(0, -1) : prev));
    };

    let result: { text: string; emotion: Emotion | null; intensity: number | null } | null = null;
    let lastError: unknown = null;

    // Timeout signal — if no response within 7s, surface a "Response delayed…"
    // ECHO. Cleared the moment the request settles (success or failure).
    const TIMEOUT_MS = 7000;
    const slowTimer = window.setTimeout(() => {
      pushEcho(setMessages, "Response delayed…", "timeout");
      void recordEchoLog("Response delayed…", "timeout", userIdLocal);
    }, TIMEOUT_MS);

    // Character mode: collect the full response off-screen, then parse JSON
    // and commit dialogue-only to the bubble. ASMR mode keeps live streaming.
    const streamToUI = chatMode !== "character";

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        result = await streamChatAttempt(apiMessages, accessToken, assistantId, streamToUI);
        console.log("[chat] response:", result);
        if (!result || !result.text || result.text.trim().length === 0) {
          throw new Error("Empty response from chat function");
        }
        break;
      } catch (err) {
        lastError = err;
        const status = (err as { status?: number })?.status;
        console.error(`[chat] attempt ${attempt} failed:`, err);
        if (status === 429) break;
        removePartialAssistant();
        if (attempt === 1) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    }

    window.clearTimeout(slowTimer);

    try {
      if (!result) {
        const status = (lastError as { status?: number })?.status;
        if (status === 429) {
          pushEcho(setMessages, "Too many requests. Wait a moment.", "rate_limit");
          void recordEchoLog("Too many requests. Wait a moment.", "rate_limit", userIdLocal);
        } else {
          pushEcho(setMessages, "Connection unstable. Try again.", "error");
          void recordEchoLog("Connection unstable. Try again.", "error", userIdLocal);
        }
        return;
      }

      // Successful response — clear any lingering ECHO (timeout/info).
      clearEcho(setMessages);

      // Character mode: parse the full collected response. Store dialogue
      // in `content` (never raw JSON), action/thought in their own fields.
      // ASMR mode: the bubble was already streamed in piece by piece.
      if (chatMode === "character") {
        if (isDebugActive()) {
          console.log("[character output raw]:", result.text);
        }
      }
      const parsed =
        chatMode === "character" ? parseCharacterOutput(result.text) : null;

      // Natural conversational pacing — only delay rendering of character
      // dialogue. Backend response time is unaffected; the message has
      // already arrived. ASMR mode commits immediately.
      // Base 600–900ms, +200–400ms if action present, +200–400ms if thought
      // present, with ±150ms jitter to avoid robotic timing.
      const computeRenderDelay = (
        hasAction: boolean,
        hasThought: boolean,
      ): number => {
        const rand = (min: number, max: number) =>
          min + Math.random() * (max - min);
        let delay = rand(600, 900);
        if (hasAction) delay += rand(200, 400);
        if (hasThought) delay += rand(200, 400);
        delay += rand(-150, 150);
        return Math.max(0, Math.round(delay));
      };

      if (chatMode === "character" && parsed) {
        const delayMs = computeRenderDelay(!!parsed.action, !!parsed.thought);
        await new Promise<void>((resolve) =>
          window.setTimeout(resolve, delayMs),
        );
      }

      setMessages((prev) => {
        const exists = prev.some((m) => m.id === assistantId);
        const patch: Partial<Message> = {
          emotion: result!.emotion,
          intensity: result!.intensity,
          ...(parsed
            ? { content: parsed.dialogue, action: parsed.action, thought: parsed.thought }
            : {}),
        };
        if (exists) {
          return prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m));
        }
        // Character mode first commit — append the assistant bubble now.
        return [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: parsed?.dialogue ?? result!.text,
            action: parsed?.action ?? null,
            thought: parsed?.thought ?? null,
            emotion: result!.emotion,
            intensity: result!.intensity,
          },
        ];
      });

      // Push thought into the local-only thoughts log (cap 10, newest first).
      if (parsed?.thought) {
        const thoughtText = parsed.thought;
        setThoughts((prev) => [
          { id: `${assistantId}-thought`, characterName: character.name, text: thoughtText, createdAt: Date.now() },
          ...prev,
        ].slice(0, 10));
      }

      void recordAnalytics("chat_exchange_completed", userIdLocal, {
        regenerated: isRegenerate,
        asmrType: asmrType ?? null,
        emotion: result.emotion,
        intensity: result.intensity,
      });

      // Phase 3+ — axes driven SOLELY by the user-message classifier.
      // Conflict / jealousy_trigger / vulnerability bypass MIN_EVENT_WEIGHT
      // AND diminishing returns so big emotional moments always land.
      if (characterId && !profile.preferences.incognito) {
        const finalCategory = await categoryPromise;
        const weight = EVENT_WEIGHTS[finalCategory];
        const bypass = isBypassCategory(finalCategory);

        const bumped = bumpExchangeCount(characterState);

        let writtenActive: CharacterState;
        if (bypass || weight >= MIN_EVENT_WEIGHT) {
          const cfg = getAxisConfig(characterId);
          const event = categoryToEvent(finalCategory);
          const ticked = tickDailyCount(bumped);
          const diminish = bypass ? 1 : getDiminishMultiplier(ticked.count);
          const effectiveWeight = bypass ? 1 : weight;
          const baseMagnitude = "magnitude" in event ? (event.magnitude ?? 1) : 1;
          const finalMagnitude = baseMagnitude * effectiveWeight * cfg.volatility * diminish;
          const scaled =
            "magnitude" in event ? { ...event, magnitude: finalMagnitude } : event;

          if (isDebugActive()) {
            // eslint-disable-next-line no-console
            console.log("[axes]", {
              category: finalCategory,
              weight,
              effectiveWeight,
              diminish,
              bypass,
              dailyCount: ticked.count,
              baseMagnitude,
              finalMagnitude,
              source: "user-message-classifier",
            });
          }

          const next = applyAxisEvent(ticked.state, scaled, characterId, profile.preferences);
          (window as unknown as { __lastAxisEvent?: unknown }).__lastAxisEvent = {
            category: finalCategory,
            weight,
            effectiveWeight,
            diminish,
            bypass,
            dailyCount: ticked.count,
            finalMagnitude,
          };
          writtenActive = next;
        } else {
          (window as unknown as { __lastAxisEvent?: unknown }).__lastAxisEvent = {
            category: finalCategory,
            weight,
            effectiveWeight: weight,
            diminish: 0,
            bypass: false,
            dailyCount: bumped.daily_count ?? 0,
            finalMagnitude: 0,
            skipped: true,
          };
          writtenActive = bumped;
        }

        // Phase 5 — Rivalry: decay/activate + cooldown. Character mode only,
        // skipped in incognito. Combined with the axes write below so a single
        // setCharacterState call persists both.
        // Patch 4 — strict trigger guard: only run when a NEW final assistant
        // message was appended (non-empty, role=assistant, not a regenerate/retry,
        // not a system/ECHO). `result` is non-null here (failure path returned
        // early), and the text-empty case throws inside streamChatAttempt.
        const assistantTextOk =
          !!result &&
          typeof result.text === "string" &&
          result.text.trim().length > 0;
        const rivalryEligible =
          chatMode === "character" &&
          !isRegenerate &&
          assistantTextOk;
        if (rivalryEligible) {
          const projectedProfile: ProfileData = {
            ...profile,
            characters: { ...profile.characters, [characterId]: writtenActive },
          };
          let nextRivalry = updateRivalryIntensity(characterId, projectedProfile);
          // Patch 8 — bump per-character "turns since expression" on every
          // successful assistant response. Reset to 0 inside setRivalryCooldown.
          nextRivalry = bumpRivalryTurns(nextRivalry);
          if (rivalryTriggeredCooldownRef.current) {
            nextRivalry = setRivalryCooldown(nextRivalry);
          }
          rivalryTriggeredCooldownRef.current = false;
          writtenActive = { ...writtenActive, rivalry_state: nextRivalry };
        }

        await setCharacterState(characterId, writtenActive);

        // Phase 4 — Memory: bump qualifying-exchange counter; fire summarization
        // every 5 qualifying exchanges (event weight > 0.2). Background only —
        // never blocks chat. Logs are required for testing.
        if (
          chatMode === "character" &&
          MEMORY_CHARACTERS.has(characterId) &&
          shouldSummarize(weight, memoryCounterRef.current)
        ) {
          fireSummarization({
            characterId,
            messages: apiMessages,
            lastEventWeight: weight,
          });
        }
      }
    } finally {
      setIsLoading(false);
      inFlightRef.current = false;
      if (isLoggedIn && characterId && !profile.preferences.incognito) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          setMessages((current) => {
            // ECHO (system) messages are local-only — never persisted.
            const persisted = current.filter(
              (m): m is Message & { role: "user" | "assistant" } =>
                m.role === "user" || m.role === "assistant",
            );
            saveSession(characterId, sessionKey, persisted);
            return current;
          });
        }, 2000);
      }
    }
  };

  /**
   * Per-character reset. Backend-first:
   *   1) Delete every chat_session + chat_message scoped to (user_id, characterId)
   *   2) Reset this character's relationship axes / message_count / daily_count
   *   3) Replace the visible message list with the greeting only
   * Other characters and global preferences are untouched.
   */
  const handleResetConversation = async () => {
    if (!characterId || !character || isResetting) return;
    setIsResetting(true);
    // Cancel any pending debounced save so we don't re-persist the cleared list.
    clearTimeout(saveTimerRef.current);
    try {
      await deleteCharacterSessions(characterId);
      await resetCharacterState(characterId);
      // Memory tables (narrative, milestones, preferences) are intentionally
      // preserved here — but pause injection so old memory does not bleed
      // into the fresh conversation until a new summarization cycle runs.
      pauseMemoryInjection(characterId);
      memoryBundleRef.current = null;
      memoryCounterRef.current.count = 0;
      console.log("[memory] injection paused — awaiting new cycle");
      setMessages([]);
      setShowGreetingCard(true);
    } catch (e) {
      console.error("[chat] per-character reset failed:", e);
    } finally {
      setIsResetting(false);
    }
  };

  /**
   * ECHO retry — resend the last user text. Only invoked from the EchoLayer
   * when echoType === "error" and isLoading === false. ECHO signals are
   * cleared on success inside sendMessage().
   */
  const retryLastMessage = () => {
    const last = lastUserTextRef.current;
    if (!last || isLoading) return;
    void sendMessage(last);
  };

  // Three-layer split: chat bubbles = user + assistant; signals = ECHO only.
  const chatMessages = messages.filter((m) => m.role !== "system");
  const echoSignals: EchoSignal[] = messages
    .filter((m) => m.role === "system")
    .map((m) => ({ id: m.id, content: m.content, echoType: m.echoType ?? "info" }));

  // Latest assistant action drives the floating PresenceFeed pill.
  const latestAssistantWithAction = [...chatMessages]
    .reverse()
    .find((m) => m.role === "assistant" && !!m.action);
  const latestAction = latestAssistantWithAction?.action ?? null;
  const latestActionId = latestAssistantWithAction?.id ?? null;

  // Regenerate button target: the most recent assistant message OR — when the
  // last turn was a silent failure (last message is the user with no assistant
  // following) — the trailing user message. Hidden while a generation is in
  // progress and only available when there is at least one user message to resend.
  const lastChat = chatMessages[chatMessages.length - 1];
  const hasUserToResend = chatMessages.some((m) => m.role === "user");
  const regenerateTargetId =
    !isLoading && hasUserToResend && lastChat
      ? lastChat.role === "assistant"
        ? lastChat.id
        : lastChat.role === "user"
          ? lastChat.id
          : null
      : null;

  const handleRegenerate = () => {
    let last = lastUserTextRef.current;
    if (!last) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          last = messages[i].content;
          break;
        }
      }
    }
    if (!last || isLoading) return;
    void sendMessage(last, { regenerate: true });
  };

  return (
    <div className="flex flex-col w-full max-w-full overflow-x-hidden safe-top" style={{ height: "100dvh" }}>
      <DebugOverlay
        characterState={characterState}
        sessionTier={sessionTier}
        memoryBlock={chatMode === "character" && characterId && !isMemoryInjectionPaused(characterId) ? buildMemoryBlock(memoryBundleRef.current, characterId) : ""}
      />
      <ChatHeader
        characterName={character.name}
        characterEmoji={character.emoji}
        categoryEmoji={category?.emoji ?? "💬"}
        categoryLabel={category?.label ?? "Whisper Corner"}
        autoVoice={autoVoice}
        onToggleAutoVoice={() => updatePreferences({ auto_voice: !autoVoice })}
        sessionTier={sessionTier}
        onCycleSessionTier={cycleTier}
        onResetConversation={handleResetConversation}
        isResetting={isResetting}
        onOpenThoughts={() => setThoughtsOpen(true)}
      />

      {/* Relationship indicator */}
      <div className="flex items-center justify-center gap-1.5 px-4 py-1.5 text-[11px] text-muted-foreground border-b border-border/40 capitalize">
        <Heart className="h-3 w-3 text-secondary" />
        <span>
          {characterState.relationship_label} · {characterState.message_count} exchanges
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-4 scrollbar-hide">
        <GreetingCard
          show={showGreetingCard && chatMessages.length === 0}
          characterName={character.name}
          characterEmoji={character.emoji}
          greeting={character.greeting}
        />
        <AnimatePresence initial={false}>
          {chatMessages.map((msg) => {
            return (
              <ChatMessage
                key={msg.id}
                id={msg.id}
                role={msg.role as "user" | "assistant"}
                content={msg.content}
                isPlayingVoice={playingMessageId === msg.id}
                isLoadingVoice={loadingMessageId === msg.id}
                onPlayVoice={() =>
                  speak(msg.id, msg.content, {
                    emotion: msg.emotion ?? "neutral",
                    intensity: msg.intensity ?? 3,
                    asmrType,
                    relationship: characterState.relationship_label,
                  })
                }
                onStopVoice={stop}
                canRegenerate={msg.id === regenerateTargetId}
                isRegenerating={isLoading}
                onRegenerate={handleRegenerate}
              />
            );
          })}
        </AnimatePresence>

        {isLoading && chatMessages[chatMessages.length - 1]?.role === "user" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="glass rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-primary animate-spin" />
              <span className="text-xs text-muted-foreground">{character.name} is whispering...</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* ECHO system signal layer + Presence pill — float just above the
          input, separate from the chat bubble flow. */}
      <div className="relative shrink-0 safe-bottom">
        <PresenceFeed action={latestAction} sourceId={latestActionId} />
        <EchoLayer signals={echoSignals} isLoading={isLoading} onRetry={retryLastMessage} />
        <ChatInput value={input} onChange={setInput} onSend={() => sendMessage(input)} disabled={isLoading} />
      </div>

      <ThoughtsPanel
        open={thoughtsOpen}
        onOpenChange={setThoughtsOpen}
        thoughts={thoughts}
      />
    </div>
  );
};

export default Chat;
