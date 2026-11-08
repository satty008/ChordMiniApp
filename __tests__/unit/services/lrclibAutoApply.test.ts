/**
 * Unit Tests: LRCLIB auto-apply rule
 *
 * A cover of a known song (title matches, duration does not) should get synced lyrics applied
 * automatically; weak or plain-only matches must be left to the manual picker.
 */

import {
  AUTO_APPLY_MIN_TEXT_SCORE,
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
    expect(cover.confidence).toBe('low'); // the old rule would have left this to a manual click
    expect(isTimedCandidate(cover)).toBe(true);
    expect(isAutoApplicableCandidate(cover)).toBe(true);
  });

  it('leaves a weak title match to the manual picker', () => {
    const weak = candidate({ trackName: 'Khidki', artistName: 'Someone Else' });
    expect(isAutoApplicableCandidate(weak)).toBe(false);
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
