import { CHARACTERS } from "@/data/characters";
import { buildDynamicPrompt, DynamicPromptParams } from "./buildDynamicPrompt";

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

  return `
CORE RULES:
${CORE_RULES}

CHARACTER:
${character.identity}

SPEECH STYLE:
${character.speechStyle.map((s) => `- ${s}`).join("\n")}

BEHAVIOR:
${character.behaviorTags.map((b) => `- ${b}`).join("\n")}

BOUNDARIES:
${character.boundaries.map((b) => `- ${b}`).join("\n")}

${dynamicBlock}

${character.formattingRules}
`.trim();
}