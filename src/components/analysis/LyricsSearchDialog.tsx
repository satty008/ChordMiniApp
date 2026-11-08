'use client';

import React, { useState } from 'react';
import { Button } from '@heroui/react';
import { HiMagnifyingGlass } from 'react-icons/hi2';
import type { LyricsServiceResponse } from '@/services/lyrics/lyricsService';
import { isAutoApplicableCandidate, type LRCLibCandidate } from '@/services/lyrics/lrclibService';
import type { AppliedLyricsInfo, UserLyricsApplyResult } from '@/services/lyrics/userLyrics';
import { LYRICS_OFFSET_STEP_SECONDS, formatLyricsOffset } from '@/utils/lyricsOffset';

interface LyricsSearchDialogProps {
  isOpen: boolean;
  query: string;
  isLoading: boolean;
  error: string | null;
  result: LyricsServiceResponse | null;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onSearch: () => void;
  onApplyCandidate: (candidate: LRCLibCandidate) => void;
  /** Lyrics currently on the grid (if any), with how they were obtained. */
  applied?: AppliedLyricsInfo | null;
  /** Timing correction in seconds; positive shows the lyrics later. */
  timingOffsetSeconds?: number;
  onTimingOffsetChange?: (deltaSeconds: number) => void;
  onTimingOffsetReset?: () => void;
  /** Paste / file upload of the user's own lyrics. */
  onApplyUserLyrics?: (text: string, filename?: string) => UserLyricsApplyResult;
  onClearLyrics?: () => void;
}

function modeLabel(mode?: string): string {
  if (mode === 'word') return 'Word sync';
  if (mode === 'line') return 'Line sync';
  return 'Plain';
}

function modeClassName(mode?: string): string {
  if (mode === 'word') return 'bg-blue-600 text-white';
  if (mode === 'line') return 'bg-emerald-600 text-white';
  return 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100';
}

function formatClock(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '?';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const NUDGES: Array<{ delta: number; label: string; aria: string }> = [
  { delta: -2 * LYRICS_OFFSET_STEP_SECONDS, label: '−1', aria: 'Show lyrics 1 second earlier' },
  { delta: -LYRICS_OFFSET_STEP_SECONDS, label: '−0.5', aria: 'Show lyrics half a second earlier' },
  { delta: LYRICS_OFFSET_STEP_SECONDS, label: '+0.5', aria: 'Show lyrics half a second later' },
  { delta: 2 * LYRICS_OFFSET_STEP_SECONDS, label: '+1', aria: 'Show lyrics 1 second later' },
];

export default function LyricsSearchDialog({
  isOpen,
  query,
  isLoading,
  error,
  result,
  onQueryChange,
  onClose,
  onSearch,
  onApplyCandidate,
  applied = null,
  timingOffsetSeconds = 0,
  onTimingOffsetChange,
  onTimingOffsetReset,
  onApplyUserLyrics,
  onClearLyrics,
}: LyricsSearchDialogProps) {
  const [pastedLyrics, setPastedLyrics] = useState('');
  const [ownLyricsError, setOwnLyricsError] = useState<string | null>(null);

  if (!isOpen) return null;

  const candidates = (result?.candidates || []).slice(0, 4);

  const submitOwnLyrics = (text: string, filename?: string) => {
    if (!onApplyUserLyrics) return;
    const outcome = onApplyUserLyrics(text, filename);
    if (outcome.ok) {
      setOwnLyricsError(null);
      setPastedLyrics('');
    } else {
      setOwnLyricsError(outcome.error);
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      submitOwnLyrics(await file.text(), file.name);
    } catch {
      setOwnLyricsError('That file could not be read.');
    } finally {
      input.value = ''; // allow choosing the same file again
    }
  };

  return (
    <div className="w-[min(92vw,380px)] space-y-3 p-3" role="dialog" aria-label="Lyrics search">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSearch();
            } else if (event.key === 'Escape') {
              onClose();
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-white/30 bg-white/70 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/45 dark:border-white/10 dark:bg-white/[0.08] dark:text-white"
          placeholder="Artist - Song"
          aria-label="Lyrics search query"
        />
        <Button
          size="sm"
          color="primary"
          isIconOnly
          isLoading={isLoading}
          isDisabled={!query.trim() || isLoading}
          onPress={onSearch}
          aria-label="Search lyrics"
        >
          {!isLoading ? <HiMagnifyingGlass className="h-4 w-4" /> : null}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/12 px-3 py-2 text-xs text-red-700 dark:text-red-200">
          {error}
        </div>
      )}

      {applied && (
        <div className="rounded-lg bg-emerald-500/12 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-100" role="status">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold">Lyrics applied</div>
              <div className="truncate" title={applied.label}>{applied.label}</div>
            </div>
            {onClearLyrics && (
              <Button size="sm" variant="light" onPress={onClearLyrics} aria-label="Remove the applied lyrics">
                Remove
              </Button>
            )}
          </div>
          {applied.approximate && (
            <p className="mt-1.5">
              Timed to a different recording (original {formatClock(applied.candidateDuration)}, this video{' '}
              {formatClock(applied.videoDuration)}). Use the timing buttons below if the lines drift.
            </p>
          )}
        </div>
      )}

      {applied?.timed && onTimingOffsetChange && (
        <div className="rounded-lg bg-white/45 p-2.5 dark:bg-white/[0.055]" role="group" aria-label="Lyrics timing">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-900 dark:text-white">Timing</span>
            <span className="tabular-nums text-slate-600 dark:text-slate-300" aria-live="polite">
              {formatLyricsOffset(timingOffsetSeconds)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {NUDGES.map((nudge) => (
              <Button
                key={nudge.label}
                size="sm"
                variant="bordered"
                className="min-w-0 flex-1 px-2"
                onPress={() => onTimingOffsetChange(nudge.delta)}
                aria-label={nudge.aria}
              >
                {nudge.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="light"
              onPress={onTimingOffsetReset}
              isDisabled={timingOffsetSeconds === 0}
              aria-label="Reset lyrics timing"
            >
              Reset
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            Minus shows the lyrics earlier, plus later (seconds).
          </p>
        </div>
      )}

      {!isLoading && candidates.length === 0 && !error && (
        <div className="rounded-lg bg-white/35 px-3 py-4 text-center text-xs text-slate-500 dark:bg-white/[0.04] dark:text-slate-400">
          Search results will appear here.
        </div>
      )}

      {candidates.length > 0 && (
        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {candidates.map((candidate, index) => (
            <div
              key={`${candidate.id}-${index}`}
              className="rounded-lg bg-white/45 p-2.5 dark:bg-white/[0.055]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {candidate.trackName || 'Unknown title'}
                  </div>
                  <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {candidate.artistName || 'Unknown artist'}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${modeClassName(candidate.lyric_mode)}`}>
                  {modeLabel(candidate.lyric_mode)}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">
                  {candidate.confidence} confidence
                  {candidate.durationDelta !== undefined ? ` · ${candidate.durationDelta.toFixed(1)}s delta` : ''}
                  {isAutoApplicableCandidate(candidate) ? ' · title match' : ''}
                </div>
                <Button
                  size="sm"
                  color={candidate.lyric_mode === 'plain' ? 'default' : 'primary'}
                  variant={candidate.lyric_mode === 'plain' ? 'bordered' : 'solid'}
                  onPress={() => onApplyCandidate(candidate)}
                >
                  {candidate.lyric_mode === 'plain' ? 'Apply Plain' : 'Apply'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {onApplyUserLyrics && (
        <details className="rounded-lg bg-white/35 p-2.5 text-xs dark:bg-white/[0.04]">
          <summary className="cursor-pointer font-semibold text-slate-900 dark:text-white">
            Use your own lyrics
          </summary>
          <div className="mt-2 space-y-2">
            <label className="block text-slate-600 dark:text-slate-300">
              Upload a .lrc or .txt file
              <input
                type="file"
                accept=".lrc,.txt,text/plain"
                onChange={handleFile}
                className="mt-1 block w-full text-xs"
              />
            </label>
            <textarea
              value={pastedLyrics}
              onChange={(event) => setPastedLyrics(event.target.value)}
              rows={5}
              placeholder="Or paste lyrics here. Lines like [01:23.45] text keep their timing."
              aria-label="Pasted lyrics"
              className="w-full rounded-lg border border-white/30 bg-white/70 p-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/45 dark:border-white/10 dark:bg-white/[0.08] dark:text-white"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Saved in this browser for this video.</span>
              <Button
                size="sm"
                color="primary"
                isDisabled={!pastedLyrics.trim()}
                onPress={() => submitOwnLyrics(pastedLyrics)}
              >
                Use these lyrics
              </Button>
            </div>
            {ownLyricsError && (
              <div className="rounded-lg bg-red-500/12 px-2 py-1.5 text-red-700 dark:text-red-200" role="alert">
                {ownLyricsError}
              </div>
            )}
          </div>
        </details>
      )}

      {result?.success && result.lyric_mode === 'plain' && (
        <div className="rounded-lg bg-amber-500/12 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          Plain lyrics will render in a separate scroll area beside the grid.
        </div>
      )}
    </div>
  );
}
