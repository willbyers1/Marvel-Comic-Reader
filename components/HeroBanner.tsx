'use client';

import React from 'react';
import { Comic, ReadingProgress } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { Play, BookOpen, Layers, ShieldCheck } from 'lucide-react';

interface HeroBannerProps {
  latestRead?: { comic: Comic; progress?: ReadingProgress };
  totalComics: number;
  totalCollections: number;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  latestRead,
  totalComics,
  totalCollections,
}) => {
  const { openReader } = useAppStore();

  const activeComic = latestRead?.comic;
  const progress = latestRead?.progress;
  const currentPage = progress?.currentPage || 1;
  const totalPages = activeComic?.pageCount || 1;
  const progressPercent = Math.round((currentPage / totalPages) * 100);

  return (
    <div className="diagonal-stripe comic-border relative flex flex-col lg:flex-row items-stretch justify-between p-4 sm:p-6 md:p-8 overflow-hidden my-2 sm:my-4">
      {/* Dark Gradient Overlay for Readability */}
      <div className="absolute right-0 top-0 w-full lg:w-3/4 h-full bg-gradient-to-r lg:bg-gradient-to-l from-black via-black/85 to-black/60 pointer-events-none" />

      {/* Left Side: Active Hero Reading Spotlight */}
      <div className="relative z-10 flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <span className="bg-black text-white px-3 py-1 text-[10px] impact-text uppercase tracking-wider inline-block border border-white/80">
            RESUME READING
          </span>
          {activeComic && (
            <span className="text-xs impact-text text-[#FFD700] tracking-wider">
              ISSUE READY
            </span>
          )}
        </div>

        {activeComic ? (
          <div>
            <h2
              className="impact-text text-3xl sm:text-5xl leading-none mb-2 italic text-white drop-shadow-[2px_2px_0px_#000] line-clamp-2 sm:line-clamp-3 overflow-hidden break-words"
              title={activeComic.title}
            >
              {activeComic.title}
            </h2>
            <p className="text-sm font-medium max-w-xl opacity-90 text-gray-200 line-clamp-2">
              {activeComic.summary ||
                `You are at Page ${currentPage} of ${totalPages}. Format: ${activeComic.format}.`}
            </p>

            {/* Progress Bar Overlay */}
            <div className="mt-4 max-w-md space-y-1">
              <div className="flex justify-between text-xs impact-text text-gray-300">
                <span>PAGE {currentPage} OF {totalPages}</span>
                <span className="text-[#FFD700]">{progressPercent}% DONE</span>
              </div>
              <div className="w-full h-2.5 bg-black/60 border border-white/30">
                <div
                  className="h-full bg-[#FFD700] transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Resume CTA Button */}
            <div className="pt-4 flex items-center gap-3">
              <button
                onClick={() => openReader(activeComic.id, currentPage)}
                className="flex items-center gap-2 bg-[#ED1D24] hover:bg-red-700 text-white impact-text text-lg px-6 py-2 border-2 border-black shadow-[3px_3px_0px_0px_#FFD700] active:translate-x-0.5 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>RESUME PAGE {currentPage}</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h2 className="impact-text text-3xl sm:text-5xl leading-none mb-2 italic text-white">
              OMNI ARCHIVE VAULT READY
            </h2>
            <p className="text-sm font-medium max-w-xl opacity-90 text-gray-200">
              Upload digital comic archives (CBZ, CBR, CB7, CBT, CBA) or load sample hero issues to begin reading!
            </p>
          </div>
        )}
      </div>

      {/* Right Side: High Density Vault Stats Cards */}
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 gap-3 w-full lg:w-72 mt-6 lg:mt-0 shrink-0">
        <div className="bg-[#1a1a1a] p-3 comic-border text-center">
          <BookOpen className="w-4 h-4 mx-auto text-[#FFD700] mb-1" />
          <div className="impact-text text-2xl text-white">{totalComics}</div>
          <div className="text-[10px] uppercase font-bold text-gray-400">Issues</div>
        </div>

        <div className="bg-[#1a1a1a] p-3 comic-border text-center">
          <Layers className="w-4 h-4 mx-auto text-[#ED1D24] mb-1" />
          <div className="impact-text text-2xl text-white">{totalCollections}</div>
          <div className="text-[10px] uppercase font-bold text-gray-400">Archives</div>
        </div>

        <div className="bg-[#1a1a1a] p-3 comic-border text-center col-span-2 sm:col-span-1">
          <ShieldCheck className="w-4 h-4 mx-auto text-green-400 mb-1" />
          <div className="impact-text text-2xl text-[#00FF00]">5</div>
          <div className="text-[10px] uppercase font-bold text-gray-400">Formats</div>
        </div>
      </div>
    </div>
  );
};
