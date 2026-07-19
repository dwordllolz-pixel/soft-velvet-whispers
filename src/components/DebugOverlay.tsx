import type { CharacterState, NsfwLevel } from "@/types/profile";
import { isDebugActive } from "@/lib/debugMode";
import { deriveRelationshipResult } from "@/lib/relationshipAxes";

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
 * (category, weight, diminish, bypass, final delta) and a plain-language
 * explanation of why the current label is what it is — built specifically
 * so relationship-tuning questions never again require reverse-engineering
 * thresholds from behavior (see RELATIONSHIP_STATE_V2.md, Section 6).
 *
 * The label + explanation both come from deriveRelationshipResult() in
 * relationshipAxes.ts — this file used to have its own explainLabel() that
 * hand-mirrored that logic, which meant a threshold change had to be kept
 * in sync across two places with nothing enforcing it. Fixed July 2026:
 * there is now exactly one function that knows how labels are derived.
 */
const DebugOverlay = ({ characterState, sessionTier, memoryBlock }: DebugOverlayProps) => {
  if (!isDebugActive()) return null;

  const fmt = (n: number | undefined) => (typeof n === "number" ? n.toFixed(2) : "—");
  const last = (window as unknown as { __lastAxisEvent?: LastAxisEvent }).__lastAxisEvent ?? {};
  const { label, reason } = deriveRelationshipResult(characterState);

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
        maxWidth: 340,
      }}
    >
      {`affection:       ${fmt(characterState.affection)}
trust:           ${fmt(characterState.trust)}
tension:         ${fmt(characterState.tension)}
jealousy:        ${fmt(characterState.jealousy)}
attachmentShift: ${fmt(characterState.attachmentShift)}
label:           ${label}
nsfw tier:       ${sessionTier}
─ why this label ─
${reason}
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
