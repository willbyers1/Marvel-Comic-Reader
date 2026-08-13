import { NextRequest, NextResponse } from 'next/server';
import { generateAndSeedSampleComics } from '@/lib/sample-generator';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'user_peter';

    const seededCount = await generateAndSeedSampleComics(userId);

    return NextResponse.json({
      success: true,
      seededCount,
      message: `Generated ${seededCount} Marvel-themed superhero sample comics in your library!`,
    });
  } catch (err: any) {
    console.error('API /api/comics/sample POST error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
