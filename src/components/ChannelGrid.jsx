import React, { useState, useEffect, useRef } from 'react';
import { Tv, RotateCcw, Loader2 } from 'lucide-react';
import ChannelCard from './ChannelCard';

const INITIAL_LOAD_COUNT = 24;
const LOAD_MORE_STEP = 20;

/**
 * Mobile-First Channel Grid with Infinite Scroll (Lazy Loading):
 * - Mobile: 2 columns (`grid-cols-2`)
 * - Desktop: 4 to 5 columns (`md:grid-cols-4 xl:grid-cols-5`)
 * - Renders only the first 24 channels on open, then automatically loads
 *   the next 20 channels as the user scrolls down.
 */
export default function ChannelGrid({
  channels = [],
  activeChannelId,
  pinnedIds = [],
  customTags = [],
  channelTagMap = {},
  onSelectChannel,
  onTogglePin,
  onReportBroken,
  onOpenTagModal,
  onResetFilters,
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_LOAD_COUNT);
  const loaderRef = useRef(null);

  // Reset visible slice to 24 whenever filtered channel list changes
  useEffect(() => {
    setVisibleCount(INITIAL_LOAD_COUNT);
  }, [channels]);

  // Infinite scroll observer: load +20 channels when user scrolls near the bottom
  useEffect(() => {
    const sentinel = loaderRef.current;
    if (!sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first && first.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + LOAD_MORE_STEP, channels.length));
        }
      },
      { rootMargin: '220px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [channels.length]);

  if (channels.length === 0) {
    return (
      <div className="bg-[#121722] border border-slate-800/90 rounded-2xl p-8 text-center my-3">
        <div className="w-10 h-10 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-2.5">
          <Tv className="w-5 h-5 text-slate-400" />
        </div>
        <h3 className="text-sm font-bold text-white">No channels found</h3>
        <button
          type="button"
          onClick={onResetFilters}
          className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-slate-950"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Filters</span>
        </button>
      </div>
    );
  }

  const visibleChannels = channels.slice(0, visibleCount);
  const hasMore = visibleCount < channels.length;

  return (
    <div>
      {/* 2-Column Mobile Grid -> 4-5 Column Desktop Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3.5">
        {visibleChannels.map((channel) => {
          const assignedTagIds = channelTagMap[channel.id] || [];
          const resolvedTags = customTags.filter((t) => assignedTagIds.includes(t.id));

          return (
            <ChannelCard
              key={channel.id}
              channel={channel}
              isActive={activeChannelId === channel.id}
              isPinned={pinnedIds.includes(channel.id)}
              channelTags={resolvedTags}
              onSelectChannel={onSelectChannel}
              onTogglePin={onTogglePin}
              onReportBroken={onReportBroken}
              onOpenTagModal={onOpenTagModal}
            />
          );
        })}
      </div>

      {/* Infinite Scroll Sentinel */}
      {hasMore && (
        <div
          ref={loaderRef}
          className="py-6 flex items-center justify-center gap-2 text-xs text-slate-400"
        >
          <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
          <span>
            Loading more channels ({visibleChannels.length} of {channels.length})...
          </span>
        </div>
      )}
    </div>
  );
}
