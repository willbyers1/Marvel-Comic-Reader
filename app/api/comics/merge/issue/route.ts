import { NextRequest, NextResponse } from 'next/server';
import { extractComicArchive } from '@/lib/extractor';
import { isSupabaseConfigured, getBufferFromCloud } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    // Flow 1: JSON payload with pre-uploaded fileKey (Direct-to-Cloud / Staged)
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const {
        sessionId,
        issueIndex: issueIndexRaw,
        label,
        fileKey,
        isCloud,
        originalFilename,
      } = body;

      if (!sessionId || issueIndexRaw === undefined || !fileKey) {
        return NextResponse.json(
          { success: false, error: 'Missing required issue extraction fields (sessionId, issueIndex, or fileKey).' },
          { status: 400 }
        );
      }

      const issueIndex = typeof issueIndexRaw === 'number' ? issueIndexRaw : parseInt(issueIndexRaw, 10);
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
          { success: false, error: `Staged issue file missing at ${fileKey}` },
          { status: 404 }
        );
      }

      const extraction = await extractComicArchive(buffer, fileName);
      if (!extraction.success) {
        return NextResponse.json(
          {
            success: false,
            error: `Extraction failed for ${fileName}: ${extraction.error || 'Unknown archive error'}`,
            format: extraction.format,
          },
          { status: 422 }
        );
      }

      const tempSessionDir = path.join(process.cwd(), 'tmp_extract', 'sessions', sessionId, `issue_${issueIndex}`);
      fs.mkdirSync(tempSessionDir, { recursive: true });

      const issueMeta = {
        issueIndex,
        label: label || `Issue ${issueIndex + 1}`,
        originalFilename: fileName,
        format: extraction.format,
        pageCount: extraction.pages.length,
      };
      fs.writeFileSync(path.join(tempSessionDir, 'issue_meta.json'), JSON.stringify(issueMeta, null, 2));

      for (let p = 0; p < extraction.pages.length; p++) {
        const page = extraction.pages[p];
        const pageFilename = `p${String(p + 1).padStart(3, '0')}${path.extname(page.filename) || '.jpg'}`;
        fs.writeFileSync(path.join(tempSessionDir, pageFilename), page.data);
      }

      return NextResponse.json({
        success: true,
        sessionId,
        issueIndex,
        format: extraction.format,
        pageCount: extraction.pages.length,
        label: issueMeta.label,
      });
    }

    // Flow 2: FormData fallback
    const formData = await req.formData();
    const sessionId = formData.get('sessionId') as string | null;
    const issueIndexStr = formData.get('issueIndex') as string | null;
    const label = (formData.get('label') as string | null) || '';
    const file = formData.get('file') as File | null;

    if (!sessionId || issueIndexStr === null || !file) {
      return NextResponse.json(
        { success: false, error: 'Missing required issue upload fields (sessionId, issueIndex, or file).' },
        { status: 400 }
      );
    }

    const issueIndex = parseInt(issueIndexStr, 10);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const extraction = await extractComicArchive(buffer, file.name);
    if (!extraction.success) {
      return NextResponse.json(
        {
          success: false,
          error: `Extraction failed for ${file.name}: ${extraction.error || 'Unknown archive error'}`,
          format: extraction.format,
        },
        { status: 422 }
      );
    }

    const tempSessionDir = path.join(process.cwd(), 'tmp_extract', 'sessions', sessionId, `issue_${issueIndex}`);
    fs.mkdirSync(tempSessionDir, { recursive: true });

    const issueMeta = {
      issueIndex,
      label: label || `Issue ${issueIndex + 1}`,
      originalFilename: file.name,
      format: extraction.format,
      pageCount: extraction.pages.length,
    };
    fs.writeFileSync(path.join(tempSessionDir, 'issue_meta.json'), JSON.stringify(issueMeta, null, 2));

    for (let p = 0; p < extraction.pages.length; p++) {
      const page = extraction.pages[p];
      const pageFilename = `p${String(p + 1).padStart(3, '0')}${path.extname(page.filename) || '.jpg'}`;
      fs.writeFileSync(path.join(tempSessionDir, pageFilename), page.data);
    }

    return NextResponse.json({
      success: true,
      sessionId,
      issueIndex,
      format: extraction.format,
      pageCount: extraction.pages.length,
      label: issueMeta.label,
    });
  } catch (err: any) {
    console.error('API /api/comics/merge/issue error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server issue upload error.' },
      { status: 500 }
    );
  }
}
