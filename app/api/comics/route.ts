import { NextRequest, NextResponse } from 'next/server';
import { getComics, deleteComic, getUsers } from '@/lib/db';
import { deleteFolderFromCloud, isSupabaseConfigured } from '@/lib/supabase';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'user_peter';
    const search = searchParams.get('search') || undefined;
    const tag = searchParams.get('tag') || undefined;
    const collectionId = searchParams.get('collectionId') || undefined;
    const sortBy = (searchParams.get('sortBy') as 'title' | 'createdAt' | 'lastRead') || 'lastRead';

    const comicsData = await getComics(userId, { search, tag, collectionId, sortBy });
    const users = getUsers();

    return NextResponse.json({
      success: true,
      data: comicsData,
      users,
    });
  } catch (err: any) {
    console.error('API /api/comics GET error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const comicId = searchParams.get('comicId');
    const userId = searchParams.get('userId') || 'user_peter';

    if (!comicId) {
      return NextResponse.json({ success: false, error: 'comicId is required' }, { status: 400 });
    }

    if (isSupabaseConfigured()) {
      await deleteFolderFromCloud(`comics/${comicId}`);
    }

    const deleted = await deleteComic(comicId, userId);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Comic not found or unauthorized' }, { status: 404 });
    }

    // Clean up uploaded image folder from disk
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', userId, comicId);
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }

    return NextResponse.json({ success: true, message: 'Comic deleted successfully' });
  } catch (err: any) {
    console.error('API /api/comics DELETE error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
