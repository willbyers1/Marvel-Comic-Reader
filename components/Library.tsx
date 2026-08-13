'use client';

import React, { useState } from 'react';
import { Comic, ReadingProgress, Collection } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { ComicCard } from './ComicCard';
import {
  BookOpen,
  Plus,
  Sparkles,
  FolderPlus,
  Tag,
  AlertTriangle,
} from 'lucide-react';

interface LibraryProps {
  comics: { comic: Comic; progress?: ReadingProgress }[];
  collections: Collection[];
  onDeleteComic: (id: string) => void;
  onToggleCollection: (colId: string, comicId: string) => void;
  onCreateCollection: (name: string) => void;
  onLoadSamples: () => void;
  isSeeding: boolean;
}

export const Library: React.FC<LibraryProps> = ({
  comics,
  collections,
  onDeleteComic,
  onToggleCollection,
  onCreateCollection,
  onLoadSamples,
  isSeeding,
}) => {
  const {
    selectedTag,
    setSelectedTag,
    selectedCollectionId,
    setSelectedCollectionId,
    sortBy,
    setSortBy,
    viewMode,
    setViewMode,
    setUploadModalOpen,
    pendingFormat,
    setPendingFormat,
  } = useAppStore();

  const [selectedFormat, setSelectedFormat] = useState<string>('ALL');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showAddCollection, setShowAddCollection] = useState(false);

  const formats = ['ALL', 'CBZ', 'CBR', 'CB7', 'CBT', 'CBA'];

  // Extract all tags from user's comics
  const allTags = Array.from(
    new Set(comics.flatMap(({ comic }) => comic.tags))
  );

  // Filter by format
  const filteredComics = comics.filter(({ comic }) => {
    if (selectedFormat !== 'ALL' && comic.format !== selectedFormat) {
      return false;
    }
    return true;
  });

  const handleCreateCollectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCollectionName.trim()) {
      onCreateCollection(newCollectionName.trim());
      setNewCollectionName('');
      setShowAddCollection(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Filter Bar */}
      <div className="bg-[#1a1a1a] comic-border p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Format Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <span className="impact-text text-xs font-bold text-[#FFD700] uppercase tracking-wider mr-1 shrink-0">
            FORMAT:
          </span>
          {formats.map((fmt) => (
            <button
              key={fmt}
              onClick={() => {
                if (fmt !== selectedFormat) {
                  setPendingFormat(fmt);
                }
              }}
              className={`impact-text text-xs px-2.5 py-1 border-2 border-black transition-all cursor-pointer shrink-0 ${
                selectedFormat === fmt
                  ? 'bg-[#ED1D24] text-white shadow-[2px_2px_0px_#FFD700]'
                  : 'bg-black text-gray-300 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>


      </div>

      {/* Collections & Tags Row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* All Collections Filter Pill */}
        <button
          onClick={() => setSelectedCollectionId(null)}
          className={`impact-text text-xs px-3 py-1 border-2 border-black cursor-pointer flex items-center gap-1.5 ${
            selectedCollectionId === null
              ? 'bg-[#FFD700] text-black shadow-[2px_2px_0px_#000]'
              : 'bg-[#1a1a1a] text-gray-300 hover:text-white'
          }`}
        >
          <span className="w-2 h-2 bg-[#FFD700] rotate-45 border border-black"></span>
          <span>ALL ARCHIVES</span>
        </button>

        {/* User Collections */}
        {collections.map((col) => {
          const isSel = selectedCollectionId === col.id;
          return (
            <button
              key={col.id}
              onClick={() => setSelectedCollectionId(isSel ? null : col.id)}
              className={`impact-text text-xs px-3 py-1 border-2 border-black flex items-center gap-1.5 cursor-pointer ${
                isSel
                  ? 'bg-[#ED1D24] text-white shadow-[2px_2px_0px_#000]'
                  : 'bg-[#1a1a1a] text-gray-300 hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rotate-45 border border-black" style={{ backgroundColor: col.color || '#ED1D24' }} />
              <span>{col.name}</span>
            </button>
          );
        })}

        {/* Add Collection Form */}
        {showAddCollection && (
          <form onSubmit={handleCreateCollectionSubmit} className="flex items-center gap-1">
            <input
              type="text"
              placeholder="Archive name..."
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              className="bg-black border-2 border-white/30 text-xs px-2 py-1 text-white focus:outline-none uppercase font-bold"
              autoFocus
            />
            <button
              type="submit"
              className="bg-[#ED1D24] text-white text-xs impact-text px-2 py-1 border-2 border-black"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowAddCollection(false)}
              className="bg-black text-gray-400 hover:text-white text-xs px-2 py-1 border border-white/30"
            >
              Cancel
            </button>
          </form>
        )}

        {/* Filter Tags */}
        {allTags.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5 overflow-x-auto">
            <Tag className="w-3.5 h-3.5 text-gray-400" />
            {allTags.map((tag) => {
              const isSel = selectedTag === tag;
              return (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(isSel ? null : tag)}
                  className={`text-[10px] font-mono px-2 py-0.5 border border-black cursor-pointer ${
                    isSel
                      ? 'bg-[#FFD700] text-black font-bold'
                      : 'bg-black text-gray-400 hover:text-white'
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Comic Items Grid */}
      {filteredComics.length > 0 ? (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4'
              : 'space-y-3'
          }
        >
          {filteredComics.map(({ comic, progress }) => (
            <ComicCard
              key={comic.id}
              comic={comic}
              progress={progress}
              collections={collections}
              onDelete={onDeleteComic}
              onToggleCollection={onToggleCollection}
            />
          ))}
        </div>
      ) : (
        /* Empty Library Placeholder */
        <div className="bg-[#1a1a1a] comic-border p-10 text-center space-y-4">
          <BookOpen className="w-14 h-14 mx-auto text-[#ED1D24]" />
          <h3 className="impact-text text-3xl text-white tracking-wider">
            NO COMIC ARCHIVES FOUND
          </h3>
          <p className="text-gray-300 text-sm max-w-md mx-auto">
            Your personal superhero vault is empty for this filter. Drag and drop your own CBZ/CBR files or click below to generate sample superhero issues!
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <button
              onClick={onLoadSamples}
              disabled={isSeeding}
              className="flex items-center gap-2 bg-[#FFD700] hover:bg-amber-400 text-black impact-text text-lg px-5 py-2 border-2 border-black shadow-[3px_3px_0px_#000] active:translate-x-0.5 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${isSeeding ? 'animate-spin' : ''}`} />
              <span>SEED 3 MARVEL SAMPLE COMICS</span>
            </button>

            <button
              onClick={() => setUploadModalOpen(true)}
              className="flex items-center gap-2 bg-[#ED1D24] hover:bg-red-700 text-white impact-text text-lg px-5 py-2 border-2 border-black shadow-[3px_3px_0px_#FFD700] active:translate-x-0.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>UPLOAD YOUR OWN CBZ / CBR</span>
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal ("Are you sure?") */}
      {pendingFormat && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border-4 border-black comic-border max-w-md w-full p-6 space-y-4 shadow-[8px_8px_0px_#ED1D24] animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 border-b-2 border-white/20 pb-3">
              <AlertTriangle className="w-8 h-8 text-[#FFD700] shrink-0" />
              <div>
                <h3 className="impact-text text-2xl text-white tracking-wider">
                  ARE YOU SURE?
                </h3>
                <p className="text-xs text-gray-300 font-mono">
                  CONFIRM ACTION
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-200">
              Are you sure you want to switch to the{' '}
              <span className="text-[#FFD700] font-bold impact-text text-base px-2 py-0.5 bg-black border border-white/40 mr-1">
                {pendingFormat}
              </span>{' '}
              format filter?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setPendingFormat(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 hover:text-white impact-text text-sm border-2 border-black cursor-pointer"
              >
                CANCEL
              </button>
              <button
                onClick={() => {
                  setSelectedFormat(pendingFormat);
                  setPendingFormat(null);
                }}
                className="px-5 py-2 bg-[#ED1D24] hover:bg-red-700 text-white impact-text text-sm border-2 border-black shadow-[2px_2px_0px_#FFD700] cursor-pointer active:scale-95 transition-transform"
              >
                YES, PROCEED
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
