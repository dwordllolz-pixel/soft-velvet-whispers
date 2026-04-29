# ASMR Ambient Sound Loops

Drop seamless looping audio files here. Missing files fail silently — the voice
will still play normally; only the ambient layer will be skipped.

## Required filenames

| Filename          | Triggered by                              |
| ----------------- | ----------------------------------------- |
| `tapping.mp3`     | `tap... tap... tap`, `tap-tap-tap`        |
| `scratching.mp3`  | `scratch... scratch... scratch`           |
| `clicking.mp3`    | `click-clack`, `click... click... click`  |
| `brushing.mp3`    | `brush... brush... brush`                 |

## Recommendations
- **Format**: MP3, 128–192 kbps mono.
- **Length**: 8–20 seconds, perfectly seamless loop (the `<audio loop>` element
  re-triggers without crossfade, so the start and end sample MUST match).
- **Level**: Normalize to around -18 LUFS. Playback volume is fixed at 0.18 in
  `useTTS.ts`, so very loud masters will still sit nicely under the voice.
- **Source**: Royalty-free libraries (Freesound CC0, Pixabay, Zapsplat) work
  well. Avoid clips with strong stereo movement — they distract from the voice.
