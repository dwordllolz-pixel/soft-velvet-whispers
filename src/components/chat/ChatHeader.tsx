import { useState } from "react";
import { ArrowLeft, RotateCcw, Volume2, VolumeX, Brain } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { NsfwLevel } from "@/types/profile";

interface ChatHeaderProps {
  characterName: string;
  characterEmoji: string;
  categoryEmoji: string;
  categoryLabel: string;
  autoVoice: boolean;
  onToggleAutoVoice: () => void;
  /** Per-session NSFW tier (overrides global preference). */
  sessionTier: NsfwLevel;
  onCycleSessionTier: () => void;
  /** Per-character reset (backend-first). Disabled while in flight. */
  onResetConversation: () => Promise<void> | void;
  isResetting?: boolean;
  /** Opens the local-only thoughts panel. */
  onOpenThoughts: () => void;
}

const TIER_META: Record<NsfwLevel, { label: string; cls: string }> = {
  sfw: { label: "SFW", cls: "bg-muted text-muted-foreground" },
  suggestive: { label: "18+", cls: "bg-secondary text-secondary-foreground" },
  explicit: { label: "21+", cls: "bg-primary text-primary-foreground" },
};

const ChatHeader = ({
  characterName,
  characterEmoji,
  categoryEmoji,
  categoryLabel,
  autoVoice,
  onToggleAutoVoice,
  sessionTier,
  onCycleSessionTier,
  onResetConversation,
  isResetting = false,
  onOpenThoughts,
}: ChatHeaderProps) => {
  const navigate = useNavigate();
  const meta = TIER_META[sessionTier];
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <header className="shrink-0 glass border-b border-border/30 px-4 py-3 flex items-center gap-3">
      <button
        onClick={() => navigate(-1)}
        className="h-8 w-8 rounded-full glass flex items-center justify-center"
        aria-label="Back"
      >
        <ArrowLeft className="h-4 w-4 text-foreground" />
      </button>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-xl">{characterEmoji}</span>
        <div className="min-w-0">
          <p className="font-heading font-semibold text-sm text-foreground truncate">
            {characterName}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {categoryEmoji} {categoryLabel}
          </p>
        </div>
      </div>

      <button
        onClick={onCycleSessionTier}
        title="Cycle SFW / suggestive / explicit"
        className={`h-7 rounded-full px-2.5 text-[10px] font-semibold tracking-wide transition-colors ${meta.cls}`}
      >
        {meta.label}
      </button>

      <button
        onClick={onOpenThoughts}
        title="Thoughts"
        aria-label="Open thoughts panel"
        className="h-8 w-8 rounded-full glass flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
      >
        <Brain className="h-4 w-4" />
      </button>

      <button
        onClick={() => setConfirmOpen(true)}
        disabled={isResetting}
        title="Reset this conversation"
        aria-label="Reset this conversation"
        className="h-8 w-8 rounded-full glass flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
      >
        <RotateCcw className={`h-4 w-4 ${isResetting ? "animate-spin" : ""}`} />
      </button>

      <button
        onClick={onToggleAutoVoice}
        className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors ${
          autoVoice
            ? "bg-primary text-primary-foreground"
            : "glass text-muted-foreground"
        }`}
        aria-label="Toggle auto voice"
      >
        {autoVoice ? (
          <Volume2 className="h-4 w-4" />
        ) : (
          <VolumeX className="h-4 w-4" />
        )}
      </button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset conversation with {characterName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every message in this conversation and
              resets your relationship with {characterName} back to stranger.
              Other characters are not affected. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isResetting}
              onClick={async (e) => {
                e.preventDefault();
                await onResetConversation();
                setConfirmOpen(false);
              }}
            >
              {isResetting ? "Resetting…" : "Reset conversation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
};

export default ChatHeader;
