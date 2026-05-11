export function extractRepeatedPatterns(messages: string[]) {
    const patterns: string[] = [];
  
    const joined = messages.join(" ").toLowerCase();
  
    const trackedPatterns = [
      "oh, uh",
      "adjusts glasses",
      "hoodie strings",
      "finger tapping",
    ];
  
    for (const pattern of trackedPatterns) {
      const matches = joined.match(
        new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
      );
  
      if ((matches?.length ?? 0) >= 2) {
        patterns.push(pattern);
      }
    }
  
    return patterns;
  }