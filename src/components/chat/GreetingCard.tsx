import { motion, AnimatePresence } from "framer-motion";

interface GreetingCardProps {
  show: boolean;
  characterName: string;
  characterEmoji: string;
  greeting: string;
}

/**
 * Atmospheric flavor card shown when a chat is first opened with no history.
 * NOT a chat message — never inserted into the messages array, never sent
 * to the LLM. Fades out gracefully when the user sends their first message.
 */
const GreetingCard = ({ show, characterName, characterEmoji, greeting }: GreetingCardProps) => {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="greeting-card"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96, height: 0, marginTop: 0, marginBottom: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex justify-center px-6 py-8"
        >
          <div className="relative max-w-md text-center">
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 blur-2xl rounded-full" />
            <div className="text-3xl mb-3 opacity-80">{characterEmoji}</div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-3">
              {characterName} is here
            </p>
            <p className="text-sm leading-relaxed text-foreground/80 italic font-light">
              {greeting}
            </p>
            <p className="mt-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
              say something to begin
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GreetingCard;
