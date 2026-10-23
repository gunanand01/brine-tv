import React, { useState } from 'react';
import { Pin, MoreVertical, EyeOff, Tag } from 'lucide-react';
import { getChannelInitials } from '../utils/m3uParser';

/**
 * Mobile-First Famelack-style Channel Card:
 * - Corner Pin (📌) icon + 3-dots menu ('Report Broken' to hide channel, 'Add/Edit Tags')
 * - Channel Logo with automatic 2-letter Initials fallback (e.g. 'AT' for 'Aaj Tak')
 * - Channel Name & small Category tag
 */
export default function ChannelCard({
  channel,
  isActive,
  isPinned,
  channelTags = [],
  onSelectChannel,
  onTogglePin,
  onReportBroken,
  onOpenTagModal,
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = getChannelInitials(channel.name);

  return (
    <div
      onClick={() => onSelectChannel(channel)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectChannel(channel);
        }
      }}
      onMouseLeave={() => setMenuOpen(false)}
      className={`group relative rounded-2xl p-3 transition-all cursor-pointer border flex flex-col justify-between ${
        isActive
          ? 'bg-[#182032] border-orange-500/80 ring-1 ring-orange-500/40 shadow-md'
          : 'bg-[#121722] hover:bg-[#161D2B] border-slate-800/80 hover:border-slate-700'
      }`}
    >
      {/* Top Row: Channel Logo / 2-Letter Initials + Corner Pin (📌) & 3-Dots Menu */}
      <div className="flex items-start justify-between gap-1.5 mb-2.5">
        <div className="relative w-11 h-11 rounded-xl bg-[#0B0E17] border border-slate-800/90 flex items-center justify-center p-1.5 overflow-hidden shrink-0">
          {channel.logo && !logoFailed ? (
            <img
              src={channel.logo}
              alt={channel.name}
              loading="lazy"
              className="w-full h-full object-contain"
              onLoad={(e) => {
                if (e.currentTarget.naturalWidth < 4) setLogoFailed(true);
              }}
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <span className="text-xs font-extrabold tracking-wider text-orange-400 select-none">
              {initials}
            </span>
          )}
        </div>

        {/* Corner Pin Icon + 3-Dots Menu */}
        <div className="flex items-center gap-1 relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(channel.id);
            }}
            className={`p-1.5 rounded-lg border transition-colors ${
              isPinned
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-orange-300 border-slate-800/80'
            }`}
            title={isPinned ? 'Unpin' : 'Pin channel'}
            aria-label={isPinned ? `Unpin ${channel.name}` : `Pin ${channel.name}`}
          >
            <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-orange-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
            className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800/80 transition-colors"
            title="Channel options"
            aria-label="Channel options"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {/* 3-Dots Dropdown Menu with 'Report Broken' */}
          {menuOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-8 z-20 w-40 bg-[#0D111A] border border-slate-700 rounded-xl shadow-xl py-1 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenTagModal(channel);
                }}
                className="w-full px-3 py-2 text-left text-[11px] font-medium text-slate-200 hover:bg-slate-800 flex items-center gap-2"
              >
                <Tag className="w-3.5 h-3.5 text-cyan-400" />
                <span>Custom Tags</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  if (onReportBroken) onReportBroken(channel.id);
                }}
                className="w-full px-3 py-2 text-left text-[11px] font-medium text-red-400 hover:bg-red-500/10 flex items-center gap-2"
              >
                <EyeOff className="w-3.5 h-3.5 text-red-400" />
                <span>Report Broken</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Channel Name */}
      <h3 className="text-xs sm:text-sm font-bold text-slate-100 group-hover:text-white truncate">
        {channel.name}
      </h3>

      {/* Small Category Tag + Custom Tags */}
      <div className="mt-2 flex items-center gap-1 flex-wrap">
        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800/90 text-slate-300 border border-slate-700/60">
          {channel.category}
        </span>
        {channel.language && channel.language !== 'Hindi' && (
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-900 text-slate-400">
            {channel.language}
          </span>
        )}
        {channelTags.slice(0, 1).map((t) => (
          <span
            key={t.id}
            className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-cyan-500/15 text-cyan-300"
          >
            #{t.name}
          </span>
        ))}
      </div>
    </div>
  );
}
