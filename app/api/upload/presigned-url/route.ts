import { NextRequest, NextResponse } from 'next/server';
import { createPresignedUploadUrl, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { filename, contentType, userId, fileSizeBytes } = body;

    if (!filename) {
      return NextResponse.json({ success: false, error: 'Missing filename.' }, { status: 400 });
    }

    const safeUserId = userId || 'user_peter';
    const cleanFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const timestamp = Date.now();
    const uniqueId = Math.random().toString(36).substring(2, 7);

    // Key format: raw-uploads/[userId]/[timestamp]_[unique]_[cleanFilename]
    const fileKey = `raw-uploads/${safeUserId}/${timestamp}_${uniqueId}_${cleanFilename}`;
    const mimeType = contentType || 'application/octet-stream';

    const presigned = await createPresignedUploadUrl(fileKey, mimeType, 3600);

    return NextResponse.json({
      success: true,
      uploadUrl: presigned.uploadUrl,
      fileKey: presigned.fileKey,
      isCloud: presigned.isCloud,
      isCloudConfigured: isSupabaseConfigured(),
      message: presigned.isCloud
        ? 'Presigned upload URL generated for Direct-to-Cloud Storage.'
        : 'Staging upload URL generated for local environment.',
    });
  } catch (err: any) {
    console.error('API /api/upload/presigned-url error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to generate presigned upload URL.' },
      { status: 500 }
    );
  }
}
