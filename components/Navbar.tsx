'use client';

import React, { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { User } from '@/lib/types';
import {
  Upload,
  Sparkles,
  Volume2,
  VolumeX,
  UserCheck,
  ChevronDown,
  Search,
  LayoutGrid,
  List,
  RefreshCw,
  X,
} from 'lucide-react';

interface NavbarProps {
  users: User[];
  onLoadSamples: () => void;
  isSeeding: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  users,
  onLoadSamples,
  isSeeding,
  onRefresh,
  isRefreshing = false,
}) => {
  const {
    currentUser,
    setCurrentUser,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    setUploadModalOpen,
    soundEnabled,
    toggleSound,
  } = useAppStore();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-[#ED1D24] border-b-4 border-black shadow-[0_4px_16px_rgba(0,0,0,0.5)] pt-[env(safe-area-inset-top,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-13 sm:h-14 md:h-16 flex items-center justify-between gap-2 sm:gap-3 md:gap-4">
        {/* Brand Logo - Skewed Panel */}
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <div className="bg-black px-2.5 py-1 sm:px-3 sm:py-1.5 md:px-4 md:py-2.5 skew-panel border-2 border-white cursor-pointer shadow-[2px_2px_0px_0px_#000] md:shadow-[3px_3px_0px_0px_#000] flex items-center justify-center shrink-0">
            <h1 className="impact-text text-sm sm:text-base md:text-3xl font-bold italic tracking-tighter text-white whitespace-nowrap leading-none">
              MARVEL COMICS
            </h1>
          </div>

          <div className="hidden lg:flex items-center gap-4 text-xs font-bold uppercase tracking-wider text-white">
            <span className="bg-black/30 px-2 py-0.5 border border-white/40">MARVEL VAULT</span>
          </div>
        </div>

        {/* Mobile Action Controls (Search, View Mode & Refresh) - Mobile Only */}
        <div className="flex md:hidden items-center gap-1.5 shrink-0">
          {/* Search Button */}
          <button
            id="mobile-nav-search-btn"
            onClick={() => {
              setMobileSearchOpen(!mobileSearchOpen);
            }}
            className={`p-1.5 sm:p-2 bg-black border-2 border-white text-white shadow-[2px_2px_0px_0px_#000] cursor-pointer shrink-0 active:scale-95 transition-transform flex items-center justify-center ${
              searchQuery || mobileSearchOpen ? 'text-[#FFD700] border-[#FFD700]' : 'hover:bg-zinc-900'
            }`}
            title="Search Comics"
            aria-label="Search Comics"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* View Mode Button (Grid / List toggle) */}
          <button
            id="mobile-nav-viewmode-btn"
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="p-1.5 sm:p-2 bg-black border-2 border-white text-white hover:bg-zinc-900 shadow-[2px_2px_0px_0px_#000] cursor-pointer shrink-0 active:scale-95 transition-transform flex items-center justify-center"
            title={viewMode === 'grid' ? 'Switch to List View' : 'Switch to Grid View'}
            aria-label={viewMode === 'grid' ? 'Switch to List View' : 'Switch to Grid View'}
          >
            {viewMode === 'grid' ? (
              <LayoutGrid className="w-4 h-4 text-[#FFD700]" />
            ) : (
              <List className="w-4 h-4 text-[#FFD700]" />
            )}
          </button>

          {/* Refresh Button */}
          {onRefresh && (
            <button
              id="mobile-nav-refresh-btn"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-1.5 sm:p-2 bg-black border-2 border-white text-white hover:bg-zinc-900 shadow-[2px_2px_0px_0px_#000] cursor-pointer shrink-0 active:scale-95 transition-transform flex items-center justify-center disabled:opacity-50"
              title="Refresh Library"
              aria-label="Refresh Library"
            >
              <RefreshCw className={`w-4 h-4 text-[#FFD700] ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>

        {/* Action Controls (Desktop Only) */}
        <div className="hidden md:flex items-center gap-2.5 md:gap-3 shrink-0">
          {/* Refresh Button (Desktop) */}
          {onRefresh && (
            <button
              id="desktop-nav-refresh-btn"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-1.5 md:p-2 bg-black border-2 border-white text-white hover:bg-zinc-900 shadow-[2px_2px_0px_0px_#000] cursor-pointer shrink-0 active:scale-95 transition-transform flex items-center justify-center disabled:opacity-50"
              title="Refresh Library"
              aria-label="Refresh Library"
            >
              <RefreshCw className={`w-3.5 h-3.5 md:w-4 md:h-4 text-[#FFD700] ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          )}

          {/* Upload Button */}
          <button
            onClick={() => setUploadModalOpen(true)}
            className="bg-black text-white p-1.5 md:px-4 md:py-1.5 impact-text text-xs sm:text-sm border-2 border-white flex items-center justify-center gap-2 hover:bg-zinc-900 shadow-[2px_2px_0px_0px_#000] cursor-pointer shrink-0 active:scale-95 transition-transform"
            title="Upload Archive"
          >
            <Upload className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#FFD700]" />
            <span className="hidden md:inline">+ UPLOAD ARCHIVE</span>
          </button>

          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            className="p-1.5 md:p-2 bg-black border-2 border-white text-white hover:bg-zinc-900 shadow-[2px_2px_0px_0px_#000] cursor-pointer shrink-0 active:scale-95 transition-transform"
            title={soundEnabled ? 'Mute page turn sounds' : 'Enable page turn sounds'}
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#FFD700]" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 md:w-4 md:h-4 text-gray-400" />
            )}
          </button>

          {/* User Account Isolation Switcher */}
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-1 md:gap-2 bg-black hover:bg-zinc-900 p-1 md:px-2.5 md:py-1 border-2 border-white shadow-[2px_2px_0px_0px_#000] cursor-pointer shrink-0 active:scale-95 transition-transform"
            >
              <div className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 bg-[#FFD700] border border-black rounded-full flex items-center justify-center text-black font-bold text-[9px] md:text-xs uppercase overflow-hidden shrink-0">
                {currentUser.avatar ? (
                  <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
                ) : (
                  currentUser.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="text-left hidden xl:block">
                <div className="text-xs font-bold text-white font-oswald leading-none">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-[#FFD700] font-mono">
                  {currentUser.heroAlias || 'Vault Key'}
                </div>
              </div>
              <ChevronDown className="w-3 h-3 md:w-3.5 md:h-3.5 text-white/80" />
            </button>

            {userDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setUserDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-24px)] bg-[#1a1a1a] border-3 border-black comic-border z-50 p-2 shadow-[4px_4px_0px_#000]">
                  <div className="px-3 py-2 border-b border-white/20 mb-2">
                    <div className="text-xs impact-text text-[#FFD700] font-bold tracking-wider">
                      USER ARCHIVE SWITCHER
                    </div>
                    <div className="text-[11px] text-gray-300">
                      Switch user to isolate private comic vaults.
                    </div>
                  </div>

                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {users.map((u) => {
                      const isSelected = u.id === currentUser.id;
                      return (
                        <button
                          key={u.id}
                          onClick={() => {
                            setCurrentUser(u);
                            setUserDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-2 text-left border text-xs cursor-pointer ${
                            isSelected
                              ? 'bg-[#ED1D24] border-black text-white font-bold'
                              : 'bg-black border-white/20 text-gray-200 hover:bg-zinc-800'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <img src={u.avatar} alt={u.name} className="w-6 h-6 rounded-full border border-black object-cover" />
                            <div>
                              <div className="font-oswald">{u.name}</div>
                              <div className="text-[10px] text-gray-300">{u.heroAlias}</div>
                            </div>
                          </div>
                          {isSelected && <UserCheck className="w-4 h-4 text-[#FFD700]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Expandable Search Bar */}
      {mobileSearchOpen && (
        <div className="md:hidden px-3 pb-2.5 pt-1 border-t-2 border-black bg-[#ED1D24] animate-in slide-in-from-top-2 duration-150">
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search comics, issues, heroes..."
              autoFocus
              className="w-full bg-black border-2 border-white text-white pl-8 pr-8 py-1.5 text-xs font-mono placeholder:text-gray-400 focus:outline-none focus:border-[#FFD700] shadow-[2px_2px_0px_0px_#000]"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 p-1 text-gray-400 hover:text-white"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => setMobileSearchOpen(false)}
                className="absolute right-2 p-1 text-gray-400 hover:text-white"
                title="Close search"
                aria-label="Close search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
