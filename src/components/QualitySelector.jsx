import React from 'react';
import { Loader2, SlidersHorizontal } from 'lucide-react';

/**
 * Standard resolution tiers supported by Brinetv's HLS Quality Selector.
 */
export const STANDARD_QUALITY_TIERS = ['144p', '240p', '360p', '480p', '720p', '1080p'];

/**
 * Maps an hls.js level object ({ height, width, bitrate }) to one of the
 * 6 standard resolution tiers: 144p, 240p, 360p, 480p, 720p, 1080p.
 */
export function resolveQualityTierLabel(level) {
  const height = Number(level?.height) || 0;
  const bitrate = Number(level?.bitrate) || 0;

  if (height > 0) {
    if (height >= 960) return '1080p';
    if (height >= 640) return '720p';
    if (height >= 420) return '480p';
    if (height >= 300) return '360p';
    if (height >= 200) return '240p';
    return '144p';
  }

  if (bitrate > 0) {
    if (bitrate >= 3800000) return '1080p';
    if (bitrate >= 1900000) return '720p';
    if (bitrate >= 950000) return '480p';
    if (bitrate >= 500000) return '360p';
    if (bitrate >= 260000) return '240p';
    return '144p';
  }

  return '360p';
}

/**
 * Mobile-First HLS Quality Selector.
 *
 * Rules:
 * - If stream has multiple qualities (from 144p, 240p, 360p, 480p, 720p, 1080p), shows Auto + available buttons.
 * - Mobile screens automatically start in Auto mode.
 * - If stream supports only a single quality (e.g. 144p or single variant), shows ONLY that active button
 *   (hides/disables others) and displays simple text: 'Source is low quality' instead of error messages.
 */
export default function QualitySelector({
  availableQualities = [], // Array of { label: '720p', levelIndex: 2, height: 720 }
  selectedQuality = 'Auto',
  activeAutoLabel = null,
  isSwitchingLevel = false,
  isSingleOrLowQuality = false,
  onSelectQuality,
}) {
  const hasMultipleQualities = availableQualities.length > 1;
  const singleQualityLabel =
    availableQualities.length === 1 ? availableQualities[0].label : activeAutoLabel || 'Auto';

  return (
    <div className="bg-[#10141F] border-t border-slate-800/80 px-3 py-2 sm:px-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Left Label & Status */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
            <SlidersHorizontal className="w-3.5 h-3.5 text-orange-400 shrink-0" />
            <span>Quality</span>
          </div>

          {isSwitchingLevel && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Switching...</span>
            </span>
          )}

          {(!hasMultipleQualities || isSingleOrLowQuality) && (
            <span className="text-[11px] text-slate-400 font-medium">
              Source is low quality
            </span>
          )}
        </div>

        {/* Right: Quality Buttons */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          {!hasMultipleQualities ? (
            /* Single quality stream: show ONLY that active button, hide/disable others */
            <button
              type="button"
              disabled
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-orange-500 text-slate-950 shadow-sm cursor-default"
            >
              {singleQualityLabel}
            </button>
          ) : (
            /* Multi-quality stream: show Auto + available qualities from 144p to 1080p */
            <>
              <button
                type="button"
                onClick={() => onSelectQuality('Auto', -1)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
                  selectedQuality === 'Auto'
                    ? 'bg-orange-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-[#171D2B] hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                <span>Auto</span>{selectedQuality === 'Auto' && activeAutoLabel ? <span className="ml-1 opacity-80">({activeAutoLabel})</span> : null}
              </button>

              {availableQualities.map((q) => {
                const isSelected = selectedQuality === q.label;
                return (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => onSelectQuality(q.label, q.levelIndex)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
                      isSelected
                        ? 'bg-orange-500 text-slate-950 font-bold shadow-sm'
                        : 'bg-[#171D2B] hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    {q.label}
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
