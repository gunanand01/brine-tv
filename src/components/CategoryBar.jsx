import React from 'react';
import {
  Newspaper,
  Tv,
  Trophy,
  Film,
  Music,
  Baby,
  Flame,
  Languages,
  Pin,
  LayoutGrid,
  Tag,
  Plus,
} from 'lucide-react';
import { CORE_CATEGORIES, INDIAN_LANGUAGES } from '../utils/m3uParser';

const CATEGORY_ICONS = {
  All: LayoutGrid,
  Pinned: Pin,
  News: Newspaper,
  Entertainment: Tv,
  Sports: Trophy,
  Movies: Film,
  Music: Music,
  Kids: Baby,
  Devotional: Flame,
  Regional: Languages,
};

/**
 * Horizontal scrollable category filter bar + custom user tags + regional language filter.
 */
export default function CategoryBar({
  selectedCategory,
  onSelectCategory,
  selectedLanguage,
  onSelectLanguage,
  categoryCounts = {},
  customTags = [],
  selectedCustomTag,
  onSelectCustomTag,
  onOpenNewTagModal,
}) {
  return (
    <div className="space-y-2.5">
      {/* Primary Categories + User Custom Category Tags */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar">
        {CORE_CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICONS[category] || Tv;
          const isActive = selectedCategory === category && !selectedCustomTag;
          const count = categoryCounts[category] ?? 0;

          return (
            <button
              key={category}
              type="button"
              onClick={() => {
                onSelectCustomTag(null);
                onSelectCategory(category);
              }}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                isActive
                  ? 'bg-orange-500 text-slate-950 border-orange-400 shadow-md shadow-orange-500/20'
                  : 'bg-[#121723] hover:bg-[#192030] text-slate-300 border-slate-800/90'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{category}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                  isActive
                    ? 'bg-slate-950/20 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}

        {/* Divider if custom tags exist */}
        <div className="h-5 w-[1px] bg-slate-800 shrink-0 mx-1" />

        {/* User-Created Custom Category Tags */}
        {customTags.map((tag) => {
          const isTagActive = selectedCustomTag === tag.id;
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() =>
                onSelectCustomTag(isTagActive ? null : tag.id)
              }
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                isTagActive
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/20'
                  : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
              }`}
            >
              <Tag className="w-3 h-3 shrink-0" />
              <span>{tag.name}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenNewTagModal}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-dashed border-slate-700 transition-all"
          title="Create a custom category tag/label"
        >
          <Plus className="w-3.5 h-3.5 text-cyan-400" />
          <span>New Tag</span>
        </button>
      </div>

      {/* Regional Language Sub-Filter Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1 shrink-0">
          Language:
        </span>
        {INDIAN_LANGUAGES.map((lang) => {
          const isActive = selectedLanguage === lang;
          return (
            <button
              key={lang}
              type="button"
              onClick={() => onSelectLanguage(lang)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                  : 'bg-slate-900/70 hover:bg-slate-800/80 text-slate-400 border border-slate-800/70'
              }`}
            >
              {lang}
            </button>
          );
        })}
      </div>
    </div>
  );
}
