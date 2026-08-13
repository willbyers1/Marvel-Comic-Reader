import { NextRequest, NextResponse } from 'next/server';
import { getBufferFromCloud, isSupabaseConfigured } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');

    if (!key) {
      return new NextResponse('Missing key parameter', { status: 400 });
    }

    if (isSupabaseConfigured()) {
      try {
        const buffer = await getBufferFromCloud(key);
        const ext = path.extname(key).toLowerCase();
        let contentType = 'image/jpeg';
        if (ext === '.png') contentType = 'image/png';
        if (ext === '.webp') contentType = 'image/webp';
        if (ext === '.gif') contentType = 'image/gif';

        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        });
      } catch (cloudErr) {
        console.warn('Cloud fetch failed, falling back to local:', cloudErr);
      }
    }

    // Local fallback
    const localUploadPath = path.join(process.cwd(), 'public', 'uploads', key);
    const localTmpPath = path.join(process.cwd(), 'tmp_raw', key);

    let filePath = '';
    if (fs.existsSync(localUploadPath)) {
      filePath = localUploadPath;
    } else if (fs.existsSync(localTmpPath)) {
      filePath = localTmpPath;
    }

    if (!filePath) {
      return new NextResponse('File not found', { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'image/jpeg';
    if (ext === '.png') contentType = 'image/png';
    if (ext === '.webp') contentType = 'image/webp';
    if (ext === '.gif') contentType = 'image/gif';

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err: any) {
    console.error('API /api/storage/file error:', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
