import { create } from 'zustand';
import { User, FitMode, ReadingDirection } from './types';

interface AppStore {
  // Auth state
  currentUser: User;
  setCurrentUser: (user: User) => void;

  // Library state
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  selectedCollectionId: string | null;
  setSelectedCollectionId: (collectionId: string | null) => void;
  sortBy: 'title' | 'createdAt' | 'lastRead';
  setSortBy: (sort: 'title' | 'createdAt' | 'lastRead') => void;
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;

  // Upload modal state
  uploadModalOpen: boolean;
  setUploadModalOpen: (open: boolean) => void;

  // Format confirmation modal state
  pendingFormat: string | null;
  setPendingFormat: (format: string | null) => void;

  // Reader state
  readerOpen: boolean;
  activeComicId: string | null;
  activePageNumber: number;
  fitMode: FitMode;
  zoomLevel: number;
  brightness: number;
  readingDirection: ReadingDirection;
  isFullscreen: boolean;
  showThumbnails: boolean;
  soundEnabled: boolean;

  openReader: (comicId: string, initialPage?: number) => void;
  closeReader: () => void;
  setActivePageNumber: (page: number) => void;
  nextPage: (totalPages: number) => void;
  prevPage: () => void;
  setFitMode: (mode: FitMode) => void;
  setZoomLevel: (zoom: number) => void;
  setBrightness: (brightness: number) => void;
  setReadingDirection: (dir: ReadingDirection) => void;
  toggleFullscreen: () => void;
  toggleThumbnails: () => void;
  toggleSound: () => void;
}

const DEFAULT_USER: User = {
  id: 'user_peter',
  name: 'Peter Parker',
  email: 'peter.parker@dailybugle.com',
  avatar: 'https://images.unsplash.com/photo-1635863138275-d9b33299680b?auto=format&fit=crop&w=150&q=80',
  heroAlias: 'Web-Slinger',
  createdAt: new Date().toISOString(),
};

function getSavedUser(): User {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('marvel_vault_current_user');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
  }
  return DEFAULT_USER;
}

export const useAppStore = create<AppStore>((set, get) => ({
  currentUser: getSavedUser(),
  setCurrentUser: (user) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('marvel_vault_current_user', JSON.stringify(user));
      } catch (e) {}
    }
    set({ currentUser: user, selectedCollectionId: null });
  },

  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  selectedTag: null,
  setSelectedTag: (selectedTag) => set({ selectedTag }),
  selectedCollectionId: null,
  setSelectedCollectionId: (selectedCollectionId) => set({ selectedCollectionId }),
  sortBy: 'lastRead',
  setSortBy: (sortBy) => set({ sortBy }),
  viewMode: 'grid',
  setViewMode: (viewMode) => set({ viewMode }),

  uploadModalOpen: false,
  setUploadModalOpen: (uploadModalOpen) => set({ uploadModalOpen }),

  pendingFormat: null,
  setPendingFormat: (pendingFormat) => set({ pendingFormat }),

  readerOpen: false,
  activeComicId: null,
  activePageNumber: 1,
  fitMode: 'fit-height',
  zoomLevel: 1.0,
  brightness: 100,
  readingDirection: 'ltr',
  isFullscreen: false,
  showThumbnails: false,
  soundEnabled: true,

  openReader: (comicId, initialPage = 1) =>
    set({
      readerOpen: true,
      activeComicId: comicId,
      activePageNumber: initialPage,
      zoomLevel: 1.0,
    }),

  closeReader: () => set({ readerOpen: false, activeComicId: null }),

  setActivePageNumber: (activePageNumber) => set({ activePageNumber }),

  nextPage: (totalPages) => {
    const { activePageNumber, fitMode } = get();
    const step = fitMode === 'double-page' ? 2 : 1;
    if (activePageNumber < totalPages) {
      set({ activePageNumber: Math.min(activePageNumber + step, totalPages) });
    }
  },

  prevPage: () => {
    const { activePageNumber, fitMode } = get();
    const step = fitMode === 'double-page' ? 2 : 1;
    if (activePageNumber > 1) {
      set({ activePageNumber: Math.max(activePageNumber - step, 1) });
    }
  },

  setFitMode: (fitMode) => set({ fitMode, zoomLevel: 1.0 }),
  setZoomLevel: (zoomLevel) => set({ zoomLevel }),
  setBrightness: (brightness) => set({ brightness }),
  setReadingDirection: (readingDirection) => set({ readingDirection }),
  toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),
  toggleThumbnails: () => set((state) => ({ showThumbnails: !state.showThumbnails })),
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
}));
