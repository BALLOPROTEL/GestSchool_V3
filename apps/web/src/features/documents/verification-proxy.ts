import type { DocumentVerification } from '@gestschool/contracts';

// Next's generic rewrite proxy logs its full target URL on network failures.
// Keep the bearer-token route out of that proxy, including its failure path.
export async function proxyDocumentVerification(
  token: string,
  send: typeof fetch = fetch,
  origin = process.env['API_INTERNAL_URL'] ?? 'http://127.0.0.1:3100',
): Promise<Response> {
  const headers = {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
  try {
    const upstream = await send(
      `${origin}/api/v1/public/documents/verify/${encodeURIComponent(token)}`,
      { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) },
    );
    if (upstream.status === 429)
      return Response.json(
        { code: 'DOCUMENT_RATE_LIMITED' },
        {
          status: 429,
          headers: { ...headers, 'Retry-After': '60' },
        },
      );
    if (!upstream.ok) throw new Error('DOCUMENT_UNAVAILABLE');
    const value = (await upstream.json()) as DocumentVerification;
    return Response.json(value, { headers });
  } catch {
    // Never rethrow or log a network error: it can contain the verification URL.
    return Response.json({ code: 'DOCUMENT_UNAVAILABLE' }, { status: 503, headers });
  }
}
