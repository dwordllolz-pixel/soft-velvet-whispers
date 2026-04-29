import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { extractDialogueText, splitIntoSentences } from "@/lib/ttsUtils";
import { detectAndStripAsmrSounds } from "@/lib/asmrDetect";
import { getAsmrSoundFile } from "@/data/asmrSounds";
import { supabase, supabaseEnv } from "@/integrations/supabase/client";
import { getCharacterVoice, EMOTION_PARAMS, type EmotionParams } from "@/data/voiceArchetypes";
import { blendParams, type Emotion, type RelationshipLevel } from "@/data/emotionMatrix";

const AMBIENT_VOLUME = 0.18;
const AMBIENT_FADE_MS = 600;

interface SpeakContext {
  emotion?: Emotion | null;
  intensity?: number | null;
  asmrType?: string;
  /** Relationship label (legacy enum or any new derived label string). */
  relationship?: RelationshipLevel | string;
}

type JobStatus = "pending" | "ready" | "playing" | "done" | "error";

interface TTSJob {
  index: number;
  text: string;
  status: JobStatus;
  blob?: Blob;
  url?: string;
  abort: AbortController;
  promise?: Promise<Blob>;
}

const MAX_IN_FLIGHT = 2;

export function useTTS(characterId: string) {
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [loadingMessageId, setLoadingMessageId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ambientRef = useRef<HTMLAudioElement | null>(null);
  const ambientFadeRef = useRef<number | null>(null);
  const jobsRef = useRef<TTSJob[]>([]);
  const sessionIdRef = useRef(0); // Bumped on stop() — playback loop checks before acting.

  const stopAmbient = useCallback(() => {
    if (ambientFadeRef.current !== null) {
      window.clearInterval(ambientFadeRef.current);
      ambientFadeRef.current = null;
    }
    if (ambientRef.current) {
      try { ambientRef.current.pause(); } catch { /* noop */ }
      ambientRef.current.src = "";
      ambientRef.current = null;
    }
  }, []);

  const fadeOutAmbient = useCallback(() => {
    const audio = ambientRef.current;
    if (!audio) return;
    if (ambientFadeRef.current !== null) {
      window.clearInterval(ambientFadeRef.current);
    }
    const startVol = audio.volume;
    const steps = 12;
    const stepMs = AMBIENT_FADE_MS / steps;
    let i = 0;
    ambientFadeRef.current = window.setInterval(() => {
      i += 1;
      try { audio.volume = Math.max(0, startVol * (1 - i / steps)); } catch { /* noop */ }
      if (i >= steps) {
        if (ambientFadeRef.current !== null) {
          window.clearInterval(ambientFadeRef.current);
          ambientFadeRef.current = null;
        }
        try { audio.pause(); } catch { /* noop */ }
        audio.src = "";
        if (ambientRef.current === audio) ambientRef.current = null;
      }
    }, stepMs);
  }, []);

  const cleanupAll = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        /* noop */
      }
      audioRef.current.src = "";
      audioRef.current = null;
    }
    stopAmbient();
    for (const job of jobsRef.current) {
      if (job.status === "pending") {
        try {
          job.abort.abort();
        } catch {
          /* noop */
        }
      }
      if (job.url) {
        URL.revokeObjectURL(job.url);
        job.url = undefined;
      }
    }
    jobsRef.current = [];
  }, [stopAmbient]);

  useEffect(() => () => cleanupAll(), [cleanupAll]);

  const stop = useCallback(() => {
    sessionIdRef.current += 1; // Invalidate any in-flight playback loop iteration.
    cleanupAll();
    setPlayingMessageId(null);
    setLoadingMessageId(null);
  }, [cleanupAll]);

  const speak = useCallback(
    async (messageId: string, content: string, ctx: SpeakContext = {}) => {
      const dialogueText = extractDialogueText(content);
      if (!dialogueText) return;

      // Detect & strip ASMR onomatopoeia BEFORE TTS sees it. Strips
      // patterns like "tap... tap... tap" so Chatterbox doesn't try to speak
      // them; we'll layer a matching ambient loop underneath instead.
      const { cleanText: fullText, triggeredSoundIds } = detectAndStripAsmrSounds(dialogueText);
      if (!fullText) return;
      const ambientFile = triggeredSoundIds[0] ? getAsmrSoundFile(triggeredSoundIds[0]) : undefined;

      const voice = getCharacterVoice(characterId);
      if (!voice) {
        toast.info("No voice configured for this character.");
        return;
      }
      if (!voice.referenceAudio) {
        toast.info(`${voice.label} voice coming soon — reference audio not uploaded yet.`);
        return;
      }

      // Reset any prior session.
      stop();
      const mySession = sessionIdRef.current;
      setLoadingMessageId(messageId);

      // Auth (best-effort; anon sign-in fallback).
      const { data: sessionData } = await supabase.auth.getSession();
      let accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error || !data.session) {
          toast.error("Couldn't start voice session.");
          if (sessionIdRef.current === mySession) setLoadingMessageId(null);
          return;
        }
        accessToken = data.session.access_token;
      }

      // Resolve params once for this whole utterance.
      const LEGACY_TIERS: RelationshipLevel[] = ["stranger", "acquaintance", "close", "intimate", "devoted"];
      const rel = ctx.relationship;
      const safeRel: RelationshipLevel =
        rel && (LEGACY_TIERS as string[]).includes(rel) ? (rel as RelationshipLevel) : "stranger";
      const params: EmotionParams = ctx.asmrType
        ? blendParams({
            archetype: voice.archetype,
            asmrType: ctx.asmrType,
            emotion: ctx.emotion ?? "neutral",
            intensity: ctx.intensity ?? 3,
            relationship: safeRel,
          })
        : EMOTION_PARAMS[voice.archetype];

      const sentences = splitIntoSentences(fullText);
      const ttsUrl = `${supabaseEnv.url}/functions/v1/chatterbox-tts`;

      // Build local jobs array first — playback loop reads via jobsRef, not React state.
      const jobs: TTSJob[] = sentences.map((text, index) => ({
        index,
        text,
        status: "pending",
        abort: new AbortController(),
      }));
      jobsRef.current = jobs;

      const FETCH_TIMEOUT_MS = 30000;

      const fetchJob = (job: TTSJob) => {
        if (job.promise) return job.promise; // Guard against duplicate fetches.
        const timeoutId = setTimeout(() => {
          try { job.abort.abort(); } catch { /* noop */ }
        }, FETCH_TIMEOUT_MS);

        job.promise = (async () => {
          try {
            const resp = await fetch(ttsUrl, {
              method: "POST",
              signal: job.abort.signal,
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                text: job.text,
                reference_audio_filename: voice.referenceAudio,
                ...params,
              }),
            });
            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              throw new Error(err.error || `TTS ${resp.status}`);
            }
            const blob = await resp.blob();
            if (sessionIdRef.current !== mySession) throw new Error("aborted");
            job.blob = blob;
            job.url = URL.createObjectURL(blob);
            if (job.status === "pending") job.status = "ready";
            return blob;
          } finally {
            clearTimeout(timeoutId);
          }
        })();

        // Chain: when this job resolves, start job index+MAX_IN_FLIGHT (maintains window).
        job.promise
          .then(() => {
            if (sessionIdRef.current !== mySession) return;
            const next = jobs[job.index + MAX_IN_FLIGHT];
            if (next && !next.promise) fetchJob(next);
          })
          .catch((err) => {
            if (sessionIdRef.current !== mySession) return;
            if ((err as Error).message === "aborted") return;
            job.status = "error";
            console.error(`TTS sentence ${job.index} failed:`, err);
          });

        return job.promise;
      };

      // Phase 1 startup pacing (refinement #4): fire 0 immediately, fire 1 in next microtask
      // — BEFORE awaiting 0. This avoids a double startup latency spike.
      if (jobs[0]) fetchJob(jobs[0]);
      if (jobs[1]) {
        queueMicrotask(() => {
          if (sessionIdRef.current === mySession && jobs[1] && !jobs[1].promise) {
            fetchJob(jobs[1]);
          }
        });
      }

      // Playback driver — strictly index-ordered (refinement #2).
      let currentIdx = 0;
      const playNext = async () => {
        if (sessionIdRef.current !== mySession) return;
        if (currentIdx >= jobs.length) {
          if (sessionIdRef.current === mySession) {
            setPlayingMessageId(null);
            setLoadingMessageId(null);
            // Fade ambient out at the end of the utterance.
            fadeOutAmbient();
          }
          jobsRef.current = [];
          return;
        }

        const job = jobs[currentIdx];

        // Only ever await the CURRENT job — never look ahead (refinement #3).
        if (job.status === "pending") {
          try {
            await job.promise;
          } catch {
            /* error handled below */
          }
        }
        if (sessionIdRef.current !== mySession) return;

        if (job.status === "error" || !job.url) {
          // Skip failed sentence and continue.
          currentIdx += 1;
          return playNext();
        }

        const audio = new Audio(job.url);
        audio.playbackRate = 1.0;
        if ("preservesPitch" in audio) {
          (audio as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = true;
        }
        audioRef.current = audio;
        job.status = "playing";

        audio.onended = () => {
          if (sessionIdRef.current !== mySession) return;
          // Revoke URL only AFTER playback ends (refinement #4 from your list).
          if (job.url) {
            URL.revokeObjectURL(job.url);
            job.url = undefined;
          }
          job.status = "done";
          currentIdx += 1;
          void playNext();
        };
        audio.onerror = () => {
          if (sessionIdRef.current !== mySession) return;
          if (job.url) {
            URL.revokeObjectURL(job.url);
            job.url = undefined;
          }
          job.status = "error";
          currentIdx += 1;
          void playNext();
        };

        try {
          await audio.play();
          if (sessionIdRef.current !== mySession) return;
          if (currentIdx === 0) {
            setLoadingMessageId(null);
            setPlayingMessageId(messageId);
            // Start ambient loop in sync with first sentence.
            if (ambientFile && !ambientRef.current) {
              try {
                const amb = new Audio(ambientFile);
                amb.loop = true;
                amb.volume = AMBIENT_VOLUME;
                amb.onerror = () => {
                  // Missing/broken file — fail silently, voice continues.
                  if (ambientRef.current === amb) ambientRef.current = null;
                };
                ambientRef.current = amb;
                void amb.play().catch(() => {
                  if (ambientRef.current === amb) ambientRef.current = null;
                });
              } catch {
                /* noop */
              }
            }
          }
        } catch (err) {
          console.error("Audio play failed:", err);
          if (sessionIdRef.current !== mySession) return;
          job.status = "error";
          currentIdx += 1;
          void playNext();
        }
      };

      void playNext();
    },
    [characterId, stop, fadeOutAmbient]
  );

  return {
    speak,
    stop,
    playingMessageId,
    loadingMessageId,
    isPlaying: playingMessageId !== null,
  };
}
