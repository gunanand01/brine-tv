import React from 'react';
import { Search, X, RefreshCw, Tv, Tag } from 'lucide-react';

/**
 * Strictly Mobile-First Famelack-Style Header:
 * Left: Compact Brinetv Logo
 * Center: Search Bar
 * Right: Only small 'Tags' and 'Refresh' icon buttons to save mobile screen space.
 */
export default function Header({
  searchQuery,
  onSearchChange,
  onRefreshPlaylist,
  isRefreshing,
  onOpenTagManager,
}) {
  return (
    <header className="sticky top-0 z-30 bg-[#090B10]/95 backdrop-blur-md border-b border-slate-800/80">
      <div className="max-w-6xl mx-auto px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2 sm:gap-3">
        {/* Left: Brinetv Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 p-[1.5px] shadow-md shadow-orange-500/20">
            <div className="w-full h-full bg-[#0B0F19] rounded-[10px] flex items-center justify-center">
              <Tv className="w-4 h-4 text-orange-400" />
            </div>
          </div>
          <span className="text-base sm:text-lg font-extrabold tracking-tight text-white">
            Brine<span className="text-orange-400">tv</span>
          </span>
        </div>

        {/* Center: Compact Mobile-First Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search channels..."
            className="w-full bg-[#121722] focus:bg-[#161C2B] text-xs sm:text-sm text-white placeholder-slate-500 pl-8 pr-7 py-2 rounded-xl border border-slate-800/90 focus:border-orange-500/70 focus:outline-none transition-all"
            aria-label="Search channels"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right: Small 'Tags' and 'Refresh' Icons Only */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenTagManager}
            className="w-8 h-8 rounded-xl bg-[#121722] hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-400 flex items-center justify-center transition-colors"
            title="Custom Tags"
            aria-label="Manage Custom Tags"
          >
            <Tag className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onRefreshPlaylist}
            disabled={isRefreshing}
            className="w-8 h-8 rounded-xl bg-[#121722] hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-orange-400 flex items-center justify-center transition-colors disabled:opacity-50"
            title="Refresh Channels"
            aria-label="Refresh Channels"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-orange-400' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
