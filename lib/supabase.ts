import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { cleanComicTitle } from './utils';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'comic-vault';

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY));
}

let supabaseAdminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;

  if (!supabaseAdminClient) {
    const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY!;
    supabaseAdminClient = createClient(SUPABASE_URL!, key, {
      auth: { persistSession: false },
    });
  }

  return supabaseAdminClient;
}

export function getStorageBucketName(): string {
  return BUCKET_NAME;
}

/**
 * Ensures the storage bucket exists (creates if missing & public).
 */
export async function ensureBucketExists(): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === BUCKET_NAME);

    if (!exists) {
      await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 524288000, // 500MB limit
      });
    } else {
      try {
        await supabase.storage.updateBucket(BUCKET_NAME, {
          public: true,
          fileSizeLimit: 524288000,
        });
      } catch (e) {
        // Ignored if updateBucket is restricted
      }
    }
  } catch (err) {
    console.warn('Failed to check or create/update Supabase bucket:', err);
  }
}

/**
 * Generates a public CDN URL or fallback storage route URL for a key.
 */
export function getPublicCdnUrl(key: string): string {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(key);
      if (data?.publicUrl) return data.publicUrl;
    }
  }
  return `/api/storage/file?key=${encodeURIComponent(key)}`;
}

/**
 * Generates a Direct Signed Upload URL for client-side Direct Uploads to Supabase.
 */
export async function createPresignedUploadUrl(
  key: string,
  contentTypeOrExpires?: string | number,
  expiresInSeconds: number = 3600
): Promise<{ uploadUrl: string; fileKey: string; token?: string; isCloud: boolean }> {
  const expires = typeof contentTypeOrExpires === 'number' ? contentTypeOrExpires : expiresInSeconds;
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    // Local fallback route for dev environment
    return {
      uploadUrl: `/api/upload/direct-file?key=${encodeURIComponent(key)}`,
      fileKey: key,
      isCloud: false,
    };
  }

  await ensureBucketExists();

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(key, { upsert: true });

  if (error || !data) {
    console.warn('Supabase createSignedUploadUrl error, falling back to local route:', error);
    return {
      uploadUrl: `/api/upload/direct-file?key=${encodeURIComponent(key)}`,
      fileKey: key,
      isCloud: false,
    };
  }

  return {
    uploadUrl: data.signedUrl,
    token: data.token,
    fileKey: key,
    isCloud: true,
  };
}

/**
 * Uploads a Buffer server-side to Supabase Storage.
 */
export async function uploadBufferToCloud(
  key: string,
  buffer: Buffer,
  contentType: string = 'image/jpeg'
): Promise<string> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    throw new Error('Supabase Storage is not configured.');
  }

  await ensureBucketExists();

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(key, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Supabase Storage upload error for ${key}: ${error.message}`);
  }

  return getPublicCdnUrl(key);
}

/**
 * Downloads a file Buffer from Supabase Storage.
 */
export async function getBufferFromCloud(key: string): Promise<Buffer> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    throw new Error('Supabase Storage is not configured.');
  }

  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(key);

  if (error || !data) {
    throw new Error(`Supabase Storage download error for ${key}: ${error?.message || 'File not found'}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Permanently deletes objects or folders from Supabase Storage.
 */
export async function deleteObjectsFromCloud(keys: string[]): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase || keys.length === 0) return;

  try {
    await supabase.storage.from(BUCKET_NAME).remove(keys);
  } catch (err) {
    console.warn('Failed to delete objects from Supabase Storage:', keys, err);
  }
}

/**
 * Permanently deletes all files under a prefix path in Supabase Storage.
 */
export async function deleteFolderFromCloud(folderPrefix: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  try {
    const { data: files } = await supabase.storage.from(BUCKET_NAME).list(folderPrefix, { limit: 1000 });
    if (files && files.length > 0) {
      const keys = files.map((f) => `${folderPrefix}/${f.name}`);
      await supabase.storage.from(BUCKET_NAME).remove(keys);
    }
  } catch (err) {
    console.warn('Failed to delete folder from Supabase Storage:', folderPrefix, err);
  }
}

// ----------------------------------------------------------------------
// Supabase SQL Database Operations (comics, comic_pages, reading_progress)
// ----------------------------------------------------------------------

export function mapSupabaseRowToComic(row: any) {
  let parsedIssues: any = undefined;
  if (row.issues) {
    if (Array.isArray(row.issues)) {
      parsedIssues = row.issues;
    } else if (typeof row.issues === 'string') {
      try {
        parsedIssues = JSON.parse(row.issues);
      } catch (e) {
        console.warn('Failed to parse issues JSON string from Supabase row:', e);
      }
    } else if (typeof row.issues === 'object') {
      parsedIssues = row.issues;
    }
  }

  const cleanedTitle = cleanComicTitle(row.title) || 'Untitled Comic';
  const cleanedSeries = cleanComicTitle(row.series) || cleanedTitle;

  return {
    id: row.id,
    userId: row.user_id || row.userId || 'user_peter',
    title: cleanedTitle,
    series: cleanedSeries,
    issueNumber: row.issue_number ?? row.issueNumber ?? undefined,
    originalFilename: row.original_filename || row.originalFilename || `${row.title || 'comic'}.cbz`,
    format: row.format || 'CBZ',
    coverImageUrl: row.cover_image_url || row.coverImageUrl || '',
    pageCount: row.page_count ?? row.pageCount ?? 0,
    fileSizeBytes: row.file_size_bytes ?? row.fileSizeBytes ?? 0,
    tags: Array.isArray(row.tags)
      ? row.tags
      : typeof row.tags === 'string'
      ? row.tags.split(',').map((t: string) => t.trim())
      : ['Action'],
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
    isMerged: row.is_merged ?? row.isMerged ?? false,
    issues: parsedIssues,
  };
}

export function mapSupabaseRowToPage(row: any) {
  return {
    id: row.id,
    comicId: row.comic_id || row.comicId,
    pageNumber: row.page_number ?? row.pageNumber,
    filename: row.filename,
    imageUrl: row.image_url || row.imageUrl,
    issueIndex: row.issue_index ?? row.issueIndex,
    issuePageNumber: row.issue_page_number ?? row.issuePageNumber,
    issueLabel: row.issue_label || row.issueLabel,
  };
}

export function mapSupabaseRowToProgress(row: any) {
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    comicId: row.comic_id || row.comicId,
    currentPage: row.current_page ?? row.currentPage ?? 1,
    totalPages: row.total_pages ?? row.totalPages ?? 1,
    completed: row.completed ?? false,
    lastReadAt: row.last_read_at || row.lastReadAt || new Date().toISOString(),
    activeIssueId: row.active_issue_id || row.activeIssueId,
    activeIssueIndex: row.active_issue_index ?? row.activeIssueIndex,
  };
}

/**
 * Inserts/Upserts comic record into Supabase 'comics' table.
 */
export async function saveComicToSupabase(comic: any, pages: any[], progress?: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Supabase client is not configured. Please check environment variables.');
  }

  const cleanTitle = cleanComicTitle(comic.title) || 'Untitled Comic';
  const cleanSeries = cleanComicTitle(comic.series) || cleanTitle;

  // 1. Insert comic row into Supabase 'comics' table
  const snakeComic = {
    id: comic.id,
    user_id: comic.userId,
    title: cleanTitle,
    series: cleanSeries,
    issue_number: comic.issueNumber ?? null,
    original_filename: comic.originalFilename,
    format: comic.format,
    cover_image_url: comic.coverImageUrl,
    page_count: comic.pageCount,
    file_size_bytes: comic.fileSizeBytes,
    tags: comic.tags,
    is_merged: comic.isMerged || false,
    issues: comic.issues ? (typeof comic.issues === 'string' ? comic.issues : JSON.stringify(comic.issues)) : null,
    created_at: comic.createdAt,
    updated_at: comic.updatedAt,
  };

  let { error: comicErr } = await supabase.from('comics').upsert(snakeComic);

  if (comicErr) {
    console.warn('Supabase comics upsert (snake_case) notice:', comicErr.message);

    // Fallback 1: Try without optional 'issues' / 'is_merged' columns if they don't exist in Supabase schema
    const fallbackComic = {
      id: comic.id,
      user_id: comic.userId,
      title: comic.title,
      series: comic.series || comic.title,
      issue_number: comic.issueNumber ?? null,
      original_filename: comic.originalFilename,
      format: comic.format,
      cover_image_url: comic.coverImageUrl,
      page_count: comic.pageCount,
      file_size_bytes: comic.fileSizeBytes,
      tags: Array.isArray(comic.tags) ? comic.tags.join(',') : comic.tags,
      created_at: comic.createdAt,
    };

    const { error: fallbackErr } = await supabase.from('comics').upsert(fallbackComic);

    if (fallbackErr) {
      console.warn('Supabase comics fallback upsert notice:', fallbackErr.message);

      // Fallback 2: Try camelCase
      const camelComic = {
        id: comic.id,
        userId: comic.userId,
        title: comic.title,
        series: comic.series || comic.title,
        issueNumber: comic.issueNumber ?? null,
        originalFilename: comic.originalFilename,
        format: comic.format,
        coverImageUrl: comic.coverImageUrl,
        pageCount: comic.pageCount,
        fileSizeBytes: comic.fileSizeBytes,
        tags: comic.tags,
        createdAt: comic.createdAt,
      };

      const { error: camelErr } = await supabase.from('comics').upsert(camelComic);
      if (camelErr) {
        console.warn('Supabase INSERT into comics table failed (will keep in local db):', comicErr.message, fallbackErr.message, camelErr.message);
      }
    }
  }

  // 2. Insert pages if available
  if (pages && pages.length > 0) {
    const snakePages = pages.map((p) => ({
      id: p.id,
      comic_id: p.comicId,
      page_number: p.pageNumber,
      filename: p.filename,
      image_url: p.imageUrl,
      issue_index: p.issueIndex ?? null,
      issue_page_number: p.issuePageNumber ?? null,
      issue_label: p.issueLabel ?? null,
    }));

    const { error: pagesErr } = await supabase.from('comic_pages').upsert(snakePages);
    if (pagesErr) {
      try {
        await supabase.from('pages').upsert(snakePages);
      } catch (e) {
        console.warn('Pages fallback upsert notice:', e);
      }
    }
  }

  // 3. Insert initial reading progress
  const initProg = progress || {
    id: `prog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: comic.userId,
    comicId: comic.id,
    currentPage: 1,
    totalPages: comic.pageCount,
    completed: false,
    lastReadAt: new Date().toISOString(),
  };

  const snakeProg = {
    id: initProg.id,
    user_id: initProg.userId,
    comic_id: initProg.comicId,
    current_page: initProg.currentPage,
    total_pages: initProg.totalPages,
    completed: initProg.completed,
    last_read_at: initProg.lastReadAt,
    active_issue_id: initProg.activeIssueId ?? null,
    active_issue_index: initProg.activeIssueIndex ?? null,
  };

  const { error: progErr } = await supabase.from('reading_progress').upsert(snakeProg);
  if (progErr) {
    try {
      await supabase.from('progress').upsert(snakeProg);
    } catch (e) {
      console.warn('Progress fallback upsert notice:', e);
    }
  }
}

/**
 * Queries the Supabase 'comics' table directly (`supabase.from('comics').select('*')`).
 */
export async function getComicsFromSupabase(userId: string): Promise<{ comic: any; progress?: any }[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data: comicsData, error: comicsErr } = await supabase.from('comics').select('*');

  if (comicsErr) {
    throw new Error(`Failed to query Supabase 'comics' table: ${comicsErr.message}`);
  }

  if (!comicsData || comicsData.length === 0) {
    return [];
  }

  let progressList: any[] = [];
  try {
    const { data: progData } = await supabase.from('reading_progress').select('*').eq('user_id', userId);
    if (progData) {
      progressList = progData.map(mapSupabaseRowToProgress);
    } else {
      const { data: progData2 } = await supabase.from('progress').select('*').eq('user_id', userId);
      if (progData2) progressList = progData2.map(mapSupabaseRowToProgress);
    }
  } catch (e) {
    console.warn('Progress query notice:', e);
  }

  return comicsData.map((row) => {
    const comic = mapSupabaseRowToComic(row);
    const prog = progressList.find((p) => p.comicId === comic.id);
    return { comic, progress: prog };
  });
}

/**
 * Queries comic details & pages from Supabase.
 */
export async function getComicByIdFromSupabase(id: string, userId: string): Promise<{ comic: any; pages: any[]; progress?: any } | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: comicRows, error: comicErr } = await supabase.from('comics').select('*').eq('id', id);

  if (comicErr || !comicRows || comicRows.length === 0) {
    return null;
  }

  const comic = mapSupabaseRowToComic(comicRows[0]);

  let pages: any[] = [];
  const { data: pageRows } = await supabase
    .from('comic_pages')
    .select('*')
    .eq('comic_id', id)
    .order('page_number', { ascending: true });

  if (pageRows && pageRows.length > 0) {
    pages = pageRows.map(mapSupabaseRowToPage);
  } else {
    const { data: pageRows2 } = await supabase
      .from('pages')
      .select('*')
      .eq('comic_id', id)
      .order('page_number', { ascending: true });
    if (pageRows2 && pageRows2.length > 0) {
      pages = pageRows2.map(mapSupabaseRowToPage);
    }
  }

  if (pages.length === 0 && comic.pageCount > 0) {
    for (let p = 1; p <= comic.pageCount; p++) {
      const pageKey = `comics/${id}/pages/p${String(p).padStart(3, '0')}.webp`;
      pages.push({
        id: `page_${id}_${p}`,
        comicId: id,
        pageNumber: p,
        filename: `p${String(p).padStart(3, '0')}.webp`,
        imageUrl: getPublicCdnUrl(pageKey),
      });
    }
  }

  let progress: any = undefined;
  try {
    const { data: progRows } = await supabase
      .from('reading_progress')
      .select('*')
      .eq('comic_id', id)
      .eq('user_id', userId);

    if (progRows && progRows.length > 0) {
      progress = mapSupabaseRowToProgress(progRows[0]);
    }
  } catch (e) {
    console.warn('Progress query notice:', e);
  }

  return { comic, pages, progress };
}

/**
 * Permanently deletes comic record from Supabase 'comics' table.
 */
export async function deleteComicFromSupabase(id: string, userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { error } = await supabase.from('comics').delete().eq('id', id);
  if (error) {
    console.warn('Failed to delete from Supabase comics table:', error.message);
  }

  try { await supabase.from('comic_pages').delete().eq('comic_id', id); } catch {}
  try { await supabase.from('pages').delete().eq('comic_id', id); } catch {}
  try { await supabase.from('reading_progress').delete().eq('comic_id', id); } catch {}
  try { await supabase.from('progress').delete().eq('comic_id', id); } catch {}

  return true;
}

/**
 * Updates reading progress in Supabase 'reading_progress' table.
 */
export async function updateProgressInSupabase(
  userId: string,
  comicId: string,
  currentPage: number,
  totalPages: number,
  activeIssueId?: string,
  activeIssueIndex?: number
): Promise<any> {
  const supabase = getSupabaseAdmin();
  const prog = {
    id: `prog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId,
    comicId,
    currentPage: Math.min(Math.max(1, currentPage), totalPages),
    totalPages,
    completed: currentPage >= totalPages,
    lastReadAt: new Date().toISOString(),
    activeIssueId,
    activeIssueIndex,
  };

  if (!supabase) return prog;

  const snakeProg = {
    id: prog.id,
    user_id: userId,
    comic_id: comicId,
    current_page: prog.currentPage,
    total_pages: totalPages,
    completed: prog.completed,
    last_read_at: prog.lastReadAt,
    active_issue_id: activeIssueId ?? null,
    active_issue_index: activeIssueIndex ?? null,
  };

  const { error: err1 } = await supabase.from('reading_progress').upsert(snakeProg);
  if (err1) {
    try {
      await supabase.from('progress').upsert(snakeProg);
    } catch {}
  }

  return prog;
}

/**
 * Queries collections from Supabase 'collections' table.
 */
export async function getCollectionsFromSupabase(userId: string): Promise<any[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  try {
    const { data } = await supabase.from('collections').select('*').eq('user_id', userId);
    if (!data) return [];
    return data.map((c: any) => ({
      id: c.id,
      userId: c.user_id || c.userId,
      name: c.name,
      color: c.color || '#ED1D24',
      comicIds: Array.isArray(c.comic_ids) ? c.comic_ids : typeof c.comic_ids === 'string' ? JSON.parse(c.comic_ids) : [],
      createdAt: c.created_at || c.createdAt || new Date().toISOString(),
    }));
  } catch (err) {
    console.warn('Supabase getCollectionsFromSupabase failed:', err);
    return [];
  }
}

/**
 * Saves/Upserts collection to Supabase 'collections' table.
 */
export async function saveCollectionToSupabase(col: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  try {
    const snakeCol = {
      id: col.id,
      user_id: col.userId,
      name: col.name,
      color: col.color,
      comic_ids: col.comicIds,
      created_at: col.createdAt,
    };
    await supabase.from('collections').upsert(snakeCol);
  } catch (err) {
    console.warn('Supabase saveCollectionToSupabase failed:', err);
  }
}

/**
 * Toggles comic in collection in Supabase 'collections' table.
 */
export async function toggleComicInCollectionInSupabase(userId: string, collectionId: string, comicId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  try {
    const { data } = await supabase.from('collections').select('*').eq('id', collectionId);
    if (data && data.length > 0) {
      const col = data[0];
      let comicIds: string[] = Array.isArray(col.comic_ids) ? col.comic_ids : typeof col.comic_ids === 'string' ? JSON.parse(col.comic_ids) : [];
      if (comicIds.includes(comicId)) {
        comicIds = comicIds.filter((id) => id !== comicId);
      } else {
        comicIds.push(comicId);
      }
      await supabase.from('collections').update({ comic_ids: comicIds }).eq('id', collectionId);
      return true;
    }
  } catch (err) {
    console.warn('Supabase toggleComicInCollectionInSupabase failed:', err);
  }
  return false;
}

