import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Volume2, Square, Loader2, RotateCcw } from "lucide-react";

interface ChatMessageProps {
  id: string;
  role: "user" | "assistant";
  content: string;
  isPlayingVoice: boolean;
  isLoadingVoice?: boolean;
  onPlayVoice: () => void;
  onStopVoice: () => void;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
  isRegenerating?: boolean;
}

const ChatMessage = ({
  id,
  role,
  content,
  isPlayingVoice,
  isLoadingVoice,
  onPlayVoice,
  onStopVoice,
  onRegenerate,
  canRegenerate,
  isRegenerating,
}: ChatMessageProps) => {
  const isUser = role === "user";
  const showRegenerate = !!canRegenerate && !!onRegenerate;

  // Safe render-level fallback: if an assistant message somehow arrives as
  // raw JSON (parser bypass, fallback path), parse it here and render only
  // `dialogue`. Never run on partial/streaming content (loading spinner shows
  // a separate placeholder, so by the time we render an assistant bubble the
  // text is final). On any failure, render the original content unchanged.
  let displayContent = content;
  if (!isUser && typeof content === "string") {
    const trimmed = content.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && typeof (parsed as { dialogue?: unknown }).dialogue === "string") {
          displayContent = (parsed as { dialogue: string }).dialogue;
        }
      } catch (err) {
        console.error("[parseCharacterOutput] failed with raw content", content, err);
      }
    }

    // Final UI-level safeguard: strip any leftover system formatting or tool
    // artifacts that managed to slip through prior parsing layers. This is
    // defense-in-depth — it must be impossible for raw JSON, code fences, or
    // tool tags to ever reach the user.
    let cleaned = displayContent;

    // 1. Remove ```json ... ``` or ``` ... ``` fenced blocks (keep inner text).
    cleaned = cleaned.replace(/```(?:json|JSON)?\s*([\s\S]*?)```/g, "$1");

    // 2. Remove <tool_code>, <tool_call>, <tool_response>, etc. tags (keep inner).
    cleaned = cleaned.replace(/<\/?tool[_a-zA-Z]*\s*[^>]*>/g, "");

    // 3. If the entire cleaned string is a JSON object, try to extract dialogue.
    const ct = cleaned.trim();
    if (ct.startsWith("{") && ct.endsWith("}")) {
      try {
        const obj = JSON.parse(ct) as Record<string, unknown>;
        if (obj && typeof obj === "object") {
          if (typeof obj.dialogue === "string") {
            cleaned = obj.dialogue;
          } else {
            // Fallback: concatenate any string values, skipping known meta keys.
            const parts = Object.entries(obj)
              .filter(([k, v]) => typeof v === "string" && !["action", "thought"].includes(k))
              .map(([, v]) => v as string);
            if (parts.length > 0) cleaned = parts.join(" ");
          }
        }
      } catch {
        // Not valid JSON — fall through to key stripping below.
      }
    }

    // 4. Strip leftover inline key fragments like  "dialogue": "...", "action": "...", "thought": "..."
    cleaned = cleaned.replace(/"?(dialogue|action|thought)"?\s*:\s*"([^"]*)"/g, "$2");

    // 5. Strip stray wrapping braces/brackets and trailing commas.
    cleaned = cleaned.replace(/^[\s{[]+|[\s}\],]+$/g, "");

    cleaned = cleaned.trim();

    // If nothing readable remains, signal not to render.
    if (cleaned.length === 0) {
      return null;
    }

    displayContent = cleaned;
  }
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
    >
      <div
        className={`max-w-[85%] break-words rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "glass rounded-bl-md"
        }`}
      >
        <ReactMarkdown
          components={{
            em: ({ children }) =>
              isUser ? (
                // On purple bubbles, use a high-contrast pale tone with italic to read clearly.
                <em className="italic text-primary-foreground/70 font-light">
                  {children}
                </em>
              ) : (
                <em className="text-primary/80 not-italic">{children}</em>
              ),
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          }}
        >
          {displayContent}
        </ReactMarkdown>

        {!isUser && content.length > 0 && (
          <button
            onClick={isPlayingVoice ? onStopVoice : onPlayVoice}
            disabled={isLoadingVoice}
            className={`mt-2 flex items-center gap-1.5 text-xs transition-colors ${
              isPlayingVoice
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            } disabled:opacity-60`}
          >
            {isLoadingVoice ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Generating…</span>
              </>
            ) : isPlayingVoice ? (
              <>
                <Square className="h-3 w-3 fill-current" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Volume2 className="h-3 w-3" />
                <span>Listen</span>
              </>
            )}
          </button>
        )}
      </div>

      {showRegenerate && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRegenerate?.();
          }}
          disabled={isRegenerating}
          aria-label="Regenerate response"
          title="Regenerate response"
          className="mt-1.5 inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </motion.div>
  );
};

export default ChatMessage;
