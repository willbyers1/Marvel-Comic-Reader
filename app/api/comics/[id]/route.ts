import { NextRequest, NextResponse } from 'next/server';
import { getComicById, deleteComic } from '@/lib/db';
import { deleteFolderFromCloud, isSupabaseConfigured } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'user_peter';

    const comicDetails = await getComicById(id, userId);

    if (!comicDetails) {
      return NextResponse.json({ success: false, error: 'Comic archive not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: comicDetails,
    });
  } catch (err: any) {
    console.error('API /api/comics/[id] GET error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'user_peter';

    const comicDetails = await getComicById(id, userId);
    if (!comicDetails) {
      return NextResponse.json({ success: false, error: 'Comic not found' }, { status: 404 });
    }

    // 1. Delete from Supabase Storage folder comics/[id]
    if (isSupabaseConfigured()) {
      await deleteFolderFromCloud(`comics/${id}`);
    }

    // 2. Delete local upload directory if exists
    try {
      const localUploadDir = path.join(process.cwd(), 'public', 'uploads', userId, id);
      if (fs.existsSync(localUploadDir)) {
        fs.rmSync(localUploadDir, { recursive: true, force: true });
      }
    } catch (fsErr) {
      console.warn('Failed to delete local upload directory:', fsErr);
    }

    // 3. Delete from DB
    const deleted = await deleteComic(id, userId);

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Failed to delete comic record from database' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Comic and associated storage files deleted permanently.',
    });
  } catch (err: any) {
    console.error('API /api/comics/[id] DELETE error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error during comic deletion.' }, { status: 500 });
  }
}
