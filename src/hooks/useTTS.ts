export function useTTS(_characterId: string) {
  return {
    speak: async () => {},
    stop: () => {},
    playingMessageId: null as string | null,
    loadingMessageId: null as string | null,
    isPlaying: false,
  };
}