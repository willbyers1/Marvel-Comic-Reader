'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useAppStore } from '@/lib/store';
import { User, Comic, ComicPage, ReadingProgress, Collection } from '@/lib/types';
import { Navbar } from '@/components/Navbar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { HeroBanner } from '@/components/HeroBanner';
import { Library } from '@/components/Library';
import { UploadModal } from '@/components/UploadModal';
import { Reader } from '@/components/Reader';
import {
  fetchLibraryClient,
  fetchComicDetailsClient,
  deleteComicClient,
  createCollectionClient,
  toggleComicInCollectionClient,
  loadSampleComicsClient,
  getSupabaseClient,
  getApiUrl,
} from '@/lib/supabase-client';
import { subscribeToLibraryRealtime } from '@/lib/realtime';

export default function Home() {
  const {
    currentUser,
    searchQuery,
    selectedTag,
    selectedCollectionId,
    sortBy,
    readerOpen,
    activeComicId,
    closeReader,
  } = useAppStore();

  const [users, setUsers] = useState<User[]>([]);
  const [comicsData, setComicsData] = useState<{ comic: Comic; progress?: ReadingProgress }[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Active Reader comic details
  const [readerComicDetails, setReaderComicDetails] = useState<{
    comic: Comic;
    pages: ComicPage[];
    progress?: ReadingProgress;
  } | null>(null);

  // Fetch comics & collections for current user
  const fetchLibrary = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setIsRefreshing(true);
    }
    console.log('[DEBUG] fetchLibrary callback invoked with state/props:', {
      userId: currentUser.id,
      sortBy,
      searchQuery,
      selectedTag,
      selectedCollectionId
    });

    try {
      const res = await fetchLibraryClient(currentUser.id, {
        sortBy,
        searchQuery,
        selectedTag,
        selectedCollectionId,
      });

      console.log('[DEBUG] fetchLibrary response from fetchLibraryClient:', res);

      if (res.success) {
        console.log('[DEBUG] fetchLibrary success. Updating React state:', {
          comicsDataCount: res.data?.length || 0,
          collectionsCount: res.collections?.length || 0,
          usersCount: res.users?.length || 0
        });
        setComicsData(res.data || []);
        setCollections(res.collections || []);
        if (res.users && res.users.length > 0) {
          setUsers(res.users);
        }
      } else {
        console.error('[DEBUG] fetchLibrary response success flag was false:', res);
      }
    } catch (err) {
      console.error('[DEBUG] fetchLibrary callback exception caught:', err);
    } finally {
      if (showLoading) {
        setIsRefreshing(false);
      }
    }
  }, [currentUser.id, searchQuery, selectedTag, selectedCollectionId, sortBy]);

  const handleManualRefresh = useCallback(() => {
    fetchLibrary(true);
  }, [fetchLibrary]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (isMounted) {
        await fetchLibrary();
      }
    };
    load();

    // Supabase Realtime synchronization across Web, Desktop Exe, and Mobile APK
    const unsubscribe = subscribeToLibraryRealtime((table, eventType, payload) => {
      if (!isMounted) return;
      console.log(`[Realtime Sync] ${table} -> ${eventType}. Refreshing active library...`);
      fetchLibrary();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [fetchLibrary]);

  // Load Reader comic details when readerOpen & activeComicId are set
  useEffect(() => {
    let isMounted = true;
    if (readerOpen && activeComicId) {
      fetchComicDetailsClient(activeComicId, currentUser.id)
        .then((res) => {
          if (isMounted && res.success && res.data) {
            setReaderComicDetails(res.data);
          }
        })
        .catch((err) => console.error('Error fetching comic details for reader:', err));
    } else {
      requestAnimationFrame(() => {
        setReaderComicDetails(null);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [readerOpen, activeComicId, currentUser.id]);

  // Refresh library when Reader closes
  const prevReaderOpenRef = useRef(readerOpen);
  useEffect(() => {
    if (prevReaderOpenRef.current && !readerOpen) {
      fetchLibrary();
    }
    prevReaderOpenRef.current = readerOpen;
  }, [readerOpen, fetchLibrary]);

  // Capacitor Android Hardware Back Button navigation listener
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: { remove: () => void } | null = null;

    const initBackButtonListener = async () => {
      try {
        listenerHandle = await App.addListener('backButton', () => {
          const state = useAppStore.getState();

          // 1. Pending Format Confirmation Modal (Library)
          if (state.pendingFormat) {
            state.setPendingFormat(null);
            return;
          }

          // 2. Reader Thumbnail Strip
          if (state.readerOpen && state.showThumbnails) {
            state.toggleThumbnails();
            return;
          }

          // 3. Reader Screen
          if (state.readerOpen) {
            state.closeReader();
            return;
          }

          // 4. Upload Modal
          if (state.uploadModalOpen) {
            state.setUploadModalOpen(false);
            return;
          }

          // 5. Active Dashboard Filters
          if (state.selectedCollectionId !== null) {
            state.setSelectedCollectionId(null);
            return;
          }
          if (state.selectedTag !== null) {
            state.setSelectedTag(null);
            return;
          }
          if (state.searchQuery !== '') {
            state.setSearchQuery('');
            return;
          }

          // 6. Root Dashboard -> Minimize / exit application
          App.minimizeApp();
        });
      } catch (err) {
        console.warn('Capacitor backButton listener notice:', err);
      }
    };

    initBackButtonListener();

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, []);

  // Generate superhero sample comics
  const handleLoadSamples = async () => {
    try {
      setIsSeeding(true);
      const success = await loadSampleComicsClient(currentUser.id);
      if (success) {
        await fetchLibrary();
      }
    } catch (err) {
      console.error('Error generating sample comics:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  // Delete comic
  const handleDeleteComic = async (id: string) => {
    try {
      const success = await deleteComicClient(id, currentUser.id);
      if (success) {
        await fetchLibrary();
      } else {
        alert('Failed to delete the comic. Please try again.');
      }
    } catch (err) {
      console.error('Error deleting comic:', err);
    }
  };

  // Toggle collection
  const handleToggleCollection = async (collectionId: string, comicId: string) => {
    try {
      await toggleComicInCollectionClient(currentUser.id, collectionId, comicId);
      await fetchLibrary();
    } catch (err) {
      console.error('Error toggling collection:', err);
    }
  };

  // Create new collection
  const handleCreateCollection = async (name: string) => {
    try {
      await createCollectionClient(currentUser.id, name);
      await fetchLibrary();
    } catch (err) {
      console.error('Error creating collection:', err);
    }
  };

  // Latest read comic for Hero Banner
  const latestRead = comicsData.length > 0 ? comicsData[0] : undefined;

  // Stats calculation
  const totalMB = (comicsData.reduce((acc, c) => acc + (c.comic.fileSizeBytes || 0), 0) / (1024 * 1024)).toFixed(1);
  const completedCount = comicsData.filter((c) => c.progress?.completed).length;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-sans selection:bg-[#ED1D24] selection:text-white relative">
      {/* Background Halftone Overlay */}
      <div className="halftone absolute inset-0 opacity-40 pointer-events-none" />

      {/* Marvel High Density Navbar */}
      <Navbar
        users={users}
        onLoadSamples={handleLoadSamples}
        isSeeding={isSeeding}
        onRefresh={handleManualRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Main Content Area in High Density 2-Column Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 pb-24 md:pb-6 flex flex-col lg:flex-row gap-4 sm:gap-6 z-10">
        {/* Left Sidebar Section */}
        <aside className="w-full lg:w-64 flex flex-col gap-4 shrink-0">
          {/* Stats Box */}
          <div className="bg-[#1a1a1a] p-4 comic-border">
            <h3 className="impact-text text-[#FFD700] text-lg mb-3">YOUR STATS</h3>
            <div className="space-y-3 font-bold text-xs uppercase">
              <div className="flex justify-between border-b border-white/10 pb-1.5">
                <span className="opacity-60">Total Issues</span>
                <span className="text-white">{comicsData.length}</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-1.5">
                <span className="opacity-60">Storage Used</span>
                <span className="text-white">{totalMB} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-60">Completed</span>
                <span className="text-[#00FF00] font-black">{completedCount}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Feed Section */}
        <section className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Spotlight Hero Banner */}
          <HeroBanner
            latestRead={latestRead}
            totalComics={comicsData.length}
            totalCollections={collections.length}
          />

          {/* Comic Library Grid */}
          <Library
            comics={comicsData}
            collections={collections}
            onDeleteComic={handleDeleteComic}
            onToggleCollection={handleToggleCollection}
            onCreateCollection={handleCreateCollection}
            onLoadSamples={handleLoadSamples}
            isSeeding={isSeeding}
          />
        </section>
      </main>

      {/* Mobile Fixed Bottom Navigation Bar */}
      {!readerOpen && (
        <MobileBottomNav
          collections={collections}
        />
      )}

      {/* Upload Modal */}
      <UploadModal onSuccess={fetchLibrary} />

      {/* Fullscreen Reader Modal */}
      {readerOpen && readerComicDetails && (
        <Reader
          comic={readerComicDetails.comic}
          pages={readerComicDetails.pages}
          initialProgress={readerComicDetails.progress}
          onClose={() => {
            closeReader();
            fetchLibrary();
          }}
        />
      )}
    </div>
  );
}
