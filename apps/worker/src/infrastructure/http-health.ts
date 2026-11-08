import { createServer } from 'node:http';

export function workerHealthPort(environment: NodeJS.ProcessEnv): number | null {
  const enabled = environment.WORKER_HTTP_HEALTH_ENABLED;
  if (enabled === undefined || enabled === 'false') return null;
  if (
    enabled !== 'true' ||
    environment.APP_ENV !== 'staging' ||
    environment.NODE_ENV !== 'production' ||
    !/^\d+$/.test(environment.PORT ?? '')
  )
    throw new Error('WORKER_HEALTH_CONFIGURATION_INVALID');
  const port = Number(environment.PORT);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error('WORKER_HEALTH_CONFIGURATION_INVALID');
  return port;
}

export async function startWorkerHealthServer(options: {
  port: number;
  host?: string;
  verifyReady: () => Promise<unknown>;
}): Promise<{ close(): Promise<void> }> {
  let closing = false;
  let cached: { ready: boolean; until: number } | undefined;
  let checking: Promise<boolean> | undefined;
  const isReady = async (): Promise<boolean> => {
    if (closing) return false;
    if (cached && cached.until > Date.now()) return cached.ready;
    checking ??= options.verifyReady().then(
      () => true,
      () => false,
    );
    const ready = await checking;
    cached = { ready, until: Date.now() + 5_000 };
    checking = undefined;
    return ready && !closing;
  };
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const known = ['/health', '/health/live', '/health/ready'].includes(request.url ?? '');
    let status = 'not_found';
    response.statusCode = 404;
    if (known && !['GET', 'HEAD'].includes(request.method ?? '')) {
      response.statusCode = 405;
      response.setHeader('Allow', 'GET, HEAD');
      status = 'method_not_allowed';
    } else if (known) {
      const ready = request.url === '/health/live' ? !closing : await isReady();
      response.statusCode = ready ? 200 : 503;
      status = ready ? 'ok' : 'unavailable';
    }
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ status }));
  });
  server.headersTimeout = 5_000;
  server.requestTimeout = 5_000;
  server.maxHeadersCount = 32;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host ?? '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return {
    async close() {
      closing = true;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      });
    },
  };
}
