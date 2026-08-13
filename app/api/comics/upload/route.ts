import { NextRequest, NextResponse } from 'next/server';
import { extractComicArchive } from '@/lib/extractor';
import { createComic } from '@/lib/db';
import { Comic, ComicPage } from '@/lib/types';
import { cleanComicTitle } from '@/lib/utils';
import {
  isSupabaseConfigured,
  getBufferFromCloud,
  uploadBufferToCloud,
  getPublicCdnUrl,
  deleteObjectsFromCloud,
} from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    // Flow 1: JSON payload with pre-uploaded fileKey (Direct-to-Cloud / Staging)
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const {
        fileKey,
        originalFilename,
        isCloud,
        userId: rawUserId,
        title: customTitle,
        series,
        issueNumber: issueNumStr,
        tags: rawTags,
      } = body;

      if (!fileKey) {
        return NextResponse.json({ success: false, error: 'Missing fileKey in upload payload.' }, { status: 400 });
      }

      const userId = rawUserId || 'user_peter';
      const fileName = originalFilename || path.basename(fileKey);

      let buffer: Buffer;
      const localPath = path.join(process.cwd(), 'tmp_raw', fileKey);

      if (fs.existsSync(localPath)) {
        buffer = fs.readFileSync(localPath);
        try {
          fs.unlinkSync(localPath);
        } catch (e) {
          // ignore unlink error
        }
      } else if (isCloud && isSupabaseConfigured()) {
        buffer = await getBufferFromCloud(fileKey);
      } else {
        return NextResponse.json(
          { success: false, error: `Staged file missing at ${fileKey}` },
          { status: 404 }
        );
      }

      const extraction = await extractComicArchive(buffer, fileName);
      if (!extraction.success) {
        return NextResponse.json(
          {
            success: false,
            error: extraction.error || 'Failed to extract comic archive.',
            format: extraction.format,
          },
          { status: 422 }
        );
      }

      const comicId = `comic_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const useCloudStorage = isSupabaseConfigured();
      const pageEntities: ComicPage[] = [];

      const uploadDir = path.join(process.cwd(), 'public', 'uploads', userId, comicId);
      if (!useCloudStorage) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      for (let i = 0; i < extraction.pages.length; i++) {
        const page = extraction.pages[i];
        const ext = path.extname(page.filename) || '.jpg';
        const pageFilename = `page_${String(page.pageNumber).padStart(3, '0')}${ext}`;

        let pageUrl = '';

        if (useCloudStorage) {
          const cloudKey = `comics/${comicId}/pages/${pageFilename}`;
          let mimeType = 'image/jpeg';
          if (ext.toLowerCase() === '.png') mimeType = 'image/png';
          if (ext.toLowerCase() === '.webp') mimeType = 'image/webp';

          pageUrl = await uploadBufferToCloud(cloudKey, page.data, mimeType);
        } else {
          const filePath = path.join(uploadDir, pageFilename);
          fs.writeFileSync(filePath, page.data);
          const relKey = `${userId}/${comicId}/${pageFilename}`;
          pageUrl = `/api/storage/file?key=${encodeURIComponent(relKey)}`;
        }

        pageEntities.push({
          id: `page_${comicId}_${page.pageNumber}`,
          comicId,
          pageNumber: page.pageNumber,
          filename: pageFilename,
          imageUrl: pageUrl,
        });
      }

      const coverImageUrl = pageEntities[0]?.imageUrl || '';
      const cleanFileName = path.basename(fileName, path.extname(fileName)).replace(/[-_]/g, ' ');
      const rawTitle = customTitle || cleanFileName;
      const title = cleanComicTitle(rawTitle) || cleanFileName;
      const comicSeries = series ? cleanComicTitle(series) : title;

      const tags = rawTags
        ? typeof rawTags === 'string'
          ? rawTags.split(',').map((t: string) => t.trim()).filter(Boolean)
          : rawTags
        : ['Action', extraction.format];

      const comicEntity: Comic = {
        id: comicId,
        userId,
        title,
        series: comicSeries,
        issueNumber: issueNumStr ? parseInt(String(issueNumStr), 10) : undefined,
        originalFilename: fileName,
        format: extraction.format,
        coverImageUrl,
        pageCount: pageEntities.length,
        fileSizeBytes: buffer.length,
        tags,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await createComic(comicEntity, pageEntities);

      // Clean up raw staged file
      if (useCloudStorage) {
        deleteObjectsFromCloud([fileKey]).catch(() => {});
      } else {
        const localPath = path.join(process.cwd(), 'tmp_raw', fileKey);
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
      }

      return NextResponse.json({
        success: true,
        data: comicEntity,
        message: `Comic archive extracted successfully (${pageEntities.length} pages ready).`,
      });
    }

    // Flow 2: Standard FormData upload (fallback)
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const userId = (formData.get('userId') as string) || 'user_peter';
    const customTitle = formData.get('title') as string | null;
    const series = formData.get('series') as string | null;
    const issueNumStr = formData.get('issueNumber') as string | null;
    const tagsStr = formData.get('tags') as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No comic file uploaded.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const extraction = await extractComicArchive(buffer, file.name);
    if (!extraction.success) {
      return NextResponse.json(
        {
          success: false,
          error: extraction.error || 'Failed to extract comic archive.',
          format: extraction.format,
        },
        { status: 422 }
      );
    }

    const comicId = `comic_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const useCloudStorage = isSupabaseConfigured();
    const pageEntities: ComicPage[] = [];

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', userId, comicId);
    if (!useCloudStorage) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    for (let i = 0; i < extraction.pages.length; i++) {
      const page = extraction.pages[i];
      const ext = path.extname(page.filename) || '.jpg';
      const pageFilename = `page_${String(page.pageNumber).padStart(3, '0')}${ext}`;

      let pageUrl = '';
      if (useCloudStorage) {
        const cloudKey = `comics/${comicId}/pages/${pageFilename}`;
        let mimeType = 'image/jpeg';
        if (ext.toLowerCase() === '.png') mimeType = 'image/png';
        if (ext.toLowerCase() === '.webp') mimeType = 'image/webp';

        pageUrl = await uploadBufferToCloud(cloudKey, page.data, mimeType);
      } else {
        const filePath = path.join(uploadDir, pageFilename);
        fs.writeFileSync(filePath, page.data);
        const relKey = `${userId}/${comicId}/${pageFilename}`;
        pageUrl = `/api/storage/file?key=${encodeURIComponent(relKey)}`;
      }

      pageEntities.push({
        id: `page_${comicId}_${page.pageNumber}`,
        comicId,
        pageNumber: page.pageNumber,
        filename: pageFilename,
        imageUrl: pageUrl,
      });
    }

    const coverImageUrl = pageEntities[0]?.imageUrl || '';
    const cleanFileName = path.basename(file.name, path.extname(file.name)).replace(/[-_]/g, ' ');
    const rawTitle = customTitle || cleanFileName;
    const title = cleanComicTitle(rawTitle) || cleanFileName;
    const comicSeries = series ? cleanComicTitle(series) : title;

    const tags = tagsStr
      ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean)
      : ['Action', extraction.format];

    const comicEntity: Comic = {
      id: comicId,
      userId,
      title,
      series: comicSeries,
      issueNumber: issueNumStr ? parseInt(issueNumStr, 10) : undefined,
      originalFilename: file.name,
      format: extraction.format,
      coverImageUrl,
      pageCount: pageEntities.length,
      fileSizeBytes: file.size,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await createComic(comicEntity, pageEntities);

    return NextResponse.json({
      success: true,
      data: comicEntity,
      message: `Comic archive extracted successfully (${pageEntities.length} pages ready).`,
    });
  } catch (err: any) {
    console.error('API /api/comics/upload error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server upload error' }, { status: 500 });
  }
}
