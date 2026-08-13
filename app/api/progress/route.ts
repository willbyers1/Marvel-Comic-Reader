import { NextRequest, NextResponse } from 'next/server';
import { updateProgress } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, comicId, currentPage, totalPages, activeIssueId, activeIssueIndex } = body;

    if (!userId || !comicId || !currentPage || !totalPages) {
      return NextResponse.json({ success: false, error: 'Missing required parameters' }, { status: 400 });
    }

    const progress = await updateProgress(userId, comicId, currentPage, totalPages, activeIssueId, activeIssueIndex);

    return NextResponse.json({
      success: true,
      data: progress,
    });
  } catch (err: any) {
    console.error('API /api/progress POST error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
