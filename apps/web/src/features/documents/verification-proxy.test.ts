import { describe, expect, it, vi } from 'vitest';
import { proxyDocumentVerification } from './verification-proxy';

describe('verification proxy privacy', () => {
  it('returns the public result without forwarding cookies or authorization', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 'INVALID' }));
    const result = await proxyDocumentVerification('invalid', send);
    expect(await result.json()).toEqual({ status: 'INVALID' });
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(send.mock.calls[0]?.[1]?.headers).toBeUndefined();
    expect(send.mock.calls[0]?.[1]?.redirect).toBe('error');
  });
  it('does not log or return a failed upstream URL', async () => {
    const log = vi.spyOn(console, 'error'),
      warn = vi.spyOn(console, 'warn');
    try {
      const send = vi.fn<typeof fetch>().mockRejectedValue(new Error('private upstream URL'));
      const result = await proxyDocumentVerification('private-test-token', send);
      expect(result.status).toBe(503);
      expect(await result.json()).toEqual({ code: 'DOCUMENT_UNAVAILABLE' });
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
  });
  it('preserves the backend rate limit without forwarding its error body', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ private: 'upstream data' }, { status: 429 }));
    const result = await proxyDocumentVerification('invalid', send);
    expect(result.status).toBe(429);
    expect(result.headers.get('retry-after')).toBe('60');
    expect(await result.json()).toEqual({ code: 'DOCUMENT_RATE_LIMITED' });
  });
});
