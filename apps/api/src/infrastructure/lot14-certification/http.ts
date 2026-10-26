import { request } from 'node:http';
import { failure, stagingOrigin } from './config.js';

export interface Reply {
  status: number;
  body: Record<string, unknown>;
  data: unknown;
  bytes: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

/** A private in-process-network client, never accepts a URL/host from responses or fixtures.
 * Secure cookies are held in memory and sent only to this API's loopback socket;
 * their actual names, Path and rotation still follow the production HTTP contract.
 * This is not a browser TLS/SameSite certification (covered separately).
 */
export class CertificationHttp {
  access = '';
  private csrf = '';
  private readonly cookies = new Map<string, { value: string; path: string }>();
  constructor(
    private readonly port: number,
    readonly signal: AbortSignal,
  ) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw failure();
  }
  clear() {
    this.access = '';
    this.csrf = '';
    this.cookies.clear();
  }
  async send(
    path: string,
    method = 'GET',
    body?: unknown,
    extra: Record<string, string> = {},
  ): Promise<Reply> {
    if (!/^[a-z0-9][a-z0-9/?=&_.%-]*$/i.test(path) || path.includes('..')) throw failure();
    const pathname = path === 'health/ready' ? '/health/ready' : `/api/v1/${path}`;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string> = {
      Origin: stagingOrigin,
      'Content-Type': 'application/json',
      ...extra,
    };
    if (this.access) headers.Authorization = `Bearer ${this.access}`;
    if (this.csrf) headers['X-CSRF-Token'] = this.csrf;
    const cookies = [...this.cookies].filter(([, item]) => pathname.startsWith(item.path));
    if (cookies.length)
      headers.Cookie = cookies.map(([key, item]) => `${key}=${item.value}`).join('; ');
    if (payload) headers['Content-Length'] = String(Buffer.byteLength(payload));
    return new Promise((resolve, reject) => {
      const req = request(
        {
          hostname: '127.0.0.1',
          port: this.port,
          path: pathname,
          method,
          headers,
          signal: this.signal,
          agent: false,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 2_097_152) req.destroy(failure());
            else chunks.push(chunk);
          });
          res.on('error', () => reject(failure()));
          res.on('end', () => {
            clearTimeout(deadline);
            try {
              for (const line of res.headers['set-cookie'] ?? []) {
                const [pair, ...attributes] = line.split(';');
                const separator = pair?.indexOf('=') ?? -1;
                if (separator < 1) throw failure();
                const name = pair!.slice(0, separator);
                if (!['__Host-gs_csrf', '__Secure-gs_refresh'].includes(name)) throw failure();
                const cookiePath = attributes
                  .find((value) => value.trim().toLowerCase().startsWith('path='))
                  ?.trim()
                  .slice(5);
                if (cookiePath !== (name === '__Host-gs_csrf' ? '/' : '/api/v1/auth'))
                  throw failure();
                if (!attributes.some((value) => value.trim().toLowerCase() === 'secure'))
                  throw failure();
                const value = pair!.slice(separator + 1);
                if (value) this.cookies.set(name, { value, path: cookiePath });
                else this.cookies.delete(name);
              }
              const bytes = Buffer.concat(chunks);
              const contentType = res.headers['content-type'] ?? '';
              const parsed: unknown = contentType.includes('application/json')
                ? JSON.parse(bytes.toString('utf8'))
                : {};
              if (parsed === null || typeof parsed !== 'object') throw failure();
              const result = (Array.isArray(parsed) ? {} : parsed) as Record<string, unknown>;
              if (path === 'auth/csrf' && typeof result.csrfToken === 'string')
                this.csrf = result.csrfToken;
              resolve({
                status: res.statusCode ?? 0,
                body: result,
                data: parsed,
                bytes,
                headers: res.headers,
              });
            } catch {
              reject(failure());
            }
          });
        },
      );
      const deadline = setTimeout(() => req.destroy(failure()), 10_000);
      req.once('error', () => {
        clearTimeout(deadline);
        reject(failure());
      });
      req.end(payload);
    });
  }
}

export function requireStatus(reply: Reply, status: number, code?: string): void {
  if (reply.status !== status || (code !== undefined && reply.body.code !== code)) throw failure();
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure();
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw failure();
  return value;
}
export function items(reply: Reply): Record<string, unknown>[] {
  requireStatus(reply, 200);
  if (!Array.isArray(reply.body.items)) throw failure();
  return reply.body.items.map(object);
}
