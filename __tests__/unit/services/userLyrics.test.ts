/**
 * Unit Tests: userLyrics
 *
 * Parsing of pasted / uploaded lyrics (.lrc or plain text) and the browser-side persistence helpers.
 */

import {
  clearUserLyrics,
  loadLyricsOffset,
  loadUserLyrics,
  parseUserLyrics,
  saveLyricsOffset,
  saveUserLyrics,
} from '@/services/lyrics/userLyrics';

describe('parseUserLyrics', () => {
  it('turns [mm:ss.xx] lines into synced lyrics, each line ending where the next begins', () => {
    const result = parseUserLyrics('[00:10.00]Hello\n[00:14.50]World', 200);
    expect(result.kind).toBe('timed');
    if (result.kind !== 'timed') return;
    expect(result.lyrics.lines).toEqual([
      { startTime: 10, endTime: 14.5, text: 'Hello', chords: [] },
      { startTime: 14.5, endTime: 200, text: 'World', chords: [] },
    ]);
    expect(result.lineCount).toBe(2);
  });

  it('gives the last line a short default length when the song duration is unknown', () => {
    const result = parseUserLyrics('[00:10.00]a\n[00:12.00]b');
    expect(result.kind === 'timed' && result.lyrics.lines[1].endTime).toBe(16);
  });

  it('reads one, two and three digit fractions as tenths, hundredths and milliseconds', () => {
    const times = ['[01:02.5]x', '[01:02.50]x', '[01:02.500]x', '[01:02]x'].map((line) => {
      const parsed = parseUserLyrics(`${line}\n[09:00.00]end`);
      return parsed.kind === 'timed' ? parsed.lyrics.lines[0].startTime : -1;
    });
    expect(times).toEqual([62.5, 62.5, 62.5, 62]);
  });

  it('accepts several timestamps on one line and sorts the result', () => {
    const result = parseUserLyrics('[00:50.00][00:10.00]Chorus\n[00:30.00]Verse');
    expect(result.kind).toBe('timed');
    if (result.kind !== 'timed') return;
    expect(result.lyrics.lines.map((l) => [l.startTime, l.text])).toEqual([
      [10, 'Chorus'],
      [30, 'Verse'],
      [50, 'Chorus'],
    ]);
  });

  it('strips enhanced-LRC word tags and ignores metadata tags', () => {
    const result = parseUserLyrics('[ar:Someone]\n[ti:Song]\n[offset:+300]\n[00:01.00]<00:01.00>Hel<00:01.50>lo\n[00:03.00]bye');
    expect(result.kind).toBe('timed');
    if (result.kind !== 'timed') return;
    expect(result.lyrics.lines.map((l) => l.text)).toEqual(['Hello', 'bye']);
  });

  it('handles a BOM and Windows line endings', () => {
    const result = parseUserLyrics('﻿[00:01.00]a\r\n[00:02.00]b\r\n');
    expect(result.kind).toBe('timed');
  });

  it('keeps non-Latin lyrics intact', () => {
    const result = parseUserLyrics('[00:05.00]മെല്ലെ മെല്ലെ\n[00:09.00]मेरे सामने वाली');
    expect(result.kind === 'timed' && result.lyrics.lines.map((l) => l.text)).toEqual(['മെല്ലെ മെല്ലെ', 'मेरे सामने वाली']);
  });

  it('treats text without timestamps as plain lyrics', () => {
    const result = parseUserLyrics('line one\nline two\n\n\n\nline three');
    expect(result).toEqual({ kind: 'plain', text: 'line one\nline two\n\nline three' });
  });

  it('treats a single timestamp as plain, keeping the text', () => {
    const result = parseUserLyrics('[00:10.00]only one');
    expect(result).toEqual({ kind: 'plain', text: 'only one' });
  });

  it('reports empty input and metadata-only input as empty', () => {
    expect(parseUserLyrics('')).toEqual({ kind: 'empty' });
    expect(parseUserLyrics('   \n  ')).toEqual({ kind: 'empty' });
    expect(parseUserLyrics('[ar:A]\n[ti:B]')).toEqual({ kind: 'empty' });
  });
});

describe('browser persistence', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips user lyrics per video', () => {
    saveUserLyrics('abc', { text: '[00:01.00]a\n[00:02.00]b', filename: 'song.lrc' });
    expect(loadUserLyrics('abc')).toEqual({ text: '[00:01.00]a\n[00:02.00]b', filename: 'song.lrc' });
    expect(loadUserLyrics('other')).toBeNull();
    clearUserLyrics('abc');
    expect(loadUserLyrics('abc')).toBeNull();
  });

  it('ignores corrupted stored data', () => {
    window.localStorage.setItem('chordmini.userLyrics.v1.abc', '{not json');
    expect(loadUserLyrics('abc')).toBeNull();
  });

  it('stores timing offsets per video and source, and drops zero', () => {
    expect(loadLyricsOffset('abc', 'user')).toBe(0);
    saveLyricsOffset('abc', 'user', 1.5);
    saveLyricsOffset('abc', 'lrclib-7', -2);
    expect(loadLyricsOffset('abc', 'user')).toBe(1.5);
    expect(loadLyricsOffset('abc', 'lrclib-7')).toBe(-2);
    saveLyricsOffset('abc', 'user', 0);
    expect(loadLyricsOffset('abc', 'user')).toBe(0);
    expect(window.localStorage.getItem('chordmini.lyricsOffset.v1.abc.user')).toBeNull();
  });

  it('survives storage that throws', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveUserLyrics('abc', { text: 'x' })).not.toThrow();
    expect(() => saveLyricsOffset('abc', 'user', 1)).not.toThrow();
    spy.mockRestore();
  });
});
