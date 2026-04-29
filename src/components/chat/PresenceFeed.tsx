import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface PresenceFeedProps {
  /** The action text from the most recent assistant message, or null. */
  action: string | null;
  /** Stable key for the source message — used to detect a new action arrival. */
  sourceId: string | null;
}

type VisibleState = {
  id: string;
  text: string;
  /** "active" = full opacity, "ambient" = faded persistent state. */
  phase: "active" | "ambient";
};

/**
 * Floating presence feed — shows the latest character action as a
 * semi-transparent pill above the chat input. Completely separate from
 * the chat bubble flow. Never persisted, never sent to TTS or the API.
 *
 * Lifecycle:
 * - Appears 300ms after a new action arrives
 * - Stays at full opacity for 4000ms
 * - Then drops to ambient (~30% opacity) and persists until replaced
 * - Minimum 1500ms between replacements — rapid-fire actions are throttled
 */
const ACTIVE_DURATION_MS = 4000;
const APPEAR_DELAY_MS = 300;
const MIN_REPLACEMENT_MS = 1500;

const PresenceFeed = ({ action, sourceId }: PresenceFeedProps) => {
  const [visible, setVisible] = useState<VisibleState | null>(null);
  const lastShownAtRef = useRef<number>(0);
  const pendingTimersRef = useRef<number[]>([]);

  useEffect(() => {
    if (!action || !sourceId) return;
    // Skip if this is the same action already showing.
    if (visible?.id === sourceId) return;

    const clearPending = () => {
      pendingTimersRef.current.forEach((t) => window.clearTimeout(t));
      pendingTimersRef.current = [];
    };

    const now = Date.now();
    const sinceLast = now - lastShownAtRef.current;
    const replacementDelay =
      lastShownAtRef.current === 0
        ? APPEAR_DELAY_MS
        : Math.max(APPEAR_DELAY_MS, MIN_REPLACEMENT_MS - sinceLast);

    clearPending();

    const showTimer = window.setTimeout(() => {
      lastShownAtRef.current = Date.now();
      setVisible({ id: sourceId, text: action, phase: "active" });

      const fadeTimer = window.setTimeout(() => {
        setVisible((curr) =>
          curr?.id === sourceId ? { ...curr, phase: "ambient" } : curr
        );
      }, ACTIVE_DURATION_MS);

      pendingTimersRef.current.push(fadeTimer);
    }, replacementDelay);

    pendingTimersRef.current.push(showTimer);

    return clearPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, sourceId]);

  return (
    <div className="pointer-events-none absolute left-1/2 -top-12 -translate-x-1/2 z-20 w-full flex justify-center px-4">
      <AnimatePresence mode="wait">
        {visible && (
          <motion.div
            key={visible.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: visible.phase === "active" ? 0.85 : 0.3, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="rounded-full border border-border/40 bg-muted/40 backdrop-blur-md px-4 py-1.5 text-xs italic text-muted-foreground max-w-[90%] truncate"
          >
            {visible.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PresenceFeed;
