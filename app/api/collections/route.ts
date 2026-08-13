import { NextRequest, NextResponse } from 'next/server';
import { getCollections, createCollection, toggleComicInCollection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'user_peter';

    const collections = await getCollections(userId);

    return NextResponse.json({
      success: true,
      data: collections,
    });
  } catch (err: any) {
    console.error('API /api/collections GET error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, userId, name, color, collectionId, comicId } = body;

    if (action === 'create') {
      if (!name) {
        return NextResponse.json({ success: false, error: 'Collection name is required' }, { status: 400 });
      }
      const col = await createCollection(userId || 'user_peter', name, color || '#ED1D24');
      return NextResponse.json({ success: true, data: col });
    }

    if (action === 'toggle') {
      if (!collectionId || !comicId) {
        return NextResponse.json({ success: false, error: 'collectionId and comicId are required' }, { status: 400 });
      }
      const toggled = await toggleComicInCollection(userId || 'user_peter', collectionId, comicId);
      return NextResponse.json({ success: true, toggled });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error('API /api/collections POST error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
