import fs from 'fs';
import path from 'path';
import { User, Comic, ComicPage, ReadingProgress, Collection } from './types';
import {
  isSupabaseConfigured,
  saveComicToSupabase,
  getComicsFromSupabase,
  getComicByIdFromSupabase,
  deleteComicFromSupabase,
  updateProgressInSupabase,
  getCollectionsFromSupabase,
  saveCollectionToSupabase,
  toggleComicInCollectionInSupabase,
} from './supabase';

interface DBData {
  users: User[];
  comics: Comic[];
  pages: ComicPage[];
  progress: ReadingProgress[];
  collections: Collection[];
}

const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

const INITIAL_USERS: User[] = [
  {
    id: 'user_peter',
    name: 'Peter Parker',
    email: 'peter.parker@dailybugle.com',
    avatar: 'https://images.unsplash.com/photo-1635863138275-d9b33299680b?auto=format&fit=crop&w=150&q=80',
    heroAlias: 'Web-Slinger',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'user_tony',
    name: 'Tony Stark',
    email: 'tony@starkindustries.com',
    avatar: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=150&q=80',
    heroAlias: 'Iron-Tech',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'user_guest',
    name: 'Hero Vault Visitor',
    email: 'guest@herovault.io',
    avatar: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=150&q=80',
    heroAlias: 'Guest Collector',
    createdAt: new Date().toISOString(),
  },
];

function ensureDbExists(): DBData {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    const initialData: DBData = {
      users: INITIAL_USERS,
      comics: [],
      pages: [],
      progress: [],
      collections: [
        {
          id: 'col_avengers',
          userId: 'user_peter',
          name: 'Avengers Protocol',
          color: '#ED1D24',
          comicIds: [],
          createdAt: new Date().toISOString(),
        },
        {
          id: 'col_spider',
          userId: 'user_peter',
          name: 'Spider-Verse Archives',
          color: '#3B82F6',
          comicIds: [],
          createdAt: new Date().toISOString(),
        },
      ],
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    return initialData;
  }

  try {
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    return {
      users: parsed.users || INITIAL_USERS,
      comics: parsed.comics || [],
      pages: parsed.pages || [],
      progress: parsed.progress || [],
      collections: parsed.collections || [],
    };
  } catch (err) {
    console.error('Error reading DB, re-initializing:', err);
    const initialData: DBData = {
      users: INITIAL_USERS,
      comics: [],
      pages: [],
      progress: [],
      collections: [],
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    return initialData;
  }
}

function saveDb(data: DBData): void {
  ensureDbExists();
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

// User methods
export function getUsers(): User[] {
  const db = ensureDbExists();
  return db.users;
}

export function getUserById(id: string): User | undefined {
  const db = ensureDbExists();
  return db.users.find((u) => u.id === id);
}

// Comic methods (User Isolated & Resilient Merge)
export async function getComics(
  userId: string,
  options?: {
    search?: string;
    tag?: string;
    collectionId?: string;
    sortBy?: 'title' | 'createdAt' | 'lastRead';
    sortOrder?: 'asc' | 'desc';
  }
): Promise<{ comic: Comic; progress?: ReadingProgress }[]> {
  const comicMap = new Map<string, { comic: Comic; progress?: ReadingProgress }>();

  // 1. Fetch from local DB
  const db = ensureDbExists();
  let userComics = db.comics.filter((c) => c.userId === userId);

  if (options?.collectionId) {
    const collection = db.collections.find((col) => col.id === options.collectionId && col.userId === userId);
    if (collection) {
      userComics = userComics.filter((c) => collection.comicIds.includes(c.id));
    } else {
      userComics = [];
    }
  }

  for (const comic of userComics) {
    const prog = db.progress.find((p) => p.userId === userId && p.comicId === comic.id);
    comicMap.set(comic.id, { comic, progress: prog });
  }

  // 2. Fetch from Supabase DB (if configured)
  if (isSupabaseConfigured()) {
    try {
      const supabaseResults = await getComicsFromSupabase(userId);
      for (const item of supabaseResults) {
        if (item?.comic?.id) {
          // If already exists in local DB, combine or prefer Supabase metadata if present
          const existing = comicMap.get(item.comic.id);
          comicMap.set(item.comic.id, {
            comic: {
              ...(existing?.comic || {}),
              ...item.comic,
            },
            progress: item.progress || existing?.progress,
          });
        }
      }
    } catch (err) {
      console.warn('Supabase getComics query failed, using local DB entries:', err);
    }
  }

  let results = Array.from(comicMap.values());

  if (options?.search) {
    const term = options.search.toLowerCase();
    results = results.filter(
      (r) =>
        r.comic.title.toLowerCase().includes(term) ||
        (r.comic.series && r.comic.series.toLowerCase().includes(term)) ||
        (r.comic.tags && r.comic.tags.some((t) => t.toLowerCase().includes(term)))
    );
  }

  if (options?.tag) {
    results = results.filter((r) => r.comic.tags && r.comic.tags.includes(options.tag!));
  }

  results.sort((a, b) => {
    if (options?.sortBy === 'title') {
      return (options.sortOrder === 'desc' ? -1 : 1) * a.comic.title.localeCompare(b.comic.title);
    }
    if (options?.sortBy === 'lastRead') {
      const dateA = a.progress?.lastReadAt || a.comic.createdAt;
      const dateB = b.progress?.lastReadAt || b.comic.createdAt;
      return (options.sortOrder === 'asc' ? 1 : -1) * dateB.localeCompare(dateA);
    }
    return (options?.sortOrder === 'asc' ? 1 : -1) * b.comic.createdAt.localeCompare(a.comic.createdAt);
  });

  return results;
}

export async function getComicById(
  id: string,
  userId: string
): Promise<{ comic: Comic; pages: ComicPage[]; progress?: ReadingProgress } | null> {
  const db = ensureDbExists();
  const localComic = db.comics.find((c) => c.id === id && c.userId === userId);
  const localPages = db.pages
    .filter((p) => p.comicId === id)
    .sort((a, b) => a.pageNumber - b.pageNumber);
  const localProgress = db.progress.find((p) => p.userId === userId && p.comicId === id);

  if (isSupabaseConfigured()) {
    try {
      const res = await getComicByIdFromSupabase(id, userId);
      if (res && res.comic) {
        return {
          comic: { ...(localComic || {}), ...res.comic },
          pages: res.pages && res.pages.length > 0 ? res.pages : localPages,
          progress: res.progress || localProgress,
        };
      }
    } catch (err) {
      console.warn('Supabase getComicById failed, falling back to local DB:', err);
    }
  }

  if (!localComic) return null;

  return { comic: localComic, pages: localPages, progress: localProgress };
}

export async function createComic(comic: Comic, pages: ComicPage[]): Promise<void> {
  const db = ensureDbExists();
  db.comics.push(comic);
  db.pages.push(...pages);

  const initProgress: ReadingProgress = {
    id: `prog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: comic.userId,
    comicId: comic.id,
    currentPage: 1,
    totalPages: comic.pageCount,
    completed: false,
    lastReadAt: new Date().toISOString(),
  };
  db.progress.push(initProgress);
  saveDb(db);

  if (isSupabaseConfigured()) {
    try {
      await saveComicToSupabase(comic, pages, initProgress);
    } catch (err) {
      console.warn('Supabase saveComicToSupabase failed:', err);
    }
  }
}

export async function deleteComic(id: string, userId: string): Promise<boolean> {
  let deletedFromSupabase = false;
  if (isSupabaseConfigured()) {
    try {
      deletedFromSupabase = await deleteComicFromSupabase(id, userId);
    } catch (err) {
      console.warn('Supabase deleteComicFromSupabase failed:', err);
    }
  }

  const db = ensureDbExists();
  const comicIndex = db.comics.findIndex((c) => c.id === id && c.userId === userId);
  if (comicIndex !== -1) {
    db.comics.splice(comicIndex, 1);
    db.pages = db.pages.filter((p) => p.comicId !== id);
    db.progress = db.progress.filter((p) => !(p.comicId === id && p.userId === userId));

    db.collections.forEach((col) => {
      if (col.userId === userId) {
        col.comicIds = col.comicIds.filter((cId) => cId !== id);
      }
    });

    saveDb(db);
  }

  return deletedFromSupabase || comicIndex !== -1;
}

// Progress methods
export async function updateProgress(
  userId: string,
  comicId: string,
  currentPage: number,
  totalPages: number,
  activeIssueId?: string,
  activeIssueIndex?: number
): Promise<ReadingProgress> {
  let prog: ReadingProgress | undefined;

  if (isSupabaseConfigured()) {
    try {
      prog = await updateProgressInSupabase(userId, comicId, currentPage, totalPages, activeIssueId, activeIssueIndex);
    } catch (err) {
      console.warn('Supabase updateProgressInSupabase failed:', err);
    }
  }

  const db = ensureDbExists();
  let existingProg = db.progress.find((p) => p.userId === userId && p.comicId === comicId);
  const isCompleted = currentPage >= totalPages;

  if (existingProg) {
    existingProg.currentPage = Math.min(Math.max(1, currentPage), totalPages);
    existingProg.totalPages = totalPages;
    existingProg.completed = isCompleted;
    existingProg.lastReadAt = new Date().toISOString();
    if (activeIssueId !== undefined) existingProg.activeIssueId = activeIssueId;
    if (activeIssueIndex !== undefined) existingProg.activeIssueIndex = activeIssueIndex;
    if (!prog) prog = existingProg;
  } else {
    const localProg = {
      id: `prog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId,
      comicId,
      currentPage: Math.min(Math.max(1, currentPage), totalPages),
      totalPages,
      completed: isCompleted,
      lastReadAt: new Date().toISOString(),
      activeIssueId,
      activeIssueIndex,
    };
    db.progress.push(localProg);
    if (!prog) prog = localProg;
  }
  saveDb(db);

  return prog;
}

// Collection methods
export async function getCollections(userId: string): Promise<Collection[]> {
  const db = ensureDbExists();
  const localCols = db.collections.filter((col) => col.userId === userId);

  if (isSupabaseConfigured()) {
    try {
      const sbCols = await getCollectionsFromSupabase(userId);
      const map = new Map<string, Collection>();
      for (const c of localCols) map.set(c.id, c);
      for (const c of sbCols) map.set(c.id, c);
      return Array.from(map.values());
    } catch (err) {
      console.warn('getCollectionsFromSupabase failed:', err);
    }
  }

  return localCols;
}

export async function createCollection(userId: string, name: string, color: string = '#ED1D24'): Promise<Collection> {
  const db = ensureDbExists();
  const col: Collection = {
    id: `col_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId,
    name,
    color,
    comicIds: [],
    createdAt: new Date().toISOString(),
  };
  db.collections.push(col);
  saveDb(db);

  if (isSupabaseConfigured()) {
    try {
      await saveCollectionToSupabase(col);
    } catch (err) {
      console.warn('saveCollectionToSupabase failed:', err);
    }
  }

  return col;
}

export async function toggleComicInCollection(userId: string, collectionId: string, comicId: string): Promise<boolean> {
  const db = ensureDbExists();
  const col = db.collections.find((c) => c.id === collectionId && c.userId === userId);
  if (col) {
    if (col.comicIds.includes(comicId)) {
      col.comicIds = col.comicIds.filter((id) => id !== comicId);
    } else {
      col.comicIds.push(comicId);
    }
    saveDb(db);
  }

  if (isSupabaseConfigured()) {
    try {
      await toggleComicInCollectionInSupabase(userId, collectionId, comicId);
    } catch (err) {
      console.warn('toggleComicInCollectionInSupabase failed:', err);
    }
  }

  return true;
}
