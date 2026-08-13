'use client';

import React, { useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAppStore } from '@/lib/store';
import { naturalSortFiles, deriveMergedTitle, getComicMimeType, cleanComicTitle } from '@/lib/utils';
import { getApiUrl, getSupabaseClient, getStorageBucketName, getPublicCdnUrl } from '@/lib/supabase-client';
import { extractAndUploadCbzClient } from '@/lib/client-extractor';
import {
  X,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Layers,
  ChevronUp,
  ChevronDown,
  Trash2,
} from 'lucide-react';

interface UploadModalProps {
  onSuccess: () => void;
}

interface UploadQueueItem {
  id: string;
  file: File;
  title: string;
  series: string;
  issueNumber: string;
  tags: string;
  status: 'pending' | 'uploading' | 'extracting' | 'success' | 'error';
  progress: number;
  errorMessage?: string;
  statusMessage?: string;
}

interface MergeItem {
  id: string;
  file: File;
  label: string;
}

async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  try {
    const res = await fetch(getApiUrl(url), options);
    const contentType = res.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      const rawText = await res.text();
      console.error(`Non-JSON response from ${url} [HTTP ${res.status} ${res.statusText}]:`, rawText);
      return {
        ok: false,
        status: res.status,
        error: `Server returned non-JSON output (HTTP ${res.status} ${res.statusText}). ${
          res.status === 413
            ? 'Uploaded file size exceeds server payload limits.'
            : 'Please check server logs or try again.'
        }`,
      };
    }

    const data = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data,
        error: data.error || `Request failed with HTTP status ${res.status}.`,
      };
    }

    return { ok: true, status: res.status, data };
  } catch (err: any) {
    console.error(`Fetch exception for ${url}:`, err);
    return {
      ok: false,
      status: 0,
      error: err.message || 'Network communication error.',
    };
  }
}

const ALLOWED_COMIC_EXTENSIONS = ['.cbz', '.cbr', '.cb7', '.cbt', '.cba', '.zip', '.rar', '.7z', '.tar', '.ace'];

const isSupportedComicFile = (filename: string): boolean => {
  const lower = filename.toLowerCase();
  return ALLOWED_COMIC_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

export const UploadModal: React.FC<UploadModalProps> = ({ onSuccess }) => {
  const { uploadModalOpen, setUploadModalOpen, currentUser } = useAppStore();
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileValidationError, setFileValidationError] = useState<string | null>(null);

  // Use '*/*' on native Capacitor platform (Android) to prevent MIME database from greying out archives in native picker
  const acceptExtensions = Capacitor.isNativePlatform()
    ? '*/*'
    : '.cbz,.cbr,.cb7,.cbt,.cba,.zip,.rar,.7z,.tar,.ace';

  // Multi-file merge flow states
  const [pendingMultiFiles, setPendingMultiFiles] = useState<File[] | null>(null);
  const [showMergePrompt, setShowMergePrompt] = useState(false);
  const [isConfiguringMerge, setIsConfiguringMerge] = useState(false);
  const [mergeItems, setMergeItems] = useState<MergeItem[]>([]);
  const [mergeTitle, setMergeTitle] = useState('');
  const [mergeTags, setMergeTags] = useState('Action, Superhero, Merged');
  const [isMerging, setIsMerging] = useState(false);
  const [mergeStepStatus, setMergeStepStatus] = useState<string>('');
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeSuccess, setMergeSuccess] = useState<boolean>(false);

  if (!uploadModalOpen) return null;

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setFileValidationError(null);
    const rawFiles = Array.from(files);
    const validFiles: File[] = [];
    const invalidFiles: File[] = [];

    for (const file of rawFiles) {
      if (isSupportedComicFile(file.name)) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file);
      }
    }

    if (invalidFiles.length > 0) {
      const errorMsg = invalidFiles
        .map((f) => `Unsupported file format: ${f.name}`)
        .join(' | ');
      setFileValidationError(errorMsg);
    }

    if (validFiles.length === 0) return;

    if (validFiles.length > 1) {
      setPendingMultiFiles(validFiles);
      setShowMergePrompt(true);
      return;
    }

    // Single file selected
    const file = validFiles[0];
    const rawCleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    const cleanedTitle = cleanComicTitle(rawCleanName) || rawCleanName;
    const newItem: UploadQueueItem = {
      id: `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      file,
      title: cleanedTitle,
      series: cleanedTitle,
      issueNumber: '1',
      tags: 'Action, Superhero',
      status: 'pending',
      progress: 0,
    };

    setQueue((prev) => [...prev, newItem]);
  };

  const handleChooseSeparate = () => {
    if (!pendingMultiFiles) return;

    const newItems: UploadQueueItem[] = pendingMultiFiles.map((file) => {
      const rawCleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      const cleanedTitle = cleanComicTitle(rawCleanName) || rawCleanName;
      return {
        id: `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        file,
        title: cleanedTitle,
        series: cleanedTitle,
        issueNumber: '1',
        tags: 'Action, Superhero',
        status: 'pending',
        progress: 0,
      };
    });

    setQueue((prev) => [...prev, ...newItems]);
    setShowMergePrompt(false);
    setPendingMultiFiles(null);
  };

  const handleChooseMerge = () => {
    if (!pendingMultiFiles) return;

    const sortedFiles = naturalSortFiles(pendingMultiFiles);
    const defaultTitle = deriveMergedTitle(sortedFiles.map((f) => f.name));

    const initialMergeItems: MergeItem[] = sortedFiles.map((file, idx) => ({
      id: `m_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      file,
      label: `Issue ${idx + 1}`,
    }));

    setMergeItems(initialMergeItems);
    setMergeTitle(defaultTitle);
    setMergeTags('Action, Superhero, Merged');
    setShowMergePrompt(false);
    setIsConfiguringMerge(true);
    setMergeError(null);
    setMergeSuccess(false);
  };

  const moveMergeItem = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= mergeItems.length) return;
    const updated = [...mergeItems];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);

    // Auto-update default labels to preserve sequential numbering unless custom renamed
    const renumbered = updated.map((item, idx) => {
      if (/^Issue \d+$/i.test(item.label)) {
        return { ...item, label: `Issue ${idx + 1}` };
      }
      return item;
    });

    setMergeItems(renumbered);
  };

  const removeMergeItem = (id: string) => {
    const updated = mergeItems.filter((i) => i.id !== id);
    if (updated.length === 0) {
      setIsConfiguringMerge(false);
      setPendingMultiFiles(null);
      return;
    }
    setMergeItems(updated);
  };

  const uploadInChunks = async (
    file: File,
    targetKey: string,
    mimeType: string,
    onProgress?: (pct: number) => void
  ): Promise<{ ok: boolean; fileKey?: string; isCloud?: boolean; error?: string }> => {
    const chunkSize = 5 * 1024 * 1024; // 5MB chunks to easily pass through Cloud Run/Next.js proxies
    const totalChunks = Math.ceil(file.size / chunkSize);
    let lastResult: any = null;

    try {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(file.size, start + chunkSize);
        const chunkBlob = file.slice(start, end);

        const url = `/api/upload/direct-file?key=${encodeURIComponent(targetKey)}&chunkIndex=${i}&totalChunks=${totalChunks}&mimeType=${encodeURIComponent(mimeType)}`;

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', url, true);
          xhr.setRequestHeader('Content-Type', 'application/octet-stream');

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
              const currentLoaded = start + e.loaded;
              const pct = Math.round((currentLoaded / file.size) * 100);
              onProgress(pct);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const res = JSON.parse(xhr.responseText);
                if (res.fileKey) {
                  lastResult = res;
                }
              } catch (e) {}
              resolve();
            } else {
              let errText = '';
              try {
                const res = JSON.parse(xhr.responseText);
                errText = res.error || res.message || xhr.responseText;
              } catch {
                errText = xhr.responseText ? xhr.responseText.substring(0, 150) : `HTTP ${xhr.status}`;
              }
              reject(new Error(`Chunk ${i + 1}/${totalChunks} upload failed: ${errText}`));
            }
          };

          xhr.onerror = () => reject(new Error(`Chunk ${i + 1}/${totalChunks} network error.`));
          xhr.send(chunkBlob);
        });
      }

      return {
        ok: true,
        fileKey: targetKey,
        isCloud: lastResult?.isCloud ?? false,
      };
    } catch (chunkErr: any) {
      return { ok: false, error: chunkErr.message || 'Chunked upload failed.' };
    }
  };

  const uploadFileDirectToCloud = async (
    file: File,
    userId: string,
    onProgress?: (pct: number) => void
  ): Promise<{ ok: boolean; fileKey?: string; isCloud?: boolean; error?: string }> => {
    const mimeType = getComicMimeType(file.name, file.type);
    const fallbackKey = `raw-uploads/${userId}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;

    // 1. Primary: Direct client-side upload to Supabase Storage bucket using anon key
    try {
      const supabase = getSupabaseClient();
      const bucket = getStorageBucketName();
      
      const { data, error } = await supabase.storage.from(bucket).upload(fallbackKey, file, {
        contentType: mimeType,
        upsert: true,
      });

      if (!error && data?.path) {
        if (onProgress) onProgress(100);
        return { ok: true, fileKey: data.path, isCloud: true };
      }
    } catch (stErr: any) {
      console.warn('Direct client Supabase Storage upload error, trying presigned/chunked fallback:', stErr);
    }

    // 2. Fallback for files > 25MB or when REST upload is restricted
    if (file.size > 25 * 1024 * 1024) {
      return uploadInChunks(file, fallbackKey, mimeType, onProgress);
    }

    const presigned = await safeFetchJson('/api/upload/presigned-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        contentType: mimeType,
        userId,
        fileSizeBytes: file.size,
      }),
    });

    if (!presigned.ok || !presigned.data?.uploadUrl) {
      return uploadInChunks(file, fallbackKey, mimeType, onProgress);
    }

    const { uploadUrl, fileKey, isCloud } = presigned.data;

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', mimeType);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            const pct = Math.round((e.loaded / e.total) * 100);
            onProgress(pct);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            let errorDetails = '';
            try {
              const res = JSON.parse(xhr.responseText);
              errorDetails = res.message || res.error || res.msg || xhr.responseText;
            } catch {
              errorDetails = xhr.responseText ? xhr.responseText.substring(0, 200) : `HTTP ${xhr.status} ${xhr.statusText}`;
            }
            reject(new Error(`Direct storage upload failed (HTTP ${xhr.status}): ${errorDetails}`));
          }
        };

        xhr.onerror = () => reject(new Error('Network communication error during direct storage upload.'));
        xhr.send(file);
      });

      return { ok: true, fileKey, isCloud };
    } catch (err: any) {
      console.warn('Primary direct storage upload failed, attempting chunked fallback:', err.message);
      return uploadInChunks(file, fallbackKey, mimeType, onProgress);
    }
  };

  const startMergedUpload = async () => {
    if (mergeItems.length === 0 || !mergeTitle.trim()) return;

    setIsMerging(true);
    setMergeError(null);
    const sessionId = `merge_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Upload & Extract each issue archive individually in sequence
    for (let i = 0; i < mergeItems.length; i++) {
      const item = mergeItems[i];
      const issueLabel = item.label || `Issue ${i + 1}`;
      setMergeStepStatus(`Uploading Issue ${i + 1} of ${mergeItems.length} to cloud storage...`);

      const directUpload = await uploadFileDirectToCloud(item.file, currentUser.id, (pct) => {
        setMergeStepStatus(`Uploading Issue ${i + 1} of ${mergeItems.length}: ${pct}%...`);
      });

      if (!directUpload.ok || !directUpload.fileKey) {
        setIsMerging(false);
        setMergeError(directUpload.error || `Failed to upload issue archive to cloud: ${issueLabel}`);
        return;
      }

      setMergeStepStatus(`Extracting Issue ${i + 1} of ${mergeItems.length}: ${issueLabel}...`);

      const res = await safeFetchJson('/api/comics/merge/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          issueIndex: i,
          label: issueLabel,
          fileKey: directUpload.fileKey,
          isCloud: directUpload.isCloud,
          originalFilename: item.file.name,
        }),
      });

      if (!res.ok) {
        setIsMerging(false);
        setMergeError(res.error || `Failed to extract issue archive: ${issueLabel}`);
        return;
      }
    }

    // Finalize merged comic book assembly
    setMergeStepStatus('Finalizing merged comic book in cloud storage...');

    const res = await safeFetchJson('/api/comics/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        userId: currentUser.id,
        title: mergeTitle.trim(),
        tags: mergeTags.trim(),
        issues: mergeItems.map((item, idx) => ({
          issueIndex: idx,
          label: item.label || `Issue ${idx + 1}`,
        })),
      }),
    });

    setIsMerging(false);

    if (!res.ok) {
      setMergeError(res.error || 'Failed to finalize merged comic book.');
    } else {
      setMergeSuccess(true);
      onSuccess();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const updateQueueItem = (id: string, updates: Partial<UploadQueueItem>) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  };

  const startUpload = async (item: UploadQueueItem) => {
    updateQueueItem(item.id, {
      status: 'uploading',
      progress: 5,
      statusMessage: 'Initializing...',
    });

    let directUpload: { ok: boolean; fileKey?: string; isCloud?: boolean; error?: string } = { ok: false };

    // 1. Try staging file to cloud for server extraction if server environment is available
    try {
      directUpload = await uploadFileDirectToCloud(item.file, currentUser.id, (progress) => {
        updateQueueItem(item.id, {
          status: 'uploading',
          progress: Math.min(80, Math.max(5, Math.round(progress * 0.8))),
          statusMessage: `Staging to cloud: ${Math.round(progress)}%`,
        });
      });
    } catch {
      // Direct raw staging failed; client-side extraction will proceed directly from item.file
    }

    let extractedSuccessfully = false;

    // 2. Try server extraction route if staging succeeded
    if (directUpload.ok && directUpload.fileKey) {
      updateQueueItem(item.id, {
        status: 'extracting',
        progress: 85,
        statusMessage: 'Extracting on server...',
      });

      try {
        const res = await safeFetchJson('/api/comics/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileKey: directUpload.fileKey,
            isCloud: directUpload.isCloud,
            originalFilename: item.file.name,
            userId: currentUser.id,
            title: item.title,
            series: item.series,
            issueNumber: item.issueNumber,
            tags: item.tags,
          }),
        });

        if (res.ok) {
          extractedSuccessfully = true;
        }
      } catch (err) {
        console.warn('Server archive extraction endpoint unavailable, using client-side extraction:', err);
      }
    }

    // 3. Real Client-Side Extraction (JSZip for CBZ/ZIP in native APK / static host)
    if (!extractedSuccessfully) {
      updateQueueItem(item.id, {
        status: 'extracting',
        progress: 10,
        statusMessage: 'Extracting on client...',
      });

      const clientRes = await extractAndUploadCbzClient({
        file: item.file,
        userId: currentUser.id,
        title: item.title,
        series: item.series,
        issueNumber: item.issueNumber,
        tags: item.tags,
        onProgress: (statusText, percent) => {
          updateQueueItem(item.id, {
            status: 'extracting',
            progress: percent,
            statusMessage: statusText,
          });
        },
      });

      if (clientRes.success) {
        extractedSuccessfully = true;
      } else {
        updateQueueItem(item.id, {
          status: 'error',
          errorMessage: clientRes.error || 'An error occurred while processing the comic.',
        });
        return;
      }
    }

    if (!extractedSuccessfully) {
      updateQueueItem(item.id, {
        status: 'error',
        errorMessage: 'Could not process or save comic archive.',
      });
    } else {
      updateQueueItem(item.id, {
        status: 'success',
        progress: 100,
        statusMessage: 'Successfully completed!',
      });
      onSuccess();
    }
  };

  const processAllPending = async () => {
    const pendingItems = queue.filter((i) => i.status === 'pending');
    for (const item of pendingItems) {
      await startUpload(item);
    }
  };

  const removeItem = (id: string) => {
    setQueue((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-[#1a1a1a] comic-border overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#ED1D24] p-3 border-b-2 border-black flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-black text-[#FFD700] impact-text text-lg px-2 py-0.5 border border-white">
              {isConfiguringMerge ? 'MERGE ARCHIVES' : 'UPLOAD ARCHIVE'}
            </span>
            <h2 className="impact-text text-xl text-white tracking-wide">
              {isConfiguringMerge ? 'COMBINE MULTIPLE ISSUES' : 'ADD DIGITAL COMICS TO YOUR VAULT'}
            </h2>
          </div>
          <button
            onClick={() => setUploadModalOpen(false)}
            className="p-1 bg-black text-white hover:bg-[#FFD700] hover:text-black border border-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* STEP 1: MULTI-FILE MERGE PROMPT */}
          {showMergePrompt && pendingMultiFiles && (
            <div className="bg-black comic-border p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-[#ED1D24] text-[#FFD700] flex items-center justify-center mx-auto border-2 border-black shadow-[3px_3px_0px_#FFD700]">
                <Layers className="w-6 h-6" />
              </div>

              <div>
                <h3 className="impact-text text-2xl text-white tracking-wider">
                  YOU UPLOADED {pendingMultiFiles.length} ARCHIVE FILES
                </h3>
                <p className="text-gray-300 text-xs mt-1">
                  Would you like to combine them into a single continuous comic book or upload as separate comics?
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  onClick={handleChooseMerge}
                  className="bg-[#ED1D24] hover:bg-red-700 text-white impact-text text-base p-3 border-2 border-black shadow-[3px_3px_0px_#FFD700] flex items-center justify-center gap-2 cursor-pointer active:translate-x-0.5"
                >
                  <Layers className="w-5 h-5 text-[#FFD700]" />
                  <span>MERGE INTO ONE BOOK</span>
                </button>

                <button
                  onClick={handleChooseSeparate}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white impact-text text-base p-3 border-2 border-black shadow-[3px_3px_0px_#000] flex items-center justify-center gap-2 cursor-pointer active:translate-x-0.5"
                >
                  <UploadCloud className="w-5 h-5 text-[#FFD700]" />
                  <span>UPLOAD AS SEPARATE COMICS</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: MERGED BOOK CONFIGURATION VIEW */}
          {isConfiguringMerge && (
            <div className="space-y-4">
              {mergeSuccess ? (
                <div className="bg-black comic-border p-8 text-center space-y-4">
                  <CheckCircle2 className="w-16 h-16 text-[#00FF00] mx-auto animate-bounce" />
                  <h3 className="impact-text text-3xl text-white tracking-wider">
                    SUCCESSFULLY MERGED & SAVED!
                  </h3>
                  <p className="text-gray-300 text-sm">
                    {mergeItems.length} issues have been concatenated into <strong>{mergeTitle}</strong>.
                  </p>
                  <button
                    onClick={() => {
                      setIsConfiguringMerge(false);
                      setPendingMultiFiles(null);
                      setUploadModalOpen(false);
                    }}
                    className="bg-[#FFD700] hover:bg-amber-400 text-black impact-text text-lg px-6 py-2 border-2 border-black shadow-[3px_3px_0px_#000] cursor-pointer"
                  >
                    VIEW IN LIBRARY
                  </button>
                </div>
              ) : (
                <>
                  <div className="bg-black p-4 border-2 border-white/20 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="impact-text text-xs text-[#FFD700] block mb-1">
                          BOOK TITLE
                        </label>
                        <input
                          type="text"
                          value={mergeTitle}
                          onChange={(e) => setMergeTitle(e.target.value)}
                          placeholder="Combined Book Title..."
                          className="w-full bg-[#1a1a1a] border border-white/30 p-2 text-white font-bold text-sm"
                        />
                      </div>
                      <div>
                        <label className="impact-text text-xs text-[#FFD700] block mb-1">
                          TAGS
                        </label>
                        <input
                          type="text"
                          value={mergeTags}
                          onChange={(e) => setMergeTags(e.target.value)}
                          placeholder="Action, Superhero, Merged"
                          className="w-full bg-[#1a1a1a] border border-white/30 p-2 text-white font-bold text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-b border-white/20 pb-1">
                      <span className="impact-text text-sm text-white">
                        ISSUE SEQUENCE ({mergeItems.length} FILES)
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">
                        Re-order issues using arrows to fix sequence
                      </span>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {mergeItems.map((item, idx) => (
                        <div
                          key={item.id}
                          className="bg-black p-2.5 border border-white/20 flex items-center justify-between gap-3"
                        >
                          {/* Move Handles */}
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="bg-[#ED1D24] text-white text-xs impact-text px-2 py-1 border border-black min-w-[28px] text-center">
                              #{idx + 1}
                            </span>
                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                disabled={idx === 0 || isMerging}
                                onClick={() => moveMergeItem(idx, idx - 1)}
                                className="p-0.5 bg-zinc-800 hover:bg-[#FFD700] hover:text-black text-white disabled:opacity-30 cursor-pointer"
                              >
                                <ChevronUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === mergeItems.length - 1 || isMerging}
                                onClick={() => moveMergeItem(idx, idx + 1)}
                                className="p-0.5 bg-zinc-800 hover:bg-[#FFD700] hover:text-black text-white disabled:opacity-30 cursor-pointer"
                              >
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Label input */}
                          <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                            <input
                              type="text"
                              value={item.label}
                              onChange={(e) => {
                                const val = e.target.value;
                                setMergeItems((prev) =>
                                  prev.map((i) => (i.id === item.id ? { ...i, label: val } : i))
                                );
                              }}
                              placeholder={`Issue ${idx + 1}`}
                              className="bg-[#1a1a1a] border border-white/30 px-2 py-1 text-xs text-[#FFD700] font-bold"
                            />
                            <div className="text-xs text-gray-300 truncate font-mono">
                              {item.file.name}{' '}
                              <span className="text-[10px] text-gray-500">
                                ({(item.file.size / (1024 * 1024)).toFixed(1)} MB)
                              </span>
                            </div>
                          </div>

                          {/* Remove button */}
                          <button
                            type="button"
                            disabled={isMerging}
                            onClick={() => removeMergeItem(item.id)}
                            className="text-gray-400 hover:text-red-400 p-1 shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {mergeError && (
                    <div className="p-3 bg-red-950 border border-red-800 text-red-200 text-xs font-mono">
                      {mergeError}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <button
                      type="button"
                      disabled={isMerging}
                      onClick={() => {
                        setIsConfiguringMerge(false);
                        setPendingMultiFiles(null);
                      }}
                      className="bg-zinc-800 hover:bg-zinc-700 text-white impact-text text-xs px-4 py-2 border border-black cursor-pointer"
                    >
                      CANCEL
                    </button>

                    <button
                      type="button"
                      disabled={isMerging || !mergeTitle.trim()}
                      onClick={startMergedUpload}
                      className="bg-[#ED1D24] hover:bg-red-700 text-white impact-text text-sm px-6 py-2 border-2 border-black shadow-[3px_3px_0px_#FFD700] flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isMerging ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-[#FFD700]" />
                          <span>{mergeStepStatus || 'EXTRACTING & CONCATENATING...'}</span>
                        </>
                      ) : (
                        <>
                          <Layers className="w-4 h-4 text-[#FFD700]" />
                          <span>MERGE & EXTRACT BOOK</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Standard Dropzone (Visible when not prompting/configuring merge) */}
          {!showMergePrompt && !isConfiguringMerge && (
            <>
              {fileValidationError && (
                <div className="bg-red-950/90 border-2 border-red-600 p-3 text-red-200 text-xs font-mono flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{fileValidationError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFileValidationError(null)}
                    className="text-gray-400 hover:text-white font-bold px-1"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`comic-border p-6 text-center cursor-pointer transition-all border-dashed ${
                  isDragging
                    ? 'bg-[#FFD700]/20 border-[#FFD700]'
                    : 'bg-black hover:border-[#ED1D24]'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    handleFileSelect(e.target.files);
                    if (e.target) e.target.value = '';
                  }}
                  multiple
                  accept={acceptExtensions}
                  className="hidden"
                />
                <UploadCloud className="w-10 h-10 mx-auto text-[#ED1D24] mb-2 animate-bounce" />
                <h3 className="impact-text text-2xl text-white tracking-wider">
                  DRAG & DROP COMIC ARCHIVES HERE
                </h3>
                <p className="impact-text text-xs text-[#FFD700] tracking-wider mt-1">
                  SUPPORTS: CBZ (ZIP) • CBR (RAR) • CB7 (7Z) • CBT (TAR) • CBA (ACE)
                </p>
                <p className="text-gray-300 text-xs mt-2 font-mono">
                  Select multiple files to merge them into a single volume automatically!
                </p>
              </div>

              {/* Upload Queue Items */}
              {queue.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-white/20 pb-2">
                    <span className="impact-text text-sm text-white">
                      UPLOAD QUEUE ({queue.length})
                    </span>
                    <button
                      onClick={processAllPending}
                      disabled={!queue.some((i) => i.status === 'pending')}
                      className="bg-[#FFD700] hover:bg-amber-400 text-black impact-text text-xs px-3 py-1 border border-black shadow-[2px_2px_0px_#000] disabled:opacity-50 cursor-pointer"
                    >
                      EXTRACT & SAVE ALL
                    </button>
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {queue.map((item) => (
                      <div
                        key={item.id}
                        className="bg-black p-3 border-2 border-white/20 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 truncate">
                            <FileText className="w-4 h-4 text-[#ED1D24] shrink-0" />
                            <span className="font-bold text-xs text-white truncate">
                              {item.file.name}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono">
                              ({(item.file.size / (1024 * 1024)).toFixed(1)} MB)
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {item.status === 'pending' && (
                              <button
                                onClick={() => startUpload(item)}
                                className="bg-[#ED1D24] text-white text-[10px] impact-text px-2 py-0.5 border border-black cursor-pointer"
                              >
                                Extract Now
                              </button>
                            )}
                            {item.status === 'extracting' && (
                              <span className="text-xs impact-text text-[#FFD700] flex items-center gap-1">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting...
                              </span>
                            )}
                            {item.status === 'success' && (
                              <span className="text-xs impact-text text-[#00FF00] flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Ready!
                              </span>
                            )}
                            {item.status === 'error' && (
                              <span className="text-xs impact-text text-red-400 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" /> Error
                              </span>
                            )}
                            <button
                              onClick={() => removeItem(item.id)}
                              className="text-gray-400 hover:text-white text-xs cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Form fields for custom metadata */}
                        {item.status === 'pending' && (
                          <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-white/10">
                            <input
                              type="text"
                              placeholder="Comic Title"
                              value={item.title}
                              onChange={(e) => updateQueueItem(item.id, { title: e.target.value })}
                              className="bg-[#1a1a1a] border border-white/30 p-1 text-white font-bold"
                            />
                            <input
                              type="text"
                              placeholder="Series / Tags (e.g. Action, Superhero)"
                              value={item.tags}
                              onChange={(e) => updateQueueItem(item.id, { tags: e.target.value })}
                              className="bg-[#1a1a1a] border border-white/30 p-1 text-white font-bold"
                            />
                          </div>
                        )}

                        {/* Progress Bar & Status Text */}
                        {(item.status === 'uploading' || item.status === 'extracting') && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-amber-300 font-mono font-medium">
                              <span>
                                {item.statusMessage ||
                                  (item.status === 'extracting' ? 'Extracting pages...' : 'Uploading...')}
                              </span>
                              <span>{item.progress}%</span>
                            </div>
                            <div className="h-2 w-full bg-zinc-800 overflow-hidden border border-black">
                              <div
                                className="h-full bg-[#FFD700] transition-all duration-300"
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Error message */}
                        {item.status === 'error' && item.errorMessage && (
                          <div className="p-2 bg-red-950 border border-red-800 text-red-200 text-xs font-mono">
                            {item.errorMessage}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-black p-3 border-t-2 border-white/20 flex justify-between items-center">
          <span className="text-xs text-gray-400 font-mono">
            User Vault: <strong className="text-white">{currentUser.name}</strong>
          </span>
          <button
            onClick={() => setUploadModalOpen(false)}
            className="bg-zinc-800 hover:bg-zinc-700 text-white impact-text text-xs px-4 py-1.5 border border-black cursor-pointer"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
