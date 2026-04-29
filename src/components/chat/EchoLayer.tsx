import { AnimatePresence, motion } from "framer-motion";
import { Radio, RotateCcw } from "lucide-react";

export type EchoType = "error" | "rate_limit" | "timeout" | "info";

export interface EchoSignal {
  id: string;
  content: string;
  echoType: EchoType;
}

interface EchoLayerProps {
  signals: EchoSignal[];
  isLoading: boolean;
  onRetry: () => void;
}

/**
 * ECHO — system signal layer. Floats above the chat input as a non-human
 * interruption. Never inline with conversation bubbles, never spoken,
 * never persisted, never sent to the model.
 *
 * Only the most recent signal is shown — anti-spam dedupe is enforced
 * upstream (no consecutive system messages get pushed to state).
 */
const EchoLayer = ({ signals, isLoading, onRetry }: EchoLayerProps) => {
  const current = signals[signals.length - 1];

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-2">
      <AnimatePresence>
        {current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 0.85, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/40 bg-background/70 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur-md"
            role="status"
            aria-live="polite"
          >
            <Radio className="h-3 w-3 text-muted-foreground/80" />
            <span className="font-medium tracking-wide text-muted-foreground/90">ECHO:</span>
            <span>{current.content}</span>
            {current.echoType === "error" && !isLoading && (
              <button
                onClick={onRetry}
                className="ml-1 inline-flex items-center gap-1 rounded-full border border-border/40 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                Retry
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EchoLayer;
