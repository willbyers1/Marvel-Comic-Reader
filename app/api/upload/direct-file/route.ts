import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, uploadBufferToCloud } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handleUpload(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');
    const chunkIndexStr = searchParams.get('chunkIndex');
    const totalChunksStr = searchParams.get('totalChunks');
    const mimeType = searchParams.get('mimeType') || 'application/octet-stream';

    if (!key) {
      return NextResponse.json({ success: false, error: 'Missing storage key parameter.' }, { status: 400 });
    }

    const tempFilePath = path.join(process.cwd(), 'tmp_raw', key);
    fs.mkdirSync(path.dirname(tempFilePath), { recursive: true });

    const isChunked = chunkIndexStr !== null && totalChunksStr !== null;
    const chunkIndex = isChunked ? parseInt(chunkIndexStr, 10) : 0;
    const totalChunks = isChunked ? parseInt(totalChunksStr, 10) : 1;

    // Read body chunk/data
    let chunkBuffer: Buffer;
    if (req.body) {
      const reader = req.body.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      chunkBuffer = Buffer.concat(chunks);
    } else {
      const arrayBuffer = await req.arrayBuffer();
      chunkBuffer = Buffer.from(arrayBuffer);
    }

    if (!isChunked || chunkIndex === 0) {
      fs.writeFileSync(tempFilePath, chunkBuffer);
    } else {
      fs.appendFileSync(tempFilePath, chunkBuffer);
    }

    const isComplete = !isChunked || chunkIndex === totalChunks - 1;

    if (!isComplete) {
      return NextResponse.json({
        success: true,
        chunkIndex,
        totalChunks,
        done: false,
      });
    }

    const stats = fs.statSync(tempFilePath);
    let isCloud = false;

    // Try server-side upload to Supabase if configured
    if (isSupabaseConfigured()) {
      try {
        const fileBuffer = fs.readFileSync(tempFilePath);
        await uploadBufferToCloud(key, fileBuffer, mimeType);
        isCloud = true;
      } catch (cloudErr: any) {
        console.warn(`Server-side cloud upload failed for ${key}, proceeding with staged file:`, cloudErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      fileKey: key,
      isCloud,
      size: stats.size,
      message: 'File upload completed successfully.',
    });
  } catch (err: any) {
    console.error('API /api/upload/direct-file upload error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to process file upload.' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  return handleUpload(req);
}

export async function POST(req: NextRequest) {
  return handleUpload(req);
}

