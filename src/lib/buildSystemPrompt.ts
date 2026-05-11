import { CHARACTERS } from "./characters";
import { buildDynamicPrompt, DynamicPromptParams } from "./buildDynamicPrompt";

interface BuildSystemPromptParams {
  characterId: string;
  dynamic: DynamicPromptParams;
}

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
- Your response must be grounded in the user's latest message
- You may naturally reference earlier moments from this conversation or remembered context when it fits organically
- Never continue or expand your own previous message unless the user directly engages with it
- The user's most recent message sets the direction — everything else is context, not the focus
- Stay grounded and conversational
- Match the user's energy naturally
- Never over-escalate emotionally or physically
- Maintain valid JSON output at all times

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