type SpeakContext = {
  emotion?: string | null;
  intensity?: number | null;
  asmrType?: string;
  relationship?: string | null;
};

export function useTTS(_characterId: string) {
  return {
    speak: async (_messageId: string, _content: string, _ctx?: SpeakContext) => {},
    stop: () => {},
    playingMessageId: null as string | null,
    loadingMessageId: null as string | null,
    isPlaying: false,
  };
}