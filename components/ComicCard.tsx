'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Comic, ReadingProgress, Collection } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { Play, Trash2, BookOpen, MoreVertical, Check, Layers } from 'lucide-react';

interface ComicCardProps {
  comic: Comic;
  progress?: ReadingProgress;
  collections: Collection[];
  onDelete: (id: string) => void;
  onToggleCollection: (colId: string, comicId: string) => void;
}

export const ComicCard: React.FC<ComicCardProps> = ({
  comic,
  progress,
  collections,
  onDelete,
  onToggleCollection,
}) => {
  const { openReader, viewMode } = useAppStore();
  const isList = viewMode === 'list';
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setDeleteConfirm(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const currentPage = progress?.currentPage || 1;
  const totalPages = comic.pageCount || 1;
  const progressPercent = Math.round((currentPage / totalPages) * 100);
  const isCompleted = progress?.completed || false;

  return (
    <div className={`comic-border bg-black group cursor-pointer hover:shadow-[5px_5px_0px_#FFD700] transition-all flex ${isList ? 'flex-row items-stretch min-h-[96px] sm:min-h-[108px]' : 'flex-col justify-between'} overflow-hidden relative`}>
      {/* Top / Left Cover Image Area */}
      <div className={`${isList ? 'w-24 sm:w-28 shrink-0 h-auto self-stretch' : 'aspect-[2/3] w-full'} bg-zinc-800 relative overflow-hidden`} onClick={() => openReader(comic.id, currentPage)}>
        {/* Cover Thumbnail */}
        {comic.coverImageUrl ? (
          <img
            src={comic.coverImageUrl}
            alt={comic.title}
            className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center halftone">
            <BookOpen className="w-8 h-8 sm:w-10 sm:h-10 text-[#ED1D24] mb-2" />
            <span className="impact-text text-xs sm:text-sm text-white">{comic.title}</span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-80" />

        {/* Format / Badge */}
        <div className="absolute top-1.5 left-1.5 z-10 flex flex-wrap gap-1">
          {comic.isMerged && comic.issues && comic.issues.length > 0 ? (
            <span className="bg-[#FFD700] text-black text-[9px] impact-text px-1.5 py-0.5 border border-black shadow-[1px_1px_0px_#000] flex items-center gap-1">
              <Layers className="w-2.5 h-2.5" />
              {comic.issues.length} ISSUES
            </span>
          ) : (
            <span className="bg-[#ED1D24] text-white text-[9px] impact-text px-1.5 py-0.5 border border-black shadow-[1px_1px_0px_#000]">
              {comic.format}
            </span>
          )}
          {isCompleted && (
            <span className="bg-[#00FF00] text-black text-[9px] impact-text px-1.5 py-0.5 border border-black shadow-[1px_1px_0px_#000]">
              READ
            </span>
          )}
        </div>

        {/* Reading Progress Bar at Bottom of Cover (in grid mode) */}
        {!isList && progress && (
          <div className="absolute bottom-2 left-2 right-2 z-10">
            <div className="h-1.5 w-full bg-white/20 rounded-full mb-1 overflow-hidden border border-black">
              <div
                className={`h-full ${isCompleted ? 'bg-[#00FF00]' : 'bg-[#FFD700]'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] uppercase font-bold tracking-wider">
              <span className={isCompleted ? 'text-[#00FF00]' : 'text-white'}>
                {isCompleted ? 'Completed' : `${progressPercent}% Done`}
              </span>
              <span className="text-gray-300">P.{currentPage}/{totalPages}</span>
            </div>
          </div>
        )}

        {/* Hover Action Button */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 z-20">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openReader(comic.id, currentPage);
            }}
            className="flex items-center gap-1.5 bg-[#ED1D24] hover:bg-red-700 text-white impact-text text-xs px-3 py-1.5 border-2 border-black shadow-[2px_2px_0px_#FFD700] active:scale-95 transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{progress ? `P.${currentPage}` : 'READ'}</span>
          </button>
        </div>
      </div>

      {/* Info Content Section */}
      <div className={`p-2 sm:p-2.5 bg-black ${isList ? 'border-l-2 border-t-0' : 'border-t-2'} border-white/20 flex-1 flex flex-col justify-between min-w-0`}>
        <div>
          <div className="flex items-start justify-between gap-1.5 min-w-0">
            <p
              onClick={() => openReader(comic.id, currentPage)}
              className={`text-xs sm:text-sm font-bold text-white hover:text-[#FFD700] transition-colors cursor-pointer overflow-hidden ${
                isList ? 'truncate' : 'line-clamp-2 leading-tight break-words'
              }`}
              title={comic.title}
            >
              {comic.title}
            </p>

            {/* Menu Trigger */}
            <div className="relative shrink-0" ref={menuRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(!menuOpen);
                }}
                className="p-0.5 hover:bg-zinc-800 text-gray-400 hover:text-white cursor-pointer"
                aria-label="Comic options"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {menuOpen && (
                <div
                  className="absolute right-0 bottom-full mb-1 w-44 bg-[#1a1a1a] border-2 border-white shadow-[3px_3px_0px_#ED1D24] z-30 p-1 text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-2 py-1 impact-text text-[10px] text-[#FFD700] border-b border-white/10">
                    Collections
                  </div>
                  {collections.map((col) => {
                    const inCol = col.comicIds.includes(comic.id);
                    return (
                      <button
                        key={col.id}
                        onClick={() => onToggleCollection(col.id, comic.id)}
                        className="w-full flex items-center justify-between px-2 py-1 hover:bg-zinc-800 text-gray-200 text-left cursor-pointer"
                      >
                        <span className="font-oswald truncate text-[11px]">{col.name}</span>
                        {inCol && <Check className="w-3 h-3 text-[#FFD700]" />}
                      </button>
                    );
                  })}

                  <div className="border-t border-white/10 my-1" />

                  {deleteConfirm ? (
                    <div className="p-1 bg-red-950 border border-red-800 text-center">
                      <div className="text-[10px] text-red-300 font-bold mb-1">Delete comic?</div>
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => onDelete(comic.id)}
                          className="bg-red-600 text-white px-2 py-0.5 text-[10px] font-bold"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(false)}
                          className="bg-gray-700 text-gray-200 px-2 py-0.5 text-[10px]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      className="w-full flex items-center gap-1.5 px-2 py-1 text-red-400 hover:bg-red-950/50 hover:text-red-200 text-left cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span className="text-[11px]">Delete Comic</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <p className="text-[10px] opacity-60 uppercase font-mono tracking-tight text-gray-300 mt-0.5">
            {comic.isMerged && comic.issues && comic.issues.length > 0
              ? `${comic.issues.length} Issues • ${comic.pageCount} Total Pages`
              : `${comic.pageCount} Pages • ${comic.format}`}
          </p>

          {/* List Mode Progress Indicator */}
          {isList && progress && (
            <div className="mt-1.5 max-w-xs">
              <div className="h-1 w-full bg-white/20 rounded-full overflow-hidden border border-black">
                <div
                  className={`h-full ${isCompleted ? 'bg-[#00FF00]' : 'bg-[#FFD700]'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] uppercase font-bold tracking-wider text-gray-300 mt-0.5">
                <span className={isCompleted ? 'text-[#00FF00]' : 'text-gray-300'}>
                  {isCompleted ? 'Completed' : `${progressPercent}%`}
                </span>
                <span>P.{currentPage}/{totalPages}</span>
              </div>
            </div>
          )}
        </div>

        {/* Tags */}
        {comic.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {comic.tags.slice(0, 3).map((tag, idx) => (
              <span
                key={idx}
                className="bg-zinc-800 text-gray-300 text-[8px] font-mono px-1 py-0.2 border border-black"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
