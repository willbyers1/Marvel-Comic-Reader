'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { Comic, ComicPage, ReadingProgress } from '@/lib/types';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Sun,
  Grid,
  Volume2,
  VolumeX,
  BookOpen,
  Layers,
  Trash2,
} from 'lucide-react';
import { deleteComicClient, updateProgressClient } from '@/lib/supabase-client';

interface ReaderProps {
  comic: Comic;
  pages: ComicPage[];
  initialProgress?: ReadingProgress;
  onClose: () => void;
}

export const Reader: React.FC<ReaderProps> = ({
  comic,
  pages,
  initialProgress,
  onClose,
}) => {
  const {
    currentUser,
    activePageNumber,
    setActivePageNumber,
    nextPage,
    prevPage,
    fitMode,
    setFitMode,
    zoomLevel,
    setZoomLevel,
    brightness,
    setBrightness,
    readingDirection,
    showThumbnails,
    toggleThumbnails,
    soundEnabled,
    toggleSound,
  } = useAppStore();

  const [controlsVisible, setControlsVisible] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteComic = async () => {
    if (!window.confirm(`Permanently delete "${comic.title}" and free up storage space?`)) {
      return;
    }
    setIsDeleting(true);
    try {
      const success = await deleteComicClient(comic.id, currentUser.id);
      if (success) {
        onClose();
        window.location.reload();
      } else {
        alert('Failed to delete the comic. Please try again.');
      }
    } catch (err: any) {
      console.error('Delete comic error:', err);
      alert('Error deleting comic.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Navigation direction and motion preferences for page-turn transitions
  const prefersReducedMotion = useReducedMotion();
  const [navDirection, setNavDirection] = useState<'next' | 'prev' | 'jump'>('next');
  const lastNavTimeRef = useRef<number>(0);

  // Merged Issue Banner transition state
  const [issueBanner, setIssueBanner] = useState<string | null>(null);
  const prevIssueIdRef = useRef<string | null>(null);

  const currentIssue = comic.issues?.find(
    (iss) => activePageNumber >= iss.startPage && activePageNumber <= iss.endPage
  );

  useEffect(() => {
    if (!currentIssue) return;
    if (prevIssueIdRef.current !== currentIssue.id) {
      prevIssueIdRef.current = currentIssue.id;
      setIssueBanner(currentIssue.label);
      const timer = setTimeout(() => {
        setIssueBanner(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [activePageNumber, currentIssue]);

  // Hide body scrollbar when Reader is active, restore on close
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow || '';
    };
  }, []);

  // Pan & Zoom state
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const isMoved = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, initialPanX: 0, initialPanY: 0 });

  // Sync refs with state to maintain latest values in event callbacks and native listeners
  const zoomLevelRef = useRef(zoomLevel);
  const panOffsetRef = useRef(panOffset);

  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

  // Touch gesture tracking refs
  const pinchStartRef = useRef<{
    dist: number;
    midpoint: { x: number; y: number };
    initialZoom: number;
    initialPan: { x: number; y: number };
  } | null>(null);

  const isTwoFingerGestureRef = useRef<boolean>(false);
  const singleTouchStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    initialPan: { x: number; y: number };
  } | null>(null);
  const lastTouchTapRef = useRef<number>(0);
  const touchMovedRef = useRef<boolean>(false);

  const totalPages = pages.length;

  // Calculate accurate pan bounds dynamically based on arbitrary zoom level, container, and image sizes
  const getPanBoundsForZoom = useCallback((zoom: number) => {
    if (zoom <= 1.0 || !containerRef.current || !imageContainerRef.current) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0, containerW: 0, containerH: 0, unscaledW: 0, unscaledH: 0, scaledW: 0, scaledH: 0 };
    }

    // Account for padding on container if any
    const style = window.getComputedStyle(containerRef.current);
    const paddingX = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
    const paddingY = parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0');

    const containerW = Math.max(1, containerRef.current.clientWidth - paddingX);
    const containerH = Math.max(1, containerRef.current.clientHeight - paddingY);

    // Unscaled width & height of the rendered image container
    const unscaledW = imageContainerRef.current.offsetWidth || 1;
    const unscaledH = imageContainerRef.current.offsetHeight || 1;

    const scaledW = unscaledW * zoom;
    const scaledH = unscaledH * zoom;

    // Maximum allowed pan offset in each direction from center (0, 0)
    const maxX = scaledW > containerW ? (scaledW - containerW) / 2 : 0;
    const minX = -maxX;

    const maxY = scaledH > containerH ? (scaledH - containerH) / 2 : 0;
    const minY = -maxY;

    return { minX, maxX, minY, maxY, containerW, containerH, unscaledW, unscaledH, scaledW, scaledH };
  }, []);

  const getPanBounds = useCallback(() => {
    return getPanBoundsForZoom(zoomLevel);
  }, [getPanBoundsForZoom, zoomLevel]);

  // Re-clamp pan offset whenever zoomLevel, activePageNumber, fitMode, or bounds change
  const clampPanOffset = useCallback(() => {
    if (zoomLevel <= 1.0) {
      setPanOffset({ x: 0, y: 0 });
      return;
    }

    const bounds = getPanBounds();
    setPanOffset((prev) => {
      const clampedX = Math.min(Math.max(prev.x, bounds.minX), bounds.maxX);
      const clampedY = Math.min(Math.max(prev.y, bounds.minY), bounds.maxY);

      if (clampedX !== prev.x || clampedY !== prev.y) {
        return { x: clampedX, y: clampedY };
      }
      return prev;
    });
  }, [getPanBounds, zoomLevel]);

  // Prevent default native browser pinch-to-zoom / pull-to-refresh on WebView
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeTouch = (e: TouchEvent) => {
      if (e.touches.length >= 2 || zoomLevelRef.current > 1.0) {
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    };

    container.addEventListener('touchstart', handleNativeTouch, { passive: false });
    container.addEventListener('touchmove', handleNativeTouch, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleNativeTouch);
      container.removeEventListener('touchmove', handleNativeTouch);
    };
  }, []);

  // Reset pan offset when active page or fit mode changes
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      setPanOffset({ x: 0, y: 0 });
    });
    return () => cancelAnimationFrame(handle);
  }, [activePageNumber, fitMode]);

  // Re-clamp pan offset on zoomLevel change
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      clampPanOffset();
    });
    return () => cancelAnimationFrame(handle);
  }, [zoomLevel, clampPanOffset]);

  // Re-clamp on window resize
  useEffect(() => {
    const handleResize = () => clampPanOffset();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPanOffset]);

  // Image load handler to calculate bounds once image dimensions are finalized
  const handleImageLoad = () => {
    clampPanOffset();
  };

  // Pointer Drag Handlers (Desktop Mouse)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return; // Desktop mouse drag only
    if (e.button !== 0) return; // Only primary mouse button
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a, [role="button"]')) {
      return;
    }
    isDragging.current = true;
    isMoved.current = false;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      initialPanX: panOffset.x,
      initialPanY: panOffset.y,
    };
  };

  // Global window pointer listeners for mouse dragging without setPointerCapture issues
  useEffect(() => {
    const handleWindowPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (!isDragging.current || zoomLevel <= 1.0) return;
      const deltaX = e.clientX - dragStart.current.x;
      const deltaY = e.clientY - dragStart.current.y;

      if (Math.hypot(deltaX, deltaY) > 4) {
        isMoved.current = true;
      }

      const bounds = getPanBounds();
      const rawX = dragStart.current.initialPanX + deltaX;
      const rawY = dragStart.current.initialPanY + deltaY;

      const clampedX = Math.min(Math.max(rawX, bounds.minX), bounds.maxX);
      const clampedY = Math.min(Math.max(rawY, bounds.minY), bounds.maxY);

      setPanOffset({ x: clampedX, y: clampedY });
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (isDragging.current) {
        isDragging.current = false;
      }
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [getPanBounds, zoomLevel]);

  // Wheel handler for zoom and pan
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomDelta = e.deltaY < 0 ? 0.25 : -0.25;
      setZoomLevel(Math.min(3.0, Math.max(0.5, zoomLevel + zoomDelta)));
    } else if (zoomLevel > 1) {
      e.preventDefault();
      const bounds = getPanBounds();
      setPanOffset((prev) => {
        const rawX = prev.x - e.deltaX;
        const rawY = prev.y - e.deltaY;
        const clampedX = Math.min(Math.max(rawX, bounds.minX), bounds.maxX);
        const clampedY = Math.min(Math.max(rawY, bounds.minY), bounds.maxY);
        return { x: clampedX, y: clampedY };
      });
    }
  };

  // Double click toggles zoom between 1x and 2x
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (zoomLevel > 1) {
      setZoomLevel(1.0);
      setPanOffset({ x: 0, y: 0 });
    } else {
      setZoomLevel(2.0);
    }
  };

  const handleStageClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a, [role="button"]')) {
      return;
    }
    if (isMoved.current) {
      isMoved.current = false;
      return;
    }
    setControlsVisible(!controlsVisible);
  };

  // Sound effect generator using Web Audio API
  const playPageTurnSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // AudioContext fallback
    }
  }, [soundEnabled]);

  // Save progress to server or Supabase
  const saveReadingProgress = useCallback(
    (page: number) => {
      const activeIssue = comic.issues?.find(
        (iss) => page >= iss.startPage && page <= iss.endPage
      );
      const activeIssueIdx = activeIssue ? comic.issues?.indexOf(activeIssue) : undefined;

      updateProgressClient(
        currentUser.id,
        comic.id,
        page,
        totalPages,
        activeIssue?.id,
        activeIssueIdx
      ).catch((err) => console.error('Failed to save progress:', err));
    },
    [comic.id, comic.issues, currentUser.id, totalPages]
  );

  // Preload adjacent page images (next 2 and prev 2) for zero-latency page transitions
  useEffect(() => {
    const pagesToPreload = [
      activePageNumber - 2,
      activePageNumber - 1,
      activePageNumber + 1,
      activePageNumber + 2,
    ];

    pagesToPreload.forEach((pNum) => {
      if (pNum >= 1 && pNum <= totalPages) {
        const pageObj = pages.find((p) => p.pageNumber === pNum);
        if (pageObj?.imageUrl) {
          const img = new Image();
          img.src = pageObj.imageUrl;
        }
      }
    });
  }, [activePageNumber, pages, totalPages]);

  const goToPage = useCallback(
    (page: number) => {
      const validPage = Math.min(Math.max(1, page), totalPages);
      if (validPage === activePageNumber) return;

      const now = Date.now();
      if (now - lastNavTimeRef.current < 120) return;
      lastNavTimeRef.current = now;

      if (validPage === activePageNumber + 1) {
        setNavDirection('next');
      } else if (validPage === activePageNumber - 1) {
        setNavDirection('prev');
      } else {
        setNavDirection('jump');
      }

      setZoomLevel(1.0);
      setPanOffset({ x: 0, y: 0 });
      setActivePageNumber(validPage);
      playPageTurnSound();
      saveReadingProgress(validPage);
    },
    [totalPages, activePageNumber, setActivePageNumber, playPageTurnSound, saveReadingProgress, setZoomLevel]
  );

  const handleNext = useCallback(() => {
    if (activePageNumber >= totalPages) return;

    const now = Date.now();
    if (now - lastNavTimeRef.current < 120) return;
    lastNavTimeRef.current = now;

    setNavDirection('next');
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
    nextPage(totalPages);
    playPageTurnSound();
    saveReadingProgress(activePageNumber + 1);
  }, [activePageNumber, totalPages, nextPage, playPageTurnSound, saveReadingProgress, setZoomLevel]);

  const handlePrev = useCallback(() => {
    if (activePageNumber <= 1) return;

    const now = Date.now();
    if (now - lastNavTimeRef.current < 120) return;
    lastNavTimeRef.current = now;

    setNavDirection('prev');
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
    prevPage();
    playPageTurnSound();
    saveReadingProgress(activePageNumber - 1);
  }, [activePageNumber, prevPage, playPageTurnSound, saveReadingProgress, setZoomLevel]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        readingDirection === 'ltr' ? handleNext() : handlePrev();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        readingDirection === 'ltr' ? handlePrev() : handleNext();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Home') {
        goToPage(1);
      } else if (e.key === 'End') {
        goToPage(totalPages);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, readingDirection, onClose, totalPages, goToPage]);

  // Touch Gesture Handlers for Mobile (Pinch-to-zoom, Pan, and Page Swipes)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchMovedRef.current = false;

    if (e.touches.length === 2) {
      // 2 fingers detected -> Start Pinch & Pan gesture exclusively
      isTwoFingerGestureRef.current = true;
      singleTouchStartRef.current = null;

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midpoint = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };

      pinchStartRef.current = {
        dist: Math.max(10, dist),
        midpoint,
        initialZoom: zoomLevelRef.current,
        initialPan: { ...panOffsetRef.current },
      };
    } else if (e.touches.length === 1) {
      // 1 finger touch
      if (isTwoFingerGestureRef.current) return;

      const t = e.touches[0];
      singleTouchStartRef.current = {
        x: t.clientX,
        y: t.clientY,
        time: Date.now(),
        initialPan: { ...panOffsetRef.current },
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      // Two-Finger Pinch-to-Zoom and Multi-Touch Pan
      isTwoFingerGestureRef.current = true;
      touchMovedRef.current = true;
      isMoved.current = true;

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const scale = dist / pinchStartRef.current.dist;

      // Restrict zoom strictly within stable 1.0x to 4.0x boundaries
      const newZoom = Math.min(4.0, Math.max(1.0, pinchStartRef.current.initialZoom * scale));

      const midpoint = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };

      const deltaX = midpoint.x - pinchStartRef.current.midpoint.x;
      const deltaY = midpoint.y - pinchStartRef.current.midpoint.y;

      if (newZoom <= 1.0) {
        setZoomLevel(1.0);
        setPanOffset({ x: 0, y: 0 });
      } else {
        const bounds = getPanBoundsForZoom(newZoom);
        const rawX = pinchStartRef.current.initialPan.x + deltaX;
        const rawY = pinchStartRef.current.initialPan.y + deltaY;
        const clampedX = Math.min(Math.max(rawX, bounds.minX), bounds.maxX);
        const clampedY = Math.min(Math.max(rawY, bounds.minY), bounds.maxY);

        setZoomLevel(newZoom);
        setPanOffset({ x: clampedX, y: clampedY });
      }
    } else if (e.touches.length === 1 && singleTouchStartRef.current && !isTwoFingerGestureRef.current) {
      const t = e.touches[0];
      const deltaX = t.clientX - singleTouchStartRef.current.x;
      const deltaY = t.clientY - singleTouchStartRef.current.y;

      if (Math.hypot(deltaX, deltaY) > 6) {
        touchMovedRef.current = true;
        isMoved.current = true;
      }

      // If already zoomed in (> 1.0), drag/pan the image smoothly across the screen
      if (zoomLevelRef.current > 1.0) {
        const bounds = getPanBoundsForZoom(zoomLevelRef.current);
        const rawX = singleTouchStartRef.current.initialPan.x + deltaX;
        const rawY = singleTouchStartRef.current.initialPan.y + deltaY;
        const clampedX = Math.min(Math.max(rawX, bounds.minX), bounds.maxX);
        const clampedY = Math.min(Math.max(rawY, bounds.minY), bounds.maxY);

        setPanOffset({ x: clampedX, y: clampedY });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      // All fingers lifted
      pinchStartRef.current = null;

      // Handle termination of 2-finger pinch/pan gesture without triggering page turn
      if (isTwoFingerGestureRef.current) {
        setTimeout(() => {
          isTwoFingerGestureRef.current = false;
        }, 150);

        // If zoom is returned to nearly 1x, cleanly snap back to 1.0 and (0,0)
        if (zoomLevelRef.current <= 1.08) {
          setZoomLevel(1.0);
          setPanOffset({ x: 0, y: 0 });
        } else {
          clampPanOffset();
        }
        singleTouchStartRef.current = null;
        return;
      }

      // Single touch gesture handling
      if (singleTouchStartRef.current && !isTwoFingerGestureRef.current) {
        const start = singleTouchStartRef.current;
        const endTouch = e.changedTouches[0];
        const diffX = start.x - endTouch.clientX;
        const diffY = start.y - endTouch.clientY;
        const dist = Math.hypot(diffX, diffY);
        const elapsed = Date.now() - start.time;

        singleTouchStartRef.current = null;

        // Mobile double-tap detection to quickly toggle 1x and 2x zoom
        const now = Date.now();
        if (dist < 15 && elapsed < 280 && now - lastTouchTapRef.current < 300) {
          lastTouchTapRef.current = 0;
          isMoved.current = true;
          touchMovedRef.current = true;
          if (zoomLevelRef.current > 1.0) {
            setZoomLevel(1.0);
            setPanOffset({ x: 0, y: 0 });
          } else {
            setZoomLevel(2.0);
          }
          return;
        }
        if (dist < 15 && elapsed < 280) {
          lastTouchTapRef.current = now;
        }

        // Swipe page navigation ONLY if zoomLevel is strictly 1.0 (normal view)
        if (zoomLevelRef.current <= 1.0 && Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY) * 1.25) {
          if (diffX > 0) {
            // Swiped left -> Next page
            readingDirection === 'ltr' ? handleNext() : handlePrev();
          } else {
            // Swiped right -> Previous page
            readingDirection === 'ltr' ? handlePrev() : handleNext();
          }
        }
      }
    } else if (e.touches.length === 1 && isTwoFingerGestureRef.current) {
      pinchStartRef.current = null;
    }
  };

  const pageVariants = {
    enter: (direction: 'next' | 'prev' | 'jump') => {
      if (prefersReducedMotion || direction === 'jump') {
        return { opacity: 0, scale: 0.98, x: 0 };
      }
      const xOffset = direction === 'next' ? 70 : -70;
      const x = readingDirection === 'ltr' ? xOffset : -xOffset;
      return { opacity: 0, x, scale: 0.98 };
    },
    center: {
      opacity: 1,
      x: 0,
      scale: 1,
    },
    exit: (direction: 'next' | 'prev' | 'jump') => {
      if (prefersReducedMotion || direction === 'jump') {
        return { opacity: 0, scale: 0.98, x: 0 };
      }
      const xOffset = direction === 'next' ? -70 : 70;
      const x = readingDirection === 'ltr' ? xOffset : -xOffset;
      return { opacity: 0, x, scale: 0.98 };
    },
  };

  // Get active single or double pages
  const currentPageObj = pages.find((p) => p.pageNumber === activePageNumber);
  const nextPageObj =
    fitMode === 'double-page'
      ? pages.find((p) => p.pageNumber === activePageNumber + 1)
      : null;

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0a] text-white flex flex-col select-none overflow-hidden font-sans">
      {/* Top Header Bar */}
      <AnimatePresence>
        {controlsVisible && (
          <>
            {/* Desktop Top Header Bar */}
            <motion.div
              initial={{ y: -60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -60, opacity: 0 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="hidden md:flex absolute top-0 inset-x-0 z-40 bg-black border-b-2 border-[#ED1D24] p-3 items-center justify-between gap-4 shadow-xl"
            >
              {/* Title & Issue */}
              <div className="flex items-center gap-3 truncate">
                <button
                  onClick={onClose}
                  className="p-1.5 bg-[#ED1D24] hover:bg-red-700 text-white border border-black shadow-[2px_2px_0px_#FFD700] cursor-pointer"
                  title="Exit reader"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="truncate min-w-0 max-w-[180px] sm:max-w-xs md:max-w-md lg:max-w-lg">
                  <h2 className="impact-text text-lg sm:text-xl text-white tracking-wide truncate" title={comic.title}>
                    {comic.title}
                  </h2>
                  <div className="text-[11px] font-mono text-[#FFD700] font-bold tracking-wider flex items-center gap-2">
                    <span>
                      PAGE {activePageNumber} OF {totalPages}
                    </span>
                    {currentIssue && (
                      <span className="text-white bg-[#ED1D24] px-1.5 py-0.2 border border-black text-[10px]">
                        {currentIssue.label} (p.{currentPageObj?.issuePageNumber || 1}/{currentIssue.pageCount})
                      </span>
                    )}
                    <span className="hidden md:inline text-gray-400 font-normal">
                      • FORMAT: {comic.format}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Issue Selector for Merged Books */}
              {comic.issues && comic.issues.length > 1 && (
                <div className="hidden lg:flex items-center gap-1.5 bg-[#1a1a1a] border border-[#FFD700] px-2 py-1 shadow-[2px_2px_0px_#000]">
                  <Layers className="w-4 h-4 text-[#FFD700] shrink-0" />
                  <select
                    value={currentIssue?.startPage || 1}
                    onChange={(e) => goToPage(parseInt(e.target.value, 10))}
                    className="bg-transparent text-white impact-text text-xs cursor-pointer focus:outline-none"
                  >
                    {comic.issues.map((iss) => (
                      <option key={iss.id} value={iss.startPage} className="bg-black text-white">
                        {iss.label} (Pages {iss.startPage}-{iss.endPage})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Quick Controls */}
              <div className="flex items-center gap-2">
                {/* Fit Mode Switcher */}
                <div className="hidden sm:flex bg-[#1a1a1a] border border-white/20 p-0.5">
                  <button
                    onClick={() => setFitMode('fit-height')}
                    className={`px-2 py-1 text-xs impact-text cursor-pointer ${
                      fitMode === 'fit-height' ? 'bg-[#ED1D24] text-white' : 'text-gray-400 hover:text-white'
                    }`}
                    title="Fit to Height"
                  >
                    FIT HEIGHT
                  </button>
                  <button
                    onClick={() => setFitMode('fit-width')}
                    className={`px-2 py-1 text-xs impact-text cursor-pointer ${
                      fitMode === 'fit-width' ? 'bg-[#ED1D24] text-white' : 'text-gray-400 hover:text-white'
                    }`}
                    title="Fit to Width"
                  >
                    FIT WIDTH
                  </button>
                  <button
                    onClick={() => setFitMode('double-page')}
                    className={`px-2 py-1 text-xs impact-text cursor-pointer ${
                      fitMode === 'double-page' ? 'bg-[#ED1D24] text-white' : 'text-gray-400 hover:text-white'
                    }`}
                    title="Double Page Spread"
                  >
                    SPREAD
                  </button>
                </div>

                {/* Thumbnails Toggle */}
                <button
                  onClick={toggleThumbnails}
                  className={`p-2 border border-black shadow-[2px_2px_0px_#000] cursor-pointer ${
                    showThumbnails ? 'bg-[#FFD700] text-black' : 'bg-[#1a1a1a] text-gray-300 hover:text-white'
                  }`}
                  title="Toggle page thumbnail strip"
                >
                  <Grid className="w-4 h-4" />
                </button>

                {/* Sound Toggle */}
                <button
                  onClick={toggleSound}
                  className="p-2 bg-[#1a1a1a] border border-black text-gray-300 hover:text-white cursor-pointer"
                  title="Toggle sound effects"
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4 text-[#FFD700]" /> : <VolumeX className="w-4 h-4 text-gray-500" />}
                </button>

                {/* Finish & Delete Button */}
                <button
                  onClick={handleDeleteComic}
                  disabled={isDeleting}
                  className="p-2 bg-[#ED1D24] hover:bg-red-700 text-white border border-black shadow-[2px_2px_0px_#000] cursor-pointer flex items-center gap-1.5 font-bold impact-text text-xs"
                  title="Finish & Delete (Delete comic and free storage)"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden md:inline">FINISH & DELETE</span>
                </button>
              </div>
            </motion.div>

            {/* Mobile Minimal Top Navigation Bar */}
            <motion.div
              initial={{ y: -60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -60, opacity: 0 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="flex md:hidden absolute top-0 inset-x-0 z-40 bg-black/95 border-b-2 border-[#ED1D24] px-4 py-2.5 pt-[calc(env(safe-area-inset-top,0px)+10px)] items-center justify-between shadow-xl backdrop-blur-md"
            >
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#ED1D24] hover:bg-red-700 active:bg-red-800 text-white font-bold impact-text text-sm border border-black shadow-[2px_2px_0px_#FFD700] cursor-pointer transition-transform active:scale-95"
                title="Back"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back to Library</span>
              </button>

              <div className="flex items-center gap-2">
                <span className="impact-text text-sm sm:text-base text-[#FFD700] font-bold tracking-wider">
                  Page {activePageNumber} / {totalPages}
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Comic Reader Stage */}
      <div
        ref={containerRef}
        className={`relative flex-1 w-full h-full flex items-center justify-center overflow-hidden select-none touch-none cursor-grab active:cursor-grabbing transition-all duration-200 ${
          controlsVisible
            ? 'pt-[calc(env(safe-area-inset-top,0px)+60px)] pb-[calc(env(safe-area-inset-bottom,0px)+12px)] px-2'
            : 'pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-[calc(env(safe-area-inset-bottom,0px)+8px)] px-2'
        } md:p-4`}
        style={{ filter: `brightness(${brightness}%)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onPointerDown={handlePointerDown}
        onWheel={handleWheel}
        onClick={handleStageClick}
      >
        {/* Left Interactive Tap Zone */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (isMoved.current || zoomLevel > 1.0) {
              isMoved.current = false;
              return;
            }
            readingDirection === 'ltr' ? handlePrev() : handleNext();
          }}
          className={`absolute left-0 top-12 bottom-12 w-1/4 z-20 cursor-w-resize opacity-0 hover:opacity-100 bg-gradient-to-r from-red-600/20 to-transparent flex items-center justify-start pl-4 transition-opacity ${
            zoomLevel > 1.0 ? 'pointer-events-none' : 'pointer-events-auto'
          }`}
        >
          <div className="p-3 bg-black border border-[#ED1D24] text-[#ED1D24]">
            <ChevronLeft className="w-8 h-8" />
          </div>
        </div>

        {/* Animated Issue Transition Banner */}
        <AnimatePresence>
          {issueBanner && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              transition={{ duration: 0.25 }}
              className="absolute top-14 z-50 pointer-events-none"
            >
              <div className="bg-[#ED1D24] text-white comic-border px-4 py-1.5 sm:px-6 sm:py-2 shadow-[4px_4px_0px_#FFD700] flex items-center gap-2">
                <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-[#FFD700] animate-pulse" />
                <span className="impact-text text-sm sm:text-xl tracking-widest text-white uppercase">
                  NOW READING: {issueBanner}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right Interactive Tap Zone */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (isMoved.current || zoomLevel > 1.0) {
              isMoved.current = false;
              return;
            }
            readingDirection === 'ltr' ? handleNext() : handlePrev();
          }}
          className={`absolute right-0 top-12 bottom-12 w-1/4 z-20 cursor-e-resize opacity-0 hover:opacity-100 bg-gradient-to-l from-red-600/20 to-transparent flex items-center justify-end pr-4 transition-opacity ${
            zoomLevel > 1.0 ? 'pointer-events-none' : 'pointer-events-auto'
          }`}
        >
          <div className="p-3 bg-black border border-[#ED1D24] text-[#ED1D24]">
            <ChevronRight className="w-8 h-8" />
          </div>
        </div>

        {/* Page Render Container */}
        <AnimatePresence mode="wait" custom={navDirection}>
          <motion.div
            key={`${activePageNumber}_${fitMode}`}
            custom={navDirection}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              duration: navDirection === 'jump' ? 0.15 : 0.26,
              ease: [0.25, 0.1, 0.25, 1.0],
            }}
            className="w-full h-full flex items-center justify-center overflow-hidden mx-auto"
          >
            <div
              ref={imageContainerRef}
              style={{
                transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0px) scale(${zoomLevel})`,
                transformOrigin: 'center center',
              }}
              className={`flex items-center justify-center gap-2 max-w-full max-h-full ${
                fitMode === 'fit-width' ? 'w-full' : ''
              }`}
              onDoubleClick={handleDoubleClick}
            >
              {currentPageObj ? (
                <img
                  src={currentPageObj.imageUrl}
                  alt={`Comic Page ${currentPageObj.pageNumber}`}
                  onLoad={handleImageLoad}
                  draggable={false}
                  className={`comic-border object-contain ${
                    fitMode === 'fit-width'
                      ? 'w-full h-auto max-h-full'
                      : 'max-h-full md:max-h-[82vh] h-auto max-w-full'
                  }`}
                />
              ) : (
                <div className="p-8 sm:p-12 text-center halftone comic-border bg-black mx-auto">
                  <BookOpen className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-[#ED1D24] mb-3" />
                  <h3 className="impact-text text-2xl sm:text-3xl text-white">END OF COMIC BOOK</h3>
                </div>
              )}

              {/* Double Page Spread Second Page */}
              {fitMode === 'double-page' && nextPageObj && (
                <img
                  src={nextPageObj.imageUrl}
                  alt={`Comic Page ${nextPageObj.pageNumber}`}
                  onLoad={handleImageLoad}
                  draggable={false}
                  className="comic-border object-contain max-h-full md:max-h-[82vh] h-auto max-w-full"
                />
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Page Thumbnails Drawer at Bottom */}
      <AnimatePresence>
        {showThumbnails && (
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 md:bottom-16 inset-x-0 z-30 bg-black/95 border-t-2 border-[#ED1D24] p-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] md:pb-3 backdrop-blur-md"
          >
            <div className="max-w-7xl mx-auto flex items-center gap-3 overflow-x-auto pb-1 scrollbar-thin">
              {pages.map((p) => {
                const isActive = p.pageNumber === activePageNumber;
                const isStartOfIssue = comic.issues?.find((iss) => iss.startPage === p.pageNumber);

                return (
                  <React.Fragment key={p.id}>
                    {isStartOfIssue && (
                      <div className="shrink-0 bg-[#ED1D24] border-2 border-[#FFD700] text-white px-2 py-1 flex items-center justify-center font-bold shadow-[2px_2px_0px_#000]">
                        <span className="impact-text text-xs text-[#FFD700] whitespace-nowrap">
                          {isStartOfIssue.label}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => goToPage(p.pageNumber)}
                      className={`relative shrink-0 w-20 aspect-[2/3] border-2 cursor-pointer transition-all ${
                        isActive
                          ? 'border-[#ED1D24] scale-105 shadow-[0_0_10px_#ED1D24]'
                          : 'border-white/20 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={p.imageUrl} alt={`Page ${p.pageNumber}`} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 inset-x-0 bg-black/90 text-[9px] impact-text text-center text-white truncate px-0.5">
                        {p.issuePageNumber ? `p.${p.issuePageNumber}` : p.pageNumber}
                      </span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Floating Reader Controls */}
      <AnimatePresence>
        {controlsVisible && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="hidden md:flex absolute bottom-0 inset-x-0 z-40 bg-black border-t-2 border-[#ED1D24] p-2.5 items-center justify-between gap-4 shadow-xl"
          >
            {/* Page Nav Arrows */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                disabled={activePageNumber <= 1}
                className="p-2 bg-[#ED1D24] hover:bg-red-700 text-white border border-black shadow-[2px_2px_0px_#FFD700] disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <span className="impact-text text-lg text-white tracking-widest px-2">
                {activePageNumber} / {totalPages}
              </span>

              <button
                onClick={handleNext}
                disabled={activePageNumber >= totalPages}
                className="p-2 bg-[#ED1D24] hover:bg-red-700 text-white border border-black shadow-[2px_2px_0px_#FFD700] disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Jump Slider */}
            <div className="flex-1 max-w-xs hidden sm:block">
              <input
                type="range"
                min="1"
                max={totalPages}
                value={activePageNumber}
                onChange={(e) => goToPage(parseInt(e.target.value, 10))}
                className="w-full accent-[#ED1D24] cursor-pointer"
              />
            </div>

            {/* Adjustments: Brightness & Zoom */}
            <div className="flex items-center gap-3">
              <div className="hidden lg:flex items-center gap-1 text-xs text-gray-300">
                <Sun className="w-4 h-4 text-[#FFD700]" />
                <input
                  type="range"
                  min="50"
                  max={150}
                  value={brightness}
                  onChange={(e) => setBrightness(parseInt(e.target.value, 10))}
                  className="w-20 accent-[#FFD700] cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-1 bg-[#1a1a1a] border border-white/20 p-1">
                <button
                  onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
                  className="p-1 hover:text-[#FFD700]"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="font-mono text-xs text-white px-1">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={() => setZoomLevel(Math.min(3.0, zoomLevel + 0.25))}
                  className="p-1 hover:text-[#FFD700]"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
