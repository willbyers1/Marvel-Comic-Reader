import JSZip from 'jszip';
import { getSupabaseClient, getStorageBucketName, getPublicCdnUrl } from './supabase-client';
import { cleanComicTitle } from './utils';

export function naturalSortFilenames(filenames: string[]): string[] {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return [...filenames].sort((a, b) => {
    const baseA = a.split('/').pop() || a;
    const baseB = b.split('/').pop() || b;
    return collator.compare(baseA, baseB);
  });
}

export function isValidImageFile(entryPath: string): boolean {
  if (entryPath.includes('__MACOSX') || entryPath.includes('.DS_Store')) {
    return false;
  }
  const filename = entryPath.split('/').pop() || entryPath;
  if (filename.startsWith('.')) {
    return false;
  }
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext);
}

export function getMimeType(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    default:
      return 'image/jpeg';
  }
}

export interface ClientExtractionOptions {
  file: File;
  userId: string;
  title?: string;
  series?: string;
  issueNumber?: string;
  tags?: string;
  onProgress?: (statusText: string, percent: number) => void;
}

export async function extractAndUploadCbzClient(
  options: ClientExtractionOptions
): Promise<{ success: boolean; comicId?: string; error?: string }> {
  const { file, userId, title, series, issueNumber, tags, onProgress } = options;

  const lowerName = file.name.toLowerCase();
  const extMatch = file.name.match(/\.([a-zA-Z0-9]+)$/);
  const extName = extMatch ? extMatch[1].toUpperCase() : 'Unknown';

  const isZipOrCbz = lowerName.endsWith('.cbz') || lowerName.endsWith('.zip');

  if (!isZipOrCbz) {
    return {
      success: false,
      error: `This file format (${extName}) is not currently supported offline in the mobile app, please use the desktop app.`,
    };
  }

  try {
    if (onProgress) onProgress('Reading comic archive...', 10);

    const zip = await JSZip.loadAsync(file);

    // Filter valid image entries
    const allEntries = Object.keys(zip.files);
    const imageEntries = allEntries.filter((entryName) => {
      const entry = zip.files[entryName];
      return !entry.dir && isValidImageFile(entryName);
    });

    if (imageEntries.length === 0) {
      return {
        success: false,
        error: 'No valid comic page images (.jpg, .png, .webp, .gif) found inside the archive.',
      };
    }

    // Natural numerical sorting
    const sortedEntries = naturalSortFilenames(imageEntries);

    const comicId = `comic_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const supabase = getSupabaseClient();
    const bucket = getStorageBucketName();

    const pageRows: {
      id: string;
      comic_id: string;
      page_number: number;
      filename: string;
      image_url: string;
    }[] = [];

    const totalPages = sortedEntries.length;

    for (let i = 0; i < totalPages; i++) {
      const entryName = sortedEntries[i];
      const pageNumber = i + 1;
      const entry = zip.files[entryName];

      const pct = 10 + Math.round(((i + 1) / totalPages) * 75);
      if (onProgress) {
        onProgress(`Processing page ${pageNumber}/${totalPages}...`, pct);
      }

      const arrayBuffer = await entry.async('arraybuffer');
      const pageExtMatch = entryName.match(/\.([a-zA-Z0-9]+)$/);
      const pageExt = pageExtMatch ? `.${pageExtMatch[1].toLowerCase()}` : '.jpg';
      const pageFilename = `page_${String(pageNumber).padStart(3, '0')}${pageExt}`;
      const cloudKey = `comics/${comicId}/pages/${pageFilename}`;
      const mimeType = getMimeType(pageFilename);

      const blob = new Blob([arrayBuffer], { type: mimeType });

      const { error: stErr } = await supabase.storage.from(bucket).upload(cloudKey, blob, {
        contentType: mimeType,
        upsert: true,
      });

      if (stErr) {
        console.error(`Storage upload failed for page ${pageNumber}:`, stErr);
        throw new Error(`Storage error occurred while uploading page ${pageNumber}: ${stErr.message}`);
      }

      const pageUrl = getPublicCdnUrl(cloudKey);

      pageRows.push({
        id: `page_${comicId}_${pageNumber}`,
        comic_id: comicId,
        page_number: pageNumber,
        filename: pageFilename,
        image_url: pageUrl,
      });
    }

    if (onProgress) onProgress('Updating database records...', 90);

    // Upsert into comic_pages table
    const { error: pageDbErr } = await supabase.from('comic_pages').upsert(pageRows);
    if (pageDbErr) {
      console.warn('comic_pages DB upsert warning:', pageDbErr);
      try {
        await supabase.from('pages').upsert(pageRows);
      } catch {
        // ignore fallback
      }
    }

    const coverImageUrl = pageRows[0]?.image_url || '';
    const cleanFileName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    const rawTitle = title || cleanFileName;
    const comicTitle = cleanComicTitle(rawTitle) || cleanFileName;
    const comicSeries = series ? cleanComicTitle(series) : comicTitle;
    const parsedIssue = issueNumber ? parseInt(issueNumber, 10) : null;

    const tagsList = tags
      ? tags.split(',').map((t) => t.trim()).filter(Boolean)
      : ['Action', 'CBZ'];

    const comicRow = {
      id: comicId,
      user_id: userId,
      title: comicTitle,
      series: comicSeries,
      issue_number: parsedIssue && !isNaN(parsedIssue) ? parsedIssue : null,
      original_filename: file.name,
      format: 'CBZ',
      cover_image_url: coverImageUrl,
      page_count: pageRows.length,
      file_size_bytes: file.size,
      tags: tagsList,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: comicDbErr } = await supabase.from('comics').upsert(comicRow);
    if (comicDbErr) {
      console.error('comics DB error:', comicDbErr);
      throw comicDbErr;
    }

    if (onProgress) onProgress('Extraction completed successfully!', 100);

    return { success: true, comicId };
  } catch (err: any) {
    console.error('Client CBZ extraction error:', err);
    return {
      success: false,
      error: err.message || 'An unexpected error occurred while processing the comic archive.',
    };
  }
}
