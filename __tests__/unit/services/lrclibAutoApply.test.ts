/**
 * Unit Tests: LRCLIB auto-apply rule
 *
 * A cover of a known song (title matches, duration does not) should get synced lyrics applied
 * automatically; weak or plain-only matches must be left to the manual picker.
 */

import {
  AUTO_APPLY_MIN_TEXT_SCORE,
  buildSegmentQueries,
  isAutoApplicableCandidate,
  isTimedCandidate,
  normalizeLRCLibCandidate,
  parseVideoTitle,
} from '@/services/lyrics/lrclibService';

const SYNCED = '[00:10.00]Mere samne\n[00:20.00]Wali khidki mein';
const VIDEO_TITLE = 'Mere Samne Wali Khidki Mein | Karan Nawani | Ukulele Cover | Padosan | Kishore Kumar';

function candidate(overrides: Record<string, unknown> = {}, videoTitle = VIDEO_TITLE, videoDuration = 185) {
  return normalizeLRCLibCandidate(
    {
      id: 1,
      trackName: 'Mere Samne Wali Khidki Mein',
      artistName: 'Kishore Kumar',
      duration: 172,
      syncedLyrics: SYNCED,
      plainLyrics: 'Mere samne\nWali khidki mein',
      ...overrides,
    },
    parseVideoTitle(videoTitle),
    videoTitle,
    videoDuration,
  )!;
}

describe('LRCLIB auto-apply', () => {
  it('exposes the text-match score used for the decision', () => {
    expect(candidate().textScore).toBeGreaterThanOrEqual(AUTO_APPLY_MIN_TEXT_SCORE);
  });

  it('applies synced lyrics for a cover whose title is in the video title, despite a 13 s duration gap', () => {
    const cover = candidate();
    expect(cover.durationDelta).toBeCloseTo(13);
    expect(cover.confidence).not.toBe('high'); // not 'high': the auto-apply rule, not confidence, is what applies it
    expect(isTimedCandidate(cover)).toBe(true);
    expect(isAutoApplicableCandidate(cover)).toBe(true);
  });

  it('leaves a weak title match to the manual picker', () => {
    const weak = candidate({ trackName: 'Khidki', artistName: 'Someone Else' });
    expect(isAutoApplicableCandidate(weak)).toBe(false);
  });

  it('ranks the song named in the title above a different song by the same singer with a closer duration', () => {
    const right = candidate({ id: 1, duration: 172 });
    const wrong = candidate({ id: 2, trackName: 'Mere Bhole Balam', artistName: 'Kishore Kumar', duration: 194 });
    expect(wrong.durationDelta).toBeLessThan(right.durationDelta ?? 0);
    expect(right.score).toBeGreaterThan(wrong.score);
  });

  it('matches whole words only, so a title inside a longer word does not count', () => {
    const partial = candidate({ trackName: 'Mein', artistName: 'Nobody' });
    expect(partial.textScore).toBeLessThan(AUTO_APPLY_MIN_TEXT_SCORE);
    const inside = candidate({ trackName: 'Samne Wal', artistName: 'Nobody' });
    expect(inside.textScore ?? 0).toBeLessThan(AUTO_APPLY_MIN_TEXT_SCORE);
  });

  it('never auto-applies plain-only lyrics', () => {
    const plainOnly = candidate({ syncedLyrics: undefined });
    expect(plainOnly.lyric_mode).toBe('plain');
    expect(isAutoApplicableCandidate(plainOnly)).toBe(false);
  });

  it('never auto-applies an instrumental track', () => {
    expect(isAutoApplicableCandidate(candidate({ instrumental: true }))).toBe(false);
  });

  it('treats a missing score as no match', () => {
    const noScore = { ...candidate(), textScore: undefined };
    expect(isAutoApplicableCandidate(noScore)).toBe(false);
  });
});

describe('LRCLIB search for noisy video titles', () => {
  it('splits a cover title into song, singer, film and original artist, dropping cover words', () => {
    expect(buildSegmentQueries(VIDEO_TITLE)).toEqual([
      'Mere Samne Wali Khidki Mein',
      'Karan Nawani',
      'Padosan',
      'Kishore Kumar',
    ]);
  });

  it('puts a quoted song name first and strips "Full Song"', () => {
    const queries = buildSegmentQueries('"Kabira Full Song" Yeh Jawaani Hai Deewani | Pritam | Ranbir Kapoor, Deepika Padukone');
    expect(queries[0]).toBe('Kabira');
    expect(queries).toContain('Pritam');
    expect(queries).not.toContain('');
  });

  it('splits on spaced dashes but keeps hyphenated words together', () => {
    expect(buildSegmentQueries('Artist - Self-Control (Official Video)')).toEqual(['Artist', 'Self-Control']);
  });

  it('removes duplicates, short fragments and bracketed notes, and honours the limit', () => {
    expect(buildSegmentQueries('Song | song | A | (live) | Other | Third | Fourth | Fifth', 3)).toEqual(['Song', 'Other', 'Third']);
    expect(buildSegmentQueries('')).toEqual([]);
  });

  it('prefers the recording closer in length when none is within tolerance', () => {
    const original = candidate({ id: 1, duration: 172 });
    const clip = candidate({ id: 2, duration: 91 });
    expect(original.score).toBeGreaterThan(clip.score);
  });
});
