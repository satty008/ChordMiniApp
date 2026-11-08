/**
 * Lyrics supplied by the user (pasted text or a .lrc / .txt file), plus the small browser-side
 * persistence used for them and for per-song timing offsets.
 */

import type { LyricsData } from '@/types/musicAiTypes';

export type UserLyricsParseResult =
  | { kind: 'timed'; lyrics: LyricsData; lineCount: number }
  | { kind: 'plain'; text: string }
  | { kind: 'empty' };

export type UserLyricsApplyResult =
  | { ok: true; kind: 'timed' | 'plain' }
  | { ok: false; error: string };

/** Describes the lyrics currently applied to the grid, for the lyrics dialog. */
export interface AppliedLyricsInfo {
  source: 'lrclib' | 'user';
  /** Stable key used to remember the timing offset chosen for this source. */
  sourceKey: string;
  /** "Title — Artist", a file name, or "Pasted lyrics". */
  label: string;
  /** False for plain (untimed) lyrics: there is nothing to shift. */
  timed: boolean;
  /** Timed to a different recording than the video (duration differs noticeably). */
  approximate?: boolean;
  candidateDuration?: number;
  videoDuration?: number;
}

/** Larger inputs are refused: lyrics are small, and this also bounds what we keep in localStorage. */
export const MAX_USER_LYRICS_CHARS = 200_000;

const TIMESTAMP_SOURCE = String.raw`\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]`;
const LEADING_TIMESTAMPS = new RegExp(String.raw`^\s*(?<stamps>(?:${TIMESTAMP_SOURCE})+)(?<lyric>.*)$`);
const ENHANCED_WORD_TAG = /<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g;
// [ar:Artist] [ti:Title] [offset:+300] ... Metadata is ignored; the timing buttons cover any offset.
const METADATA_TAG = /^\s*\[[A-Za-z#]+:[^\]]*\]\s*$/;

/** "1:23.45" -> 83.45. A one-digit fraction is tenths, two digits hundredths, three digits milliseconds. */
function toSeconds(minutes: string, seconds: string, fraction?: string): number {
  const fractionSeconds = fraction ? parseInt(fraction.padEnd(3, '0').slice(0, 3), 10) / 1000 : 0;
  return parseInt(minutes, 10) * 60 + parseInt(seconds, 10) + fractionSeconds;
}

/**
 * Turn pasted text or the contents of a .lrc/.txt file into lyrics.
 *
 * - Two or more `[mm:ss.xx]` lines make synced (line mode) lyrics. A line may carry several
 *   timestamps (`[00:10.00][00:50.00]Chorus`), and enhanced-LRC word tags (`<00:10.50>`) are stripped.
 * - Anything else is treated as plain lyrics.
 */
export function parseUserLyrics(raw: string, totalDuration?: number): UserLyricsParseResult {
  const text = (raw || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');

  const entries: Array<{ time: number; text: string }> = [];
  const plainLines: string[] = [];

  for (const line of text.split('\n')) {
    const match = line.match(LEADING_TIMESTAMPS);
    if (match) {
      const lyric = (match.groups?.lyric ?? '').replace(ENHANCED_WORD_TAG, '').replace(/\s+/g, ' ').trim();
      for (const stamp of (match.groups?.stamps ?? '').matchAll(new RegExp(TIMESTAMP_SOURCE, 'g'))) {
        entries.push({ time: toSeconds(stamp[1], stamp[2], stamp[3]), text: lyric });
      }
      plainLines.push(lyric);
      continue;
    }
    if (METADATA_TAG.test(line)) continue;
    plainLines.push(line.trimEnd());
  }

  if (entries.length >= 2) {
    entries.sort((a, b) => a.time - b.time);
    const lines = entries.map((entry, index) => {
      const next = entries[index + 1];
      const fallbackEnd = totalDuration && totalDuration > entry.time ? totalDuration : entry.time + 4;
      return {
        startTime: entry.time,
        endTime: next ? next.time : fallbackEnd,
        text: entry.text,
        chords: [],
      };
    });
    return { kind: 'timed', lyrics: { lines }, lineCount: entries.filter((entry) => entry.text).length };
  }

  const plain = plainLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return plain ? { kind: 'plain', text: plain } : { kind: 'empty' };
}

// ---- browser persistence (best effort: storage can be missing, full or blocked) ----

const userLyricsKey = (videoId: string) => `chordmini.userLyrics.v1.${videoId}`;
const offsetKey = (videoId: string, sourceKey: string) => `chordmini.lyricsOffset.v1.${videoId}.${sourceKey}`;

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadUserLyrics(videoId: string): { text: string; filename?: string } | null {
  try {
    const stored = storage()?.getItem(userLyricsKey(videoId));
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { text?: unknown; filename?: unknown };
    if (typeof parsed.text !== 'string' || !parsed.text) return null;
    return { text: parsed.text, filename: typeof parsed.filename === 'string' ? parsed.filename : undefined };
  } catch {
    return null;
  }
}

export function saveUserLyrics(videoId: string, payload: { text: string; filename?: string }): void {
  try {
    storage()?.setItem(userLyricsKey(videoId), JSON.stringify(payload));
  } catch {
    // Quota or privacy mode: the lyrics still work for this visit.
  }
}

export function clearUserLyrics(videoId: string): void {
  try {
    storage()?.removeItem(userLyricsKey(videoId));
  } catch {
    // ignore
  }
}

export function loadLyricsOffset(videoId: string, sourceKey: string): number {
  try {
    const value = Number(storage()?.getItem(offsetKey(videoId, sourceKey)));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function saveLyricsOffset(videoId: string, sourceKey: string, seconds: number): void {
  try {
    const store = storage();
    if (!store) return;
    if (seconds === 0) store.removeItem(offsetKey(videoId, sourceKey));
    else store.setItem(offsetKey(videoId, sourceKey), String(seconds));
  } catch {
    // ignore
  }
}
