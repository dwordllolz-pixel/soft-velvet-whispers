import { characters } from "@/data/characters";
import { buildDynamicPrompt, DynamicPromptParams } from "./buildDynamicPrompt";

const CHARACTERS = Object.fromEntries(
  characters.map((c) => [c.id, c])
);

interface BuildSystemPromptParams {
  characterId: string;
  dynamic: DynamicPromptParams;
}

const CORE_RULES = `
- Latest user message determines response direction.
- Prior conversation and memory may be referenced naturally.
- Never continue your own prior narrative unless user engages with it.
- Stay conversational and grounded.
- Match the user's emotional intensity naturally.
- Never over-escalate emotionally or physically.
- Maintain valid JSON output at all times.
`.trim();

export function buildSystemPrompt({
  characterId,
  dynamic,
}: BuildSystemPromptParams): string {

  const character = CHARACTERS[characterId];

  if (!character) {
    console.warn(`[buildSystemPrompt] unknown character: ${characterId}`);
    return "";
  }

  const dynamicBlock = buildDynamicPrompt(dynamic);

  return [
    character.systemPromptBase,
    CORE_RULES,
    dynamicBlock,
    `RESPONSE FORMAT — MANDATORY. Respond with a single valid JSON object and 
nothing else. No prose, no markdown, no text outside the JSON.

{
  "dialogue": "what you say out loud",
  "action": "*physical action in asterisks, or null if none*",
  "thought": "your internal thought the user cannot hear, or null if none"
}

Any response that is not valid JSON will be rejected.`,
  ]
    .filter((s) => s && s.trim().length > 0)
    .join("\n\n")
    .trim();
}