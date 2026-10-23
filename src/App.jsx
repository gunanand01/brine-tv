import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import Header from './components/Header';
import CategoryBar from './components/CategoryBar';
import Player from './components/Player';
import ChannelGrid from './components/ChannelGrid';
import TagModal from './components/TagModal';
import { useLocalStorage } from './hooks/useLocalStorage';
import fallbackChannels from './data/fallbackChannels.json';
import { fetchAndMergeIndianChannels, CORE_CATEGORIES } from './utils/m3uParser';

function BrinetvDirectory() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [channels, setChannels] = useState(() =>
    fallbackChannels.map((c) => ({ ...c, source: 'curated' }))
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(
    searchParams.get('category') || 'All'
  );
  const [selectedLanguage, setSelectedLanguage] = useState('All Languages');
  const [selectedCustomTag, setSelectedCustomTag] = useState(null);

  // Persistent state in localStorage
  const [pinnedIds, setPinnedIds] = useLocalStorage('brinetv_pinned_channels', [
    'aaj-tak',
    'dd-india',
    '9xm',
  ]);
  const [hiddenIds, setHiddenIds] = useLocalStorage('brinetv_hidden_channels', []);
  const [customTags, setCustomTags] = useLocalStorage('brinetv_custom_tags', [
    { id: 'tag-morning', name: 'Morning News' },
    { id: 'tag-family', name: 'Family Favorites' },
  ]);
  const [channelTagMap, setChannelTagMap] = useLocalStorage('brinetv_channel_tags', {});
  const [activeChannelId, setActiveChannelId] = useLocalStorage(
    'brinetv_last_channel_id',
    fallbackChannels[0]?.id || 'aaj-tak'
  );

  const [tagModalState, setTagModalState] = useState({
    isOpen: false,
    targetChannel: null,
  });

  const syncPlaylist = useCallback(async () => {
    setIsRefreshing(true);
    const result = await fetchAndMergeIndianChannels();
    setChannels(result.channels);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    syncPlaylist();
  }, [syncPlaylist]);

  const handleSelectCategory = (cat) => {
    setSelectedCategory(cat);
    if (cat === 'All') {
      searchParams.delete('category');
    } else {
      searchParams.set('category', cat);
    }
    setSearchParams(searchParams, { replace: true });
  };

  const handleTogglePin = useCallback(
    (channelId) => {
      setPinnedIds((prev) =>
        prev.includes(channelId)
          ? prev.filter((id) => id !== channelId)
          : [...prev, channelId]
      );
    },
    [setPinnedIds]
  );

  // Report Broken -> Hide channel in localStorage
  const handleReportBroken = useCallback(
    (channelId) => {
      setHiddenIds((prev) => (prev.includes(channelId) ? prev : [...prev, channelId]));
    },
    [setHiddenIds]
  );

  const handleCreateTag = useCallback(
    (name) => {
      const newTag = { id: `tag-${Date.now()}`, name };
      setCustomTags((prev) => [...prev, newTag]);
      return newTag;
    },
    [setCustomTags]
  );

  const handleDeleteTag = useCallback(
    (tagId) => {
      setCustomTags((prev) => prev.filter((t) => t.id !== tagId));
      if (selectedCustomTag === tagId) setSelectedCustomTag(null);
    },
    [setCustomTags, selectedCustomTag]
  );

  const handleToggleChannelTag = useCallback(
    (channelId, tagId) => {
      setChannelTagMap((prev) => {
        const current = prev[channelId] || [];
        const updated = current.includes(tagId)
          ? current.filter((id) => id !== tagId)
          : [...current, tagId];
        return { ...prev, [channelId]: updated };
      });
    },
    [setChannelTagMap]
  );

  // Exclude reported/hidden channels
  const activeChannelsPool = useMemo(
    () => channels.filter((c) => !hiddenIds.includes(c.id)),
    [channels, hiddenIds]
  );

  const categoryCounts = useMemo(() => {
    const counts = {
      All: activeChannelsPool.length,
      Pinned: activeChannelsPool.filter((c) => pinnedIds.includes(c.id)).length,
    };
    CORE_CATEGORIES.forEach((cat) => {
      if (cat !== 'All' && cat !== 'Pinned') {
        counts[cat] = activeChannelsPool.filter(
          (c) =>
            c.category === cat ||
            (cat === 'Regional' && !['Hindi', 'English'].includes(c.language))
        ).length;
      }
    });
    return counts;
  }, [activeChannelsPool, pinnedIds]);

  const filteredChannels = useMemo(() => {
    return activeChannelsPool.filter((ch) => {
      if (selectedCustomTag) {
        const tagsForChannel = channelTagMap[ch.id] || [];
        if (!tagsForChannel.includes(selectedCustomTag)) return false;
      } else if (selectedCategory === 'Pinned') {
        if (!pinnedIds.includes(ch.id)) return false;
      } else if (selectedCategory === 'Regional') {
        if (ch.category !== 'Regional' && ['Hindi', 'English'].includes(ch.language)) {
          return false;
        }
      } else if (selectedCategory !== 'All') {
        if (ch.category !== selectedCategory) return false;
      }

      if (selectedLanguage !== 'All Languages' && ch.language !== selectedLanguage) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = ch.name?.toLowerCase().includes(q);
        const matchLang = ch.language?.toLowerCase().includes(q);
        const matchCat = ch.category?.toLowerCase().includes(q);
        if (!matchName && !matchLang && !matchCat) return false;
      }

      return true;
    });
  }, [
    activeChannelsPool,
    selectedCategory,
    selectedLanguage,
    selectedCustomTag,
    searchQuery,
    pinnedIds,
    channelTagMap,
  ]);

  const activeChannel = useMemo(
    () =>
      activeChannelsPool.find((c) => c.id === activeChannelId) ||
      filteredChannels[0] ||
      activeChannelsPool[0],
    [activeChannelsPool, filteredChannels, activeChannelId]
  );

  const handleSelectNextChannel = useCallback(() => {
    const list = filteredChannels.length > 0 ? filteredChannels : activeChannelsPool;
    if (list.length === 0) return;
    const idx = list.findIndex((c) => c.id === activeChannel?.id);
    const next = list[(idx + 1) % list.length];
    if (next) setActiveChannelId(next.id);
  }, [filteredChannels, activeChannelsPool, activeChannel, setActiveChannelId]);

  return (
    <div className="min-h-screen bg-[#090B10] text-slate-100 flex flex-col">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRefreshPlaylist={syncPlaylist}
        isRefreshing={isRefreshing}
        onOpenTagManager={() =>
          setTagModalState({ isOpen: true, targetChannel: null })
        }
      />

      <main className="max-w-6xl w-full mx-auto px-3 sm:px-5 py-3.5 space-y-4 flex-1">
        <Player
          channel={activeChannel}
          isPinned={pinnedIds.includes(activeChannel?.id)}
          onTogglePin={handleTogglePin}
          onSelectNextChannel={handleSelectNextChannel}
        />

        <CategoryBar
          selectedCategory={selectedCategory}
          onSelectCategory={handleSelectCategory}
          selectedLanguage={selectedLanguage}
          onSelectLanguage={setSelectedLanguage}
          categoryCounts={categoryCounts}
          customTags={customTags}
          selectedCustomTag={selectedCustomTag}
          onSelectCustomTag={setSelectedCustomTag}
          onOpenNewTagModal={() =>
            setTagModalState({ isOpen: true, targetChannel: null })
          }
        />

        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs sm:text-sm font-bold text-slate-300">
            {selectedCustomTag
              ? `#${customTags.find((t) => t.id === selectedCustomTag)?.name || 'Tagged'}`
              : selectedCategory === 'All'
              ? 'All Channels'
              : `${selectedCategory}`}{' '}
            <span className="text-slate-500 font-mono">({filteredChannels.length})</span>
          </h2>

          {hiddenIds.length > 0 && (
            <button
              type="button"
              onClick={() => setHiddenIds([])}
              className="text-[11px] text-slate-400 hover:text-orange-400 underline"
            >
              Restore {hiddenIds.length} hidden
            </button>
          )}
        </div>

        <ChannelGrid
          channels={filteredChannels}
          activeChannelId={activeChannel?.id}
          pinnedIds={pinnedIds}
          customTags={customTags}
          channelTagMap={channelTagMap}
          onSelectChannel={(ch) => {
            setActiveChannelId(ch.id);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onTogglePin={handleTogglePin}
          onReportBroken={handleReportBroken}
          onOpenTagModal={(ch) =>
            setTagModalState({ isOpen: true, targetChannel: ch })
          }
          onResetFilters={() => {
            setSearchQuery('');
            handleSelectCategory('All');
            setSelectedLanguage('All Languages');
            setSelectedCustomTag(null);
          }}
        />
      </main>

      <TagModal
        isOpen={tagModalState.isOpen}
        onClose={() => setTagModalState({ isOpen: false, targetChannel: null })}
        targetChannel={tagModalState.targetChannel}
        customTags={customTags}
        channelTagMap={channelTagMap}
        onCreateTag={handleCreateTag}
        onDeleteTag={handleDeleteTag}
        onToggleChannelTag={handleToggleChannelTag}
      />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<BrinetvDirectory />} />
      </Routes>
    </BrowserRouter>
  );
}
