import type { LyricsData, LyricLine } from '@/types/musicAiTypes';

/** Largest timing correction the lyrics UI allows, in either direction. */
export const LYRICS_OFFSET_LIMIT_SECONDS = 120;

/** Step used by the nudge buttons. */
export const LYRICS_OFFSET_STEP_SECONDS = 0.5;

/** Clamp to the allowed range and round to 0.1 s so repeated nudges never accumulate float noise. */
export function clampLyricsOffset(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  const clamped = Math.max(-LYRICS_OFFSET_LIMIT_SECONDS, Math.min(LYRICS_OFFSET_LIMIT_SECONDS, seconds));
  return Math.round(clamped * 10) / 10;
}

/** "+1.5 s", "−0.5 s" or "0 s" (true minus sign so it reads clearly next to the plus). */
export function formatLyricsOffset(seconds: number): string {
  const value = Math.round(seconds * 10) / 10;
  if (value === 0) return '0 s';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)} s`;
}

/**
 * Shift every timed element of a lyrics document by `offsetSeconds` (positive = lyrics appear later).
 *
 * Lines that end before the start of the song after shifting are dropped; anything that starts before 0
 * is clamped to 0. Returns the same object when there is nothing to shift, so memoisation stays cheap.
 */
export function shiftLyricsData(lyrics: LyricsData, offsetSeconds: number): LyricsData {
  if (!offsetSeconds || !lyrics?.lines?.length) return lyrics;

  const lines: LyricLine[] = [];
  for (const line of lyrics.lines) {
    const endTime = line.endTime + offsetSeconds;
    if (endTime <= 0) continue;

    const shifted: LyricLine = {
      ...line,
      startTime: Math.max(0, line.startTime + offsetSeconds),
      endTime,
    };

    if (line.chords?.length) {
      shifted.chords = line.chords.map((chord) => ({ ...chord, time: Math.max(0, chord.time + offsetSeconds) }));
    }

    if (line.wordTimings?.length) {
      shifted.wordTimings = line.wordTimings
        .filter((word) => word.endTime + offsetSeconds > 0)
        .map((word) => ({
          ...word,
          startTime: Math.max(0, word.startTime + offsetSeconds),
          endTime: word.endTime + offsetSeconds,
        }));
    }

    lines.push(shifted);
  }

  return { ...lyrics, lines };
}
