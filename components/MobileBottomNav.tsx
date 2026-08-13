'use client';

import React, { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Collection } from '@/lib/types';
import {
  BookOpen,
  Upload,
  Layers,
  Volume2,
  VolumeX,
  UserCheck,
  X,
} from 'lucide-react';

interface MobileBottomNavProps {
  collections: Collection[];
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  collections,
}) => {
  const {
    currentUser,
    setUploadModalOpen,
    soundEnabled,
    toggleSound,
    selectedCollectionId,
    setSelectedCollectionId,
    selectedTag,
    setSelectedTag,
    searchQuery,
    setSearchQuery,
  } = useAppStore();

  const [collectionDrawerOpen, setCollectionDrawerOpen] = useState(false);

  const isVaultActive =
    selectedCollectionId === null && selectedTag === null && searchQuery === '';

  const handleVaultClick = () => {
    setSelectedCollectionId(null);
    setSelectedTag(null);
    setSearchQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      {/* Fixed Bottom Navigation Bar on Mobile Only */}
      <nav
        id="mobile-bottom-navigation"
        className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-[#0d0d0d] border-t-3 border-black shadow-[0_-4px_16px_rgba(0,0,0,0.7)] pt-1.5 pb-[calc(env(safe-area-inset-bottom,0px)+6px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
      >
        <div className="w-full grid grid-cols-5 items-center justify-items-center px-1">
          {/* 1. Vault Tab */}
          <button
            id="mobile-nav-vault"
            onClick={handleVaultClick}
            className={`w-full flex flex-col items-center justify-center py-1 gap-0.5 cursor-pointer active:scale-95 transition-all ${
              isVaultActive ? 'text-[#FFD700]' : 'text-gray-400 hover:text-white'
            }`}
          >
            <div
              className={`p-1 rounded flex items-center justify-center ${
                isVaultActive ? 'bg-[#ED1D24] text-white shadow-[1px_1px_0px_#FFD700]' : ''
              }`}
            >
              <BookOpen className="w-4 h-4" />
            </div>
            <span className="text-[10px] impact-text tracking-wider leading-none whitespace-nowrap">
              VAULT
            </span>
          </button>

          {/* 2. Archives / Collections Tab */}
          <button
            id="mobile-nav-archives"
            onClick={() => setCollectionDrawerOpen(true)}
            className={`w-full flex flex-col items-center justify-center py-1 gap-0.5 cursor-pointer active:scale-95 transition-all ${
              selectedCollectionId !== null ? 'text-[#FFD700]' : 'text-gray-400 hover:text-white'
            }`}
          >
            <div
              className={`p-1 rounded flex items-center justify-center ${
                selectedCollectionId !== null ? 'bg-[#ED1D24] text-white shadow-[1px_1px_0px_#FFD700]' : ''
              }`}
            >
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-[10px] impact-text tracking-wider leading-none whitespace-nowrap">
              ARCHIVES
            </span>
          </button>

          {/* 3. Upload Action (Center Accent) */}
          <button
            id="mobile-nav-upload"
            onClick={() => setUploadModalOpen(true)}
            className="w-full flex flex-col items-center justify-center py-1 gap-0.5 cursor-pointer active:scale-95 transition-all text-white group"
          >
            <div className="p-1.5 bg-[#ED1D24] border-2 border-white rounded-md text-white shadow-[2px_2px_0px_#000] group-hover:bg-red-700 flex items-center justify-center -mt-2">
              <Upload className="w-4 h-4 text-[#FFD700]" />
            </div>
            <span className="text-[10px] impact-text text-[#FFD700] tracking-wider leading-none whitespace-nowrap">
              UPLOAD
            </span>
          </button>

          {/* 4. Sound FX Toggle */}
          <button
            id="mobile-nav-sound"
            onClick={toggleSound}
            className={`w-full flex flex-col items-center justify-center py-1 gap-0.5 cursor-pointer active:scale-95 transition-all ${
              soundEnabled ? 'text-[#FFD700]' : 'text-gray-400 hover:text-white'
            }`}
          >
            <div className="p-1 flex items-center justify-center">
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-[#FFD700]" />
              ) : (
                <VolumeX className="w-4 h-4 text-gray-400" />
              )}
            </div>
            <span className="text-[10px] impact-text tracking-wider leading-none whitespace-nowrap">
              SOUND
            </span>
          </button>

          {/* 5. User Profile Display (Interaction Disabled on Mobile) */}
          <div
            id="mobile-nav-user"
            className="w-full flex flex-col items-center justify-center py-1 gap-0.5 text-gray-300 select-none pointer-events-none"
          >
            <div className="w-5 h-5 bg-[#FFD700] border border-black rounded-full flex items-center justify-center text-black font-bold text-[9px] uppercase overflow-hidden shrink-0">
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
              ) : (
                currentUser.name.slice(0, 2).toUpperCase()
              )}
            </div>
            <span className="text-[10px] impact-text tracking-wider leading-none whitespace-nowrap truncate max-w-[50px]">
              {currentUser.name.split(' ')[0]}
            </span>
          </div>
        </div>
      </nav>

      {/* Archives / Collections Bottom Sheet for Mobile */}
      {collectionDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden bg-black/80 backdrop-blur-sm flex flex-col justify-end p-0">
          <div
            className="flex-1"
            onClick={() => setCollectionDrawerOpen(false)}
          />
          <div className="bg-[#1a1a1a] border-t-4 border-black comic-border p-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] animate-in slide-in-from-bottom-5 duration-200">
            <div className="flex items-center justify-between border-b border-white/20 pb-3 mb-3">
              <div>
                <h3 className="impact-text text-lg text-[#FFD700] tracking-wider">
                  FILTER ARCHIVES
                </h3>
                <p className="text-xs text-gray-300">
                  Select a collection to filter your comic feed.
                </p>
              </div>
              <button
                onClick={() => setCollectionDrawerOpen(false)}
                className="p-1.5 bg-black border border-white/30 text-gray-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              <button
                onClick={() => {
                  setSelectedCollectionId(null);
                  setCollectionDrawerOpen(false);
                }}
                className={`w-full flex items-center justify-between p-2.5 border text-xs cursor-pointer ${
                  selectedCollectionId === null
                    ? 'bg-[#FFD700] border-black text-black font-bold shadow-[2px_2px_0px_#000]'
                    : 'bg-black border-white/20 text-gray-200 hover:bg-zinc-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-[#FFD700] rotate-45 border border-black"></span>
                  <span className="impact-text text-sm">ALL ARCHIVES</span>
                </div>
                {selectedCollectionId === null && <UserCheck className="w-4 h-4 text-black" />}
              </button>

              {collections.map((col) => {
                const isSel = selectedCollectionId === col.id;
                return (
                  <button
                    key={col.id}
                    onClick={() => {
                      setSelectedCollectionId(col.id);
                      setCollectionDrawerOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 border text-xs cursor-pointer ${
                      isSel
                        ? 'bg-[#ED1D24] border-black text-white font-bold shadow-[2px_2px_0px_#FFD700]'
                        : 'bg-black border-white/20 text-gray-200 hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rotate-45 border border-black"
                        style={{ backgroundColor: col.color || '#ED1D24' }}
                      />
                      <span className="impact-text text-sm">{col.name}</span>
                    </div>
                    {isSel && <UserCheck className="w-4 h-4 text-[#FFD700]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
