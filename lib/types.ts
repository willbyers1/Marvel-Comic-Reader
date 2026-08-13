export type ComicFormat = 'CBZ' | 'CBR' | 'CB7' | 'CBT' | 'CBA' | 'PDF' | 'UNKNOWN';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  heroAlias?: string;
  createdAt: string;
}

export interface Issue {
  id: string;
  issueNumber: number;
  label: string;
  originalFilename: string;
  format: ComicFormat;
  startPage: number;
  endPage: number;
  pageCount: number;
}

export interface ComicPage {
  id: string;
  comicId: string;
  pageNumber: number;
  filename: string;
  imageUrl: string;
  width?: number;
  height?: number;
  issueIndex?: number;
  issuePageNumber?: number;
  issueLabel?: string;
}

export interface Comic {
  id: string;
  userId: string;
  title: string;
  series?: string;
  issueNumber?: number;
  originalFilename: string;
  format: ComicFormat;
  coverImageUrl: string;
  pageCount: number;
  fileSizeBytes: number;
  publisher?: string;
  year?: number;
  summary?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  isMerged?: boolean;
  issues?: Issue[];
}

export interface ReadingProgress {
  id: string;
  userId: string;
  comicId: string;
  currentPage: number;
  totalPages: number;
  completed: boolean;
  lastReadAt: string;
  activeIssueId?: string;
  activeIssueIndex?: number;
}

export interface Collection {
  id: string;
  userId: string;
  name: string;
  color: string;
  comicIds: string[];
  createdAt: string;
}

export interface ProcessingStatus {
  status: 'idle' | 'uploading' | 'magic_check' | 'extracting' | 'generating_thumbnails' | 'ready' | 'error';
  progressPercentage: number;
  message?: string;
  error?: string;
}

export type FitMode = 'fit-width' | 'fit-height' | 'actual-size' | 'double-page';
export type ReadingDirection = 'ltr' | 'rtl';
