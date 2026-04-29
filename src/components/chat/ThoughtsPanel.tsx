import { useMemo } from "react";
import { motion } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export interface ThoughtEntry {
  id: string;
  characterName: string;
  text: string;
  /** Optional timestamp (ms) used for rapid-succession coalescing. */
  createdAt?: number;
}

interface ThoughtsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Most recent first. Already capped to 10 by the parent. */
  thoughts: ThoughtEntry[];
}

/**
 * Slide-up bottom sheet showing the last 10 character thoughts.
 * Local-only state — never persisted, never sent to TTS or the API.
 *
 * Presentation-only behavior:
 * - Each thought fades in softly with a slight delay (~300–500ms),
 *   so it reads as an internal echo rather than competing dialogue.
 * - Rendered with reduced visual weight (smaller text, lower opacity).
 * - If multiple thoughts arrived in rapid succession (<1s apart),
 *   only the most recent of that burst is displayed. Generation logic
 *   is untouched — older entries remain in state for future use.
 */
const RAPID_WINDOW_MS = 1000;

const ThoughtsPanel = ({ open, onOpenChange, thoughts }: ThoughtsPanelProps) => {
  // Coalesce rapid-succession thoughts: when consecutive entries (newest-first)
  // arrived within RAPID_WINDOW_MS of each other, keep only the latest.
  const visibleThoughts = useMemo(() => {
    if (thoughts.length === 0) return thoughts;
    const result: ThoughtEntry[] = [];
    let lastKeptTs: number | null = null;
    for (const t of thoughts) {
      const ts = t.createdAt;
      if (
        lastKeptTs !== null &&
        typeof ts === "number" &&
        lastKeptTs - ts < RAPID_WINDOW_MS
      ) {
        // This older thought arrived within the rapid window of the kept one — skip.
        continue;
      }
      result.push(t);
      if (typeof ts === "number") lastKeptTs = ts;
    }
    return result;
  }, [thoughts]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-heading text-foreground">Thoughts</SheetTitle>
        </SheetHeader>

        {visibleThoughts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nothing yet.</p>
        ) : (
          <ul className="mt-4 space-y-3 pb-4">
            {visibleThoughts.map((t, idx) => (
              <motion.li
                key={t.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 0.75, y: 0 }}
                transition={{
                  duration: 0.6,
                  ease: "easeOut",
                  // Stagger the first couple of entries with a gentle delay
                  // so newly-arrived thoughts feel like an echo rather than
                  // appearing in lockstep with dialogue.
                  delay: idx === 0 ? 0.4 : 0.3,
                }}
                className="rounded-lg border border-border/30 bg-muted/20 px-3 py-2"
              >
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 font-semibold">
                  {t.characterName}
                </p>
                <p className="text-xs italic text-foreground/70 mt-0.5 leading-relaxed">
                  {t.text}
                </p>
              </motion.li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ThoughtsPanel;
