/**
 * Unit Tests: lyricsOffset
 *
 * Timing correction for synced lyrics (covers are rarely timed like the original recording).
 */

import {
  LYRICS_OFFSET_LIMIT_SECONDS,
  clampLyricsOffset,
  formatLyricsOffset,
  shiftLyricsData,
} from '@/utils/lyricsOffset';
import type { LyricsData } from '@/types/musicAiTypes';

const lyrics: LyricsData = {
  lines: [
    { startTime: 1, endTime: 3, text: 'first', chords: [] },
    {
      startTime: 3,
      endTime: 6,
      text: 'second line',
      chords: [{ time: 4, chord: 'Am', position: 2 }],
      wordTimings: [
        { text: 'second', startTime: 3, endTime: 4.5, startChar: 0, endChar: 6 },
        { text: 'line', startTime: 4.5, endTime: 6, startChar: 7, endChar: 11 },
      ],
    },
  ],
};

describe('lyricsOffset', () => {
  describe('clampLyricsOffset', () => {
    it('rounds to 0.1 s so repeated nudges do not accumulate float noise', () => {
      let value = 0;
      for (let i = 0; i < 7; i++) value = clampLyricsOffset(value + 0.1);
      expect(value).toBe(0.7);
    });

    it('limits the range in both directions', () => {
      expect(clampLyricsOffset(9999)).toBe(LYRICS_OFFSET_LIMIT_SECONDS);
      expect(clampLyricsOffset(-9999)).toBe(-LYRICS_OFFSET_LIMIT_SECONDS);
    });

    it('treats non-finite input as zero', () => {
      expect(clampLyricsOffset(Number.NaN)).toBe(0);
      expect(clampLyricsOffset(Number.POSITIVE_INFINITY)).toBe(0);
    });
  });

  describe('formatLyricsOffset', () => {
    it('shows a signed value with one decimal', () => {
      expect(formatLyricsOffset(1.5)).toBe('+1.5 s');
      expect(formatLyricsOffset(-0.5)).toBe('−0.5 s');
      expect(formatLyricsOffset(0)).toBe('0 s');
    });
  });

  describe('shiftLyricsData', () => {
    it('returns the same object when there is nothing to shift', () => {
      expect(shiftLyricsData(lyrics, 0)).toBe(lyrics);
      const empty: LyricsData = { lines: [] };
      expect(shiftLyricsData(empty, 2)).toBe(empty);
    });

    it('moves lines, word timings and chord markers later', () => {
      const shifted = shiftLyricsData(lyrics, 2);
      expect(shifted.lines[0]).toMatchObject({ startTime: 3, endTime: 5 });
      expect(shifted.lines[1]).toMatchObject({ startTime: 5, endTime: 8 });
      expect(shifted.lines[1].chords?.[0].time).toBe(6);
      expect(shifted.lines[1].wordTimings?.map((w) => [w.startTime, w.endTime])).toEqual([[5, 6.5], [6.5, 8]]);
    });

    it('does not mutate its input', () => {
      const before = JSON.stringify(lyrics);
      shiftLyricsData(lyrics, -2);
      expect(JSON.stringify(lyrics)).toBe(before);
    });

    it('clamps starts at 0 and drops lines that now end before the song starts', () => {
      const shifted = shiftLyricsData(lyrics, -2.5);
      // first line ends at 0.5 -> kept but starts at 0; nothing dropped yet
      expect(shifted.lines[0]).toMatchObject({ startTime: 0, endTime: 0.5 });

      const further = shiftLyricsData(lyrics, -3);
      // first line ends at exactly 0 -> dropped
      expect(further.lines).toHaveLength(1);
      expect(further.lines[0].text).toBe('second line');
      expect(further.lines[0].startTime).toBe(0);
    });

    it('drops word timings that end before the start', () => {
      const shifted = shiftLyricsData(lyrics, -4.5);
      expect(shifted.lines).toHaveLength(1);
      expect(shifted.lines[0].wordTimings?.map((w) => w.text)).toEqual(['line']);
    });
  });
});
