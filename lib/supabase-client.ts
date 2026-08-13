import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Comic, ComicPage, ReadingProgress, Collection } from './types';
import { cleanComicTitle } from './utils';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'comic-vault';

let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!clientInstance) {
    clientInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  }
  return clientInstance;
}

export function getStorageBucketName(): string {
  return BUCKET_NAME;
}

/**
 * Generates a public CDN URL directly from Supabase Storage client.
 */
export function getPublicCdnUrl(key: string): string {
  if (!key) return '';
  if (key.startsWith('http://') || key.startsWith('https://') || key.startsWith('data:')) {
    return key;
  }
  try {
    const supabase = getSupabaseClient();
    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(key);
    if (data?.publicUrl) {
      return data.publicUrl;
    }
  } catch (e) {
    console.warn('Failed to get public URL for key:', key, e);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${key}`;
}

/**
 * Resolves a local API path to absolute URL if needed.
 */
export function getApiUrl(path: string): string {
  if (typeof window === 'undefined') return path;

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const isCloudRunHost = window.location.origin.includes('run.app');
  const isLocalhostDesktop =
    window.location.origin.includes('localhost') &&
    typeof navigator !== 'undefined' &&
    !/android|iphone|ipad|ipod/i.test(navigator.userAgent);

  const useAbsoluteUrl = !isCloudRunHost && !isLocalhostDesktop;

  if (useAbsoluteUrl) {
    const apiBase =
      process.env.NEXT_PUBLIC_API_URL || 'https://ais-pre-hkw55df4jp43rl7wxo6dze-69773141109.europe-west3.run.app';
    return `${apiBase}${cleanPath}`;
  }

  return path;
}

// ----------------------------------------------------------------------
// Data Mappers (snake_case database columns -> camelCase TypeScript objects)
// ----------------------------------------------------------------------

export function mapRowToComic(row: any): Comic {
  let parsedIssues: any = undefined;
  if (row.issues) {
    if (Array.isArray(row.issues)) {
      parsedIssues = row.issues;
    } else if (typeof row.issues === 'string') {
      try {
        parsedIssues = JSON.parse(row.issues);
      } catch (e) {}
    } else if (typeof row.issues === 'object') {
      parsedIssues = row.issues;
    }
  }

  let coverUrl = row.cover_image_url || row.coverImageUrl || '';
  if (coverUrl && !coverUrl.startsWith('http://') && !coverUrl.startsWith('https://') && !coverUrl.startsWith('data:')) {
    coverUrl = getPublicCdnUrl(coverUrl);
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
    coverImageUrl: coverUrl,
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

export function mapRowToPage(row: any): ComicPage {
  let imgUrl = row.image_url || row.imageUrl || '';
  if (imgUrl && !imgUrl.startsWith('http://') && !imgUrl.startsWith('https://') && !imgUrl.startsWith('data:')) {
    imgUrl = getPublicCdnUrl(imgUrl);
  }

  return {
    id: row.id,
    comicId: row.comic_id || row.comicId,
    pageNumber: row.page_number ?? row.pageNumber,
    filename: row.filename,
    imageUrl: imgUrl,
    issueIndex: row.issue_index ?? row.issueIndex,
    issuePageNumber: row.issue_page_number ?? row.issuePageNumber,
    issueLabel: row.issue_label || row.issueLabel,
  };
}

export function mapRowToProgress(row: any): ReadingProgress {
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

// ----------------------------------------------------------------------
// Pure Client-side Supabase Database Operations
// ----------------------------------------------------------------------

/**
 * Client-side fetch library (comics, progress & collections) directly from Supabase.
 */
export async function fetchLibraryClient(
  userId: string,
  options?: { sortBy?: string; searchQuery?: string; selectedTag?: string | null; selectedCollectionId?: string | null }
): Promise<{ success: boolean; data: { comic: Comic; progress?: ReadingProgress }[]; collections: Collection[]; users?: any[] }> {
  try {
    const supabase = getSupabaseClient();

    // 1. Fetch comics for the active user directly from Supabase
    const { data: comicsData, error: comicsErr } = await supabase
      .from('comics')
      .select('*')
      .eq('user_id', userId);

    if (comicsErr) {
      console.error('Supabase direct comics query error:', comicsErr);
      return { success: false, data: [], collections: [] };
    }

    // 2. Fetch reading progress directly
    let progressList: ReadingProgress[] = [];
    const { data: progData, error: progErr } = await supabase
      .from('reading_progress')
      .select('*')
      .eq('user_id', userId);

    if (!progErr && progData) {
      progressList = progData.map(mapRowToProgress);
    }

    // 3. Fetch collections directly
    let collectionsData: Collection[] = [];
    const { data: colData, error: colErr } = await supabase
      .from('collections')
      .select('*')
      .eq('user_id', userId);

    if (!colErr && colData) {
      collectionsData = colData.map((c) => ({
        id: c.id,
        userId: c.user_id || c.userId,
        name: c.name,
        color: c.color || '#ED1D24',
        comicIds: Array.isArray(c.comic_ids)
          ? c.comic_ids
          : typeof c.comic_ids === 'string'
          ? JSON.parse(c.comic_ids)
          : [],
        createdAt: c.created_at || c.createdAt || new Date().toISOString(),
      }));
    }

    // Map comics + matching progress
    let mapped = (comicsData || []).map((row) => {
      const comic = mapRowToComic(row);
      const progress = progressList.find((p) => p.comicId === comic.id);
      return { comic, progress };
    });

    // Client-side search & filtering
    if (options?.searchQuery) {
      const q = options.searchQuery.toLowerCase();
      mapped = mapped.filter(
        (item) =>
          item.comic.title.toLowerCase().includes(q) ||
          (item.comic.series && item.comic.series.toLowerCase().includes(q))
      );
    }
    if (options?.selectedTag) {
      mapped = mapped.filter((item) => item.comic.tags && item.comic.tags.includes(options.selectedTag!));
    }
    if (options?.selectedCollectionId) {
      const col = collectionsData.find((c) => c.id === options.selectedCollectionId);
      if (col) {
        mapped = mapped.filter((item) => col.comicIds.includes(item.comic.id));
      }
    }

    // Client-side sorting
    const sortField = options?.sortBy || 'lastRead';
    mapped.sort((a, b) => {
      if (sortField === 'title') {
        return a.comic.title.localeCompare(b.comic.title);
      }
      if (sortField === 'createdAt') {
        return new Date(b.comic.createdAt).getTime() - new Date(a.comic.createdAt).getTime();
      }
      // Default: lastRead
      const aTime = a.progress?.lastReadAt ? new Date(a.progress.lastReadAt).getTime() : new Date(a.comic.createdAt).getTime();
      const bTime = b.progress?.lastReadAt ? new Date(b.progress.lastReadAt).getTime() : new Date(b.comic.createdAt).getTime();
      return bTime - aTime;
    });

    return { success: true, data: mapped, collections: collectionsData };
  } catch (err) {
    console.error('Failed to fetch library directly from Supabase:', err);
    return { success: false, data: [], collections: [] };
  }
}

/**
 * Client-side fetch comic details & pages directly from Supabase.
 */
export async function fetchComicDetailsClient(
  id: string,
  userId: string
): Promise<{ success: boolean; data?: { comic: Comic; pages: ComicPage[]; progress?: ReadingProgress } }> {
  try {
    const supabase = getSupabaseClient();

    // 1. Fetch comic
    const { data: comicRow, error: cErr } = await supabase.from('comics').select('*').eq('id', id).single();
    if (cErr || !comicRow) {
      console.error('Comic not found in Supabase:', id, cErr);
      return { success: false };
    }

    const comic = mapRowToComic(comicRow);

    // 2. Fetch pages
    let pages: ComicPage[] = [];
    const { data: pageRows } = await supabase
      .from('comic_pages')
      .select('*')
      .eq('comic_id', id)
      .order('page_number', { ascending: true });

    if (pageRows && pageRows.length > 0) {
      pages = pageRows.map(mapRowToPage);
    } else {
      const { data: pRows2 } = await supabase
        .from('pages')
        .select('*')
        .eq('comic_id', id)
        .order('page_number', { ascending: true });
      if (pRows2) pages = pRows2.map(mapRowToPage);
    }

    // 3. Fetch progress
    let progress: ReadingProgress | undefined;
    const { data: progRows } = await supabase
      .from('reading_progress')
      .select('*')
      .eq('comic_id', id)
      .eq('user_id', userId);

    if (progRows && progRows.length > 0) {
      progress = mapRowToProgress(progRows[0]);
    }

    return { success: true, data: { comic, pages, progress } };
  } catch (err) {
    console.error('Failed to fetch comic details directly from Supabase:', err);
    return { success: false };
  }
}

/**
 * Client-side update reading progress directly in Supabase.
 */
export async function updateProgressClient(
  userId: string,
  comicId: string,
  currentPage: number,
  totalPages: number,
  activeIssueId?: string,
  activeIssueIndex?: number
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();

    const { data: existing } = await supabase
      .from('reading_progress')
      .select('id')
      .eq('user_id', userId)
      .eq('comic_id', comicId)
      .maybeSingle();

    const snakeProg = {
      id: existing?.id || `prog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      user_id: userId,
      comic_id: comicId,
      current_page: Math.min(Math.max(1, currentPage), totalPages),
      total_pages: totalPages,
      completed: currentPage >= totalPages,
      last_read_at: new Date().toISOString(),
      active_issue_id: activeIssueId ?? null,
      active_issue_index: activeIssueIndex ?? null,
    };

    const { error } = await supabase.from('reading_progress').upsert(snakeProg);
    if (error) {
      console.error('Failed to update progress in Supabase:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to update progress in Supabase:', err);
    return false;
  }
}

/**
 * Client-side create collection directly in Supabase.
 */
export async function createCollectionClient(
  userId: string,
  name: string,
  color: string = '#ED1D24'
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const colId = `col_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newCol = {
      id: colId,
      user_id: userId,
      name,
      color,
      comic_ids: [],
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('collections').upsert(newCol);
    if (error) {
      console.error('Failed to create collection in Supabase:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to create collection in Supabase:', err);
    return false;
  }
}

/**
 * Client-side toggle comic in collection directly in Supabase.
 */
export async function toggleComicInCollectionClient(
  userId: string,
  collectionId: string,
  comicId: string
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data: cols } = await supabase.from('collections').select('*').eq('id', collectionId);

    if (cols && cols.length > 0) {
      const col = cols[0];
      let comicIds: string[] = Array.isArray(col.comic_ids)
        ? col.comic_ids
        : typeof col.comic_ids === 'string'
        ? JSON.parse(col.comic_ids)
        : [];

      if (comicIds.includes(comicId)) {
        comicIds = comicIds.filter((id) => id !== comicId);
      } else {
        comicIds.push(comicId);
      }

      const { error } = await supabase.from('collections').update({ comic_ids: comicIds }).eq('id', collectionId);
      if (error) {
        console.error('Failed to toggle collection in Supabase:', error);
        return false;
      }
      return true;
    }
    return false;
  } catch (err) {
    console.error('Failed to toggle collection in Supabase:', err);
    return false;
  }
}

/**
 * Client-side delete comic directly in Supabase.
 */
export async function deleteComicClient(comicId: string, userId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('comics').delete().eq('id', comicId);
    try { await supabase.from('comic_pages').delete().eq('comic_id', comicId); } catch {}
    try { await supabase.from('pages').delete().eq('comic_id', comicId); } catch {}
    try { await supabase.from('reading_progress').delete().eq('comic_id', comicId); } catch {}
    try { await supabase.from('progress').delete().eq('comic_id', comicId); } catch {}

    // Storage files cleanup
    try {
      const folder = `comics/${comicId}`;
      const { data: list } = await supabase.storage.from(BUCKET_NAME).list(folder);
      if (list && list.length > 0) {
        const keys = list.map((item) => `${folder}/${item.name}`);
        await supabase.storage.from(BUCKET_NAME).remove(keys);
      }
      const { data: pagesList } = await supabase.storage.from(BUCKET_NAME).list(`${folder}/pages`);
      if (pagesList && pagesList.length > 0) {
        const pageKeys = pagesList.map((item) => `${folder}/pages/${item.name}`);
        await supabase.storage.from(BUCKET_NAME).remove(pageKeys);
      }
    } catch (stErr) {
      console.warn('Supabase storage cleanup notice:', stErr);
    }

    return true;
  } catch (err) {
    console.error('Failed to delete comic directly in Supabase:', err);
    return false;
  }
}

/**
 * Client-side sample comic loader (works without backend Node server).
 */
export async function loadSampleComicsClient(userId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();

    const samples = [
      {
        id: `sample_spidey_${Date.now()}_1`,
        user_id: userId,
        title: 'The Amazing Spider-Man #300',
        series: 'The Amazing Spider-Man',
        issue_number: 300,
        original_filename: 'Amazing_Spider-Man_300.cbz',
        format: 'CBZ',
        cover_image_url: 'https://images.unsplash.com/photo-1604200213928-ba3cf4fc8436?auto=format&fit=crop&w=600&q=80',
        page_count: 4,
        file_size_bytes: 12500000,
        tags: ['Spider-Man', 'Venom', 'Classic', 'Action'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: `sample_xmen_${Date.now()}_2`,
        user_id: userId,
        title: 'X-Men #1',
        series: 'X-Men',
        issue_number: 1,
        original_filename: 'X-Men_001.cbz',
        format: 'CBZ',
        cover_image_url: 'https://images.unsplash.com/photo-1568832359672-e36cf5d74f54?auto=format&fit=crop&w=600&q=80',
        page_count: 4,
        file_size_bytes: 18200000,
        tags: ['Mutants', 'Wolverine', 'Magneto', 'Action'],
        created_at: new Date(Date.now() - 3600000).toISOString(),
        updated_at: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: `sample_ironman_${Date.now()}_3`,
        user_id: userId,
        title: 'Iron Man: Extremis #1',
        series: 'Iron Man',
        issue_number: 1,
        original_filename: 'Iron_Man_Extremis_01.cbr',
        format: 'CBR',
        cover_image_url: 'https://images.unsplash.com/photo-1635863138275-d9b33299680b?auto=format&fit=crop&w=600&q=80',
        page_count: 4,
        file_size_bytes: 15400000,
        tags: ['Iron Man', 'Avengers', 'Sci-Fi'],
        created_at: new Date(Date.now() - 7200000).toISOString(),
        updated_at: new Date(Date.now() - 7200000).toISOString(),
      },
    ];

    for (const sample of samples) {
      await supabase.from('comics').upsert(sample);

      const pages = [
        {
          id: `page_${sample.id}_1`,
          comic_id: sample.id,
          page_number: 1,
          filename: '001.jpg',
          image_url: sample.cover_image_url,
        },
        {
          id: `page_${sample.id}_2`,
          comic_id: sample.id,
          page_number: 2,
          filename: '002.jpg',
          image_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80',
        },
        {
          id: `page_${sample.id}_3`,
          comic_id: sample.id,
          page_number: 3,
          filename: '003.jpg',
          image_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
        },
        {
          id: `page_${sample.id}_4`,
          comic_id: sample.id,
          page_number: 4,
          filename: '004.jpg',
          image_url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80',
        },
      ];

      for (const p of pages) {
        await supabase.from('comic_pages').upsert(p);
      }
    }

    return true;
  } catch (err) {
    console.error('Failed to load sample comics directly to Supabase:', err);
    return false;
  }
}
