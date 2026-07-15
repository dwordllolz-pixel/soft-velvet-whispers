export interface DynamicPromptParams {
    relationshipState: string;
    emotionalState: string;
    recentMemory?: string;
    avoidPatterns?: string[];
    /** Phase 5 — optional pre-built rivalry block (already trimmed to short form if needed). */
    rivalryBlock?: string;
  }
  
  export function buildDynamicPrompt({
    relationshipState,
    emotionalState,
    recentMemory,
    avoidPatterns = [],
    rivalryBlock,
  }: DynamicPromptParams): string {
    const memoryBlock = recentMemory
      ? `\nRECENT MEMORY:\n${recentMemory}`
      : "";
  
    const avoidBlock =
      avoidPatterns.length > 0
        ? `\nAVOID REPEATING:\n${avoidPatterns.map((p) => `- ${p}`).join("\n")}`
        : "";

    const rivalryPromptBlock = rivalryBlock?.trim()
      ? `\nRIVALRY:\n${rivalryBlock.trim()}`
      : "";
  
    return `
  RELATIONSHIP:
  ${relationshipState}
  
  EMOTIONAL STATE:
  ${emotionalState}
  ${memoryBlock}
  ${avoidBlock}
  ${rivalryPromptBlock}
  
  RESPONSE LENGTH:
  - casual input → 1-3 sentences
  - emotional input → up to 5 sentences
  - never over-narrate
  `.trim();
  }