import { NextRequest, NextResponse } from 'next/server';
import { createComic } from '@/lib/db';
import { Comic, ComicPage, Issue } from '@/lib/types';
import { naturalSortFilenames } from '@/lib/extractor';
import { isSupabaseConfigured, uploadBufferToCloud } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, userId: rawUserId, title: rawTitle, tags: rawTags, issues } = body;

    if (!sessionId || !issues || !Array.isArray(issues) || issues.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing sessionId or valid issues array.' },
        { status: 400 }
      );
    }

    const userId = rawUserId || 'user_peter';
    const title = rawTitle || 'Merged Comic Book';
    const tags = Array.isArray(rawTags)
      ? rawTags
      : typeof rawTags === 'string'
      ? rawTags.split(',').map((t) => t.trim()).filter(Boolean)
      : ['Action', 'Merged'];

    const comicId = `comic_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const useCloudStorage = isSupabaseConfigured();

    const targetUploadDir = path.join(process.cwd(), 'public', 'uploads', userId, comicId);
    if (!useCloudStorage) {
      fs.mkdirSync(targetUploadDir, { recursive: true });
    }

    const pageEntities: ComicPage[] = [];
    const issuesList: Issue[] = [];
    let globalPageCounter = 1;
    let totalFileSizeBytes = 0;

    for (let i = 0; i < issues.length; i++) {
      const issueItem = issues[i];
      const issueIndex = issueItem.issueIndex ?? i;
      const sessionIssueDir = path.join(
        process.cwd(),
        'tmp_extract',
        'sessions',
        sessionId,
        `issue_${issueIndex}`
      );

      if (!fs.existsSync(sessionIssueDir)) {
        return NextResponse.json(
          { success: false, error: `Session data missing for issue index ${issueIndex}.` },
          { status: 400 }
        );
      }

      // Read metadata
      let meta: any = {};
      const metaPath = path.join(sessionIssueDir, 'issue_meta.json');
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch (e) {
          console.warn('Failed to parse issue_meta.json:', e);
        }
      }

      // Read extracted page files
      const dirFiles = fs.readdirSync(sessionIssueDir);
      const pageFiles = naturalSortFilenames(
        dirFiles.filter((f) => f !== 'issue_meta.json' && !f.startsWith('.'))
      );

      if (pageFiles.length === 0) {
        return NextResponse.json(
          { success: false, error: `No extracted pages found for issue index ${issueIndex}.` },
          { status: 400 }
        );
      }

      const startPage = globalPageCounter;
      const label = issueItem.label || meta.label || `Issue ${i + 1}`;

      for (let p = 0; p < pageFiles.length; p++) {
        const srcFile = pageFiles[p];
        const srcPath = path.join(sessionIssueDir, srcFile);
        const ext = path.extname(srcFile) || '.jpg';
        const pageFilename = `issue_${i + 1}_p${String(p + 1).padStart(3, '0')}${ext}`;

        const buffer = fs.readFileSync(srcPath);
        totalFileSizeBytes += buffer.length;

        let pageUrl = '';
        if (useCloudStorage) {
          const cloudKey = `comics/${comicId}/pages/${pageFilename}`;
          let mimeType = 'image/jpeg';
          if (ext.toLowerCase() === '.png') mimeType = 'image/png';
          if (ext.toLowerCase() === '.webp') mimeType = 'image/webp';

          pageUrl = await uploadBufferToCloud(cloudKey, buffer, mimeType);
        } else {
          const destPath = path.join(targetUploadDir, pageFilename);
          fs.writeFileSync(destPath, buffer);
          const relKey = `${userId}/${comicId}/${pageFilename}`;
          pageUrl = `/api/storage/file?key=${encodeURIComponent(relKey)}`;
        }

        pageEntities.push({
          id: `page_${comicId}_${globalPageCounter}`,
          comicId,
          pageNumber: globalPageCounter,
          filename: pageFilename,
          imageUrl: pageUrl,
          issueIndex: i,
          issuePageNumber: p + 1,
          issueLabel: label,
        });

        globalPageCounter++;
      }

      const endPage = globalPageCounter - 1;

      issuesList.push({
        id: `issue_${comicId}_${i + 1}`,
        issueNumber: i + 1,
        label,
        originalFilename: meta.originalFilename || `Issue ${i + 1}`,
        format: meta.format || 'CBZ',
        startPage,
        endPage,
        pageCount: pageFiles.length,
      });
    }

    const coverImageUrl = pageEntities[0]?.imageUrl || '';

    const comicEntity: Comic = {
      id: comicId,
      userId,
      title,
      series: title,
      issueNumber: 1,
      originalFilename: `Merged (${issuesList.length} issues)`,
      format: issuesList[0]?.format || 'CBZ',
      coverImageUrl,
      pageCount: pageEntities.length,
      fileSizeBytes: totalFileSizeBytes,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isMerged: true,
      issues: issuesList,
    };

    await createComic(comicEntity, pageEntities);

    // Clean up temp session directory
    try {
      const sessionBaseDir = path.join(process.cwd(), 'tmp_extract', 'sessions', sessionId);
      if (fs.existsSync(sessionBaseDir)) {
        fs.rmSync(sessionBaseDir, { recursive: true, force: true });
      }
    } catch (cleanErr) {
      console.warn('Failed to cleanup temp session directory:', cleanErr);
    }

    return NextResponse.json({
      success: true,
      data: comicEntity,
      message: `Merged comic book created successfully (${issuesList.length} issues, ${pageEntities.length} pages total).`,
    });
  } catch (err: any) {
    console.error('API /api/comics/merge error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error during comic merge.' },
      { status: 500 }
    );
  }
}
