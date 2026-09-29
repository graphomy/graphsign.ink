export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getApiUrl } from '@/lib/api';

/**
 * Public document download redirect handler.
 * Resolves /api/v1/sign/:token/download on the web domain directly to the backend API stream.
 */
export async function GET(
  _request: Request,
  { params }: { params: { token: string } | Promise<{ token: string }> },
) {
  const resolvedParams =
    params && typeof params === 'object' && 'then' in params
      ? await (params as Promise<{ token: string }>)
      : (params as { token: string });

  const token = resolvedParams?.token || '';
  const apiUrl = getApiUrl();

  return NextResponse.redirect(`${apiUrl}/api/v1/sign/${encodeURIComponent(token)}/download`, 307);
}
