import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check if it's an API route
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Check if it's an OPTIONS preflight request
    if (request.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 });
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-client-info');
      response.headers.set('Access-Control-Max-Age', '86400');
      return response;
    }

    // For other requests, proceed and add CORS headers to the response
    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-client-info');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
