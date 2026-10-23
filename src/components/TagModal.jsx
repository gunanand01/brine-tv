import React, { useState } from 'react';
import { X, Tag, Plus, Trash2, Check } from 'lucide-react';

/**
 * Modal for creating custom category tags/labels and assigning them to channels.
 * All custom tags and channel-tag assignments are saved in localStorage.
 */
export default function TagModal({
  isOpen,
  onClose,
  targetChannel, // Optional channel to assign tags to; if null, acts as global tag manager
  customTags = [],
  channelTagMap = {},
  onCreateTag,
  onDeleteTag,
  onToggleChannelTag,
}) {
  const [newTagName, setNewTagName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const assignedIds = targetChannel ? channelTagMap[targetChannel.id] || [] : [];

  const handleCreate = (e) => {
    e.preventDefault();
    const trimmed = newTagName.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a tag name.');
      return;
    }
    if (customTags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
      setErrorMsg('A tag with this name already exists.');
      return;
    }
    const created = onCreateTag(trimmed);
    if (targetChannel && created?.id) {
      onToggleChannelTag(targetChannel.id, created.id);
    }
    setNewTagName('');
    setErrorMsg('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121723] border border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-cyan-400" />
            <h3 className="text-base font-bold text-white">
              {targetChannel
                ? `Custom Tags for ${targetChannel.name}`
                : 'Manage Custom Category Tags'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Create New Tag Form */}
        <form onSubmit={handleCreate} className="mt-4">
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Create New Custom Tag / Label
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => {
                setNewTagName(e.target.value);
                setErrorMsg('');
              }}
              placeholder="e.g. Morning News, Cricket Live, Family HD..."
              className="flex-1 bg-[#0B0E17] text-xs text-white placeholder-slate-500 px-3 py-2 rounded-xl border border-slate-800 focus:border-cyan-500 focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create</span>
            </button>
          </div>
          {errorMsg && <p className="text-[11px] text-red-400 mt-1">{errorMsg}</p>}
        </form>

        {/* Existing Custom Tags List */}
        <div className="mt-5">
          <span className="block text-xs font-semibold text-slate-300 mb-2">
            {targetChannel
              ? 'Click a tag to toggle it on this channel:'
              : 'Your Saved Custom Tags (stored in localStorage):'}
          </span>

          {customTags.length === 0 ? (
            <p className="text-xs text-slate-500 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 text-center">
              No custom tags yet. Create one above to organize your favorite Indian channels!
            </p>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {customTags.map((tag) => {
                const isAssigned = assignedIds.includes(tag.id);
                return (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between gap-2 bg-[#0B0E17] border border-slate-800/90 rounded-xl px-3 py-2"
                  >
                    {targetChannel ? (
                      <button
                        type="button"
                        onClick={() => onToggleChannelTag(targetChannel.id, tag.id)}
                        className="flex items-center gap-2 text-xs font-medium text-left flex-1"
                      >
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center border ${
                            isAssigned
                              ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                              : 'border-slate-700 bg-slate-900'
                          }`}
                        >
                          {isAssigned && <Check className="w-3 h-3 stroke-[3]" />}
                        </span>
                        <span className={isAssigned ? 'text-cyan-300 font-semibold' : 'text-slate-200'}>
                          {tag.name}
                        </span>
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-cyan-300">
                        #{tag.name}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => onDeleteTag(tag.id)}
                      className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                      title="Delete custom tag"
                      aria-label={`Delete tag ${tag.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-5 pt-3 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
