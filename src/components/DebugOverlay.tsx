import type { CharacterState, NsfwLevel } from "@/types/profile";
import { isDebugActive } from "@/lib/debugMode";

interface DebugOverlayProps {
  characterState: CharacterState;
  sessionTier: NsfwLevel;
  memoryBlock?: string;
}

interface LastAxisEvent {
  category?: string;
  weight?: number;
  effectiveWeight?: number;
  diminish?: number;
  bypass?: boolean;
  dailyCount?: number;
  finalMagnitude?: number;
  skipped?: boolean;
}

/**
 * Dev-only overlay shown when ?debug=true is present in the URL.
 * Reads directly from the live character state — no caching.
 * Also surfaces the last axis-event metadata stashed on window
 * (category, weight, diminish, bypass, final delta).
 */
const DebugOverlay = ({ characterState, sessionTier, memoryBlock }: DebugOverlayProps) => {
  if (!isDebugActive()) return null;

  const fmt = (n: number | undefined) => (typeof n === "number" ? n.toFixed(2) : "—");
  const last = (window as unknown as { __lastAxisEvent?: LastAxisEvent }).__lastAxisEvent ?? {};

  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        right: 8,
        zIndex: 9999,
        background: "rgba(0,0,0,0.78)",
        color: "#fff",
        font: "11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
        padding: "6px 8px",
        borderRadius: 4,
        pointerEvents: "none",
        whiteSpace: "pre",
      }}
    >
      {`affection:       ${fmt(characterState.affection)}
trust:           ${fmt(characterState.trust)}
tension:         ${fmt(characterState.tension)}
jealousy:        ${fmt(characterState.jealousy)}
attachmentShift: ${fmt(characterState.attachmentShift)}
label:           ${characterState.relationship_label}
nsfw tier:       ${sessionTier}
─ last event ─
category:        ${last.category ?? "—"}${last.skipped ? " (skipped)" : ""}
weight:          ${fmt(last.weight)}
effectiveWeight: ${fmt(last.effectiveWeight)}
diminish:        ${fmt(last.diminish)}
bypass:          ${last.bypass === undefined ? "—" : String(last.bypass)}
dailyCount:      ${last.dailyCount ?? "—"}
finalDelta:      ${fmt(last.finalMagnitude)}
Memory:          ${memoryBlock && memoryBlock.length > 0 ? `active (${memoryBlock.length} chars)` : "none"}`}
    </div>
  );
};

export default DebugOverlay;
