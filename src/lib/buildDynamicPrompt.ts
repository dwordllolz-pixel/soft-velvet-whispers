export interface DynamicPromptParams {
    relationshipState: string;
    emotionalState: string;
    recentMemory?: string;
    avoidPatterns?: string[];
  }
  
  export function buildDynamicPrompt({
    relationshipState,
    emotionalState,
    recentMemory,
    avoidPatterns = [],
  }: DynamicPromptParams): string {
    const memoryBlock = recentMemory
      ? `\nRECENT MEMORY:\n${recentMemory}`
      : "";
  
    const avoidBlock =
      avoidPatterns.length > 0
        ? `\nAVOID REPEATING:\n${avoidPatterns.map((p) => `- ${p}`).join("\n")}`
        : "";
  
    return `
  RELATIONSHIP:
  ${relationshipState}
  
  EMOTIONAL STATE:
  ${emotionalState}
  ${memoryBlock}
  ${avoidBlock}
  
  RESPONSE LENGTH:
  - casual input → 1-3 sentences
  - emotional input → up to 5 sentences
  - never over-narrate
  `.trim();
  }