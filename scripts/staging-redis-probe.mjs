import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { connect as tcpConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const timeout = 3_000;

function bounded(promise) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error()), timeout);
    }),
  ]).finally(() => clearTimeout(timer));
}

function openSocket(factory, event) {
  return new Promise((resolve, reject) => {
    const socket = factory();
    socket.on('error', () => undefined);
    const timer = setTimeout(() => finish(false), timeout);
    const onError = () => finish(false);
    const onReady = () => finish(true);
    function finish(ok) {
      clearTimeout(timer);
      socket.off(event, onReady);
      socket.off('error', onError);
      socket.off('close', onError);
      if (ok) resolve(socket);
      else {
        socket.destroy();
        reject(new Error());
      }
    }
    socket.once(event, onReady);
    socket.once('error', onError);
    socket.once('close', onError);
  });
}

function reply(socket, parts, expected) {
  return new Promise((resolve, reject) => {
    let received = '';
    const timer = setTimeout(() => finish(false), timeout);
    const onError = () => finish(false);
    const onData = (chunk) => {
      received += chunk.toString('utf8');
      const end = received.indexOf('\r\n');
      if (end >= 0) finish(received.slice(0, end) === expected);
      else if (received.length > 4096) finish(false);
    };
    function finish(ok) {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onError);
      if (ok) resolve();
      else reject(new Error());
    }
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('close', onError);
    const command = `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')}`;
    socket.write(command, (error) => {
      if (error) finish(false);
    });
  });
}

const networkDefaults = {
  lookup,
  tcp: (host, port) => openSocket(() => tcpConnect({ host, port }), 'connect'),
  tls: (host, port) =>
    openSocket(
      () =>
        tlsConnect({
          host,
          port,
          servername: host,
          rejectUnauthorized: true,
          minVersion: 'TLSv1.2',
        }),
      'secureConnect',
    ),
  reply,
};

// A temporary CLI only. It is never imported by the application or its build.
// Error objects and Redis replies may contain credentials: emit only static codes.
export async function probeRedis(
  environment = process.env,
  network = networkDefaults,
  emit = (line) => process.stdout.write(`${line}\n`),
) {
  let phase = null;
  let socket;
  try {
    if (
      environment.APP_ENV !== 'staging' ||
      environment.NODE_ENV !== 'production' ||
      environment.IAM_ENV !== 'staging'
    )
      throw new Error();
    const url = new URL(environment.REDIS_URL ?? '');
    const host = url.hostname;
    const port = Number(url.port || 6379);
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    if (
      url.protocol !== 'rediss:' ||
      !host.endsWith('.upstash.io') ||
      port !== 6379 ||
      !username ||
      !password ||
      url.search ||
      url.hash ||
      !['', '/', '/0'].includes(url.pathname)
    )
      throw new Error();
    emit(
      JSON.stringify({
        protocol: url.protocol,
        host: createHash('sha256').update(host).digest('hex').slice(0, 12),
        port,
      }),
    );
    phase = 'REDIS_DNS';
    await bounded(network.lookup(host));
    emit(`${phase}_PASS`);
    phase = 'REDIS_TCP';
    socket = await network.tcp(host, port);
    emit(`${phase}_PASS`);
    socket.destroy();
    phase = 'REDIS_TLS';
    socket = await network.tls(host, port);
    emit(`${phase}_PASS`);
    phase = 'REDIS_AUTH';
    await network.reply(socket, ['AUTH', username, password], '+OK');
    emit(`${phase}_PASS`);
    phase = 'REDIS_PING';
    await network.reply(socket, ['PING'], '+PONG');
    emit(`${phase}_PASS`);
    return 0;
  } catch {
    if (phase) emit(`${phase}_FAIL`);
    return phase ? 1 : 64;
  } finally {
    socket?.destroy();
  }
}

async function inspectRuntime(environment) {
  const [{ loadInfrastructureConfig }, infrastructure] = await Promise.all([
    import('../packages/config/dist/environment.js'),
    import('../packages/infrastructure/dist/health.js'),
  ]);
  const checks = infrastructure.createInfrastructureChecks(loadInfrastructureConfig(environment));
  try {
    return await infrastructure.checkInfrastructure(checks);
  } finally {
    await infrastructure.closeInfrastructureChecks(checks);
  }
}

// Optional server-side readiness inspection: expose only the three public up/down states.
// The HTTP exception filter does not return its exception payload.
export async function probeInfrastructure(
  environment = process.env,
  inspect = inspectRuntime,
  emit = (line) => process.stdout.write(`${line}\n`),
) {
  if (
    environment.APP_ENV !== 'staging' ||
    environment.NODE_ENV !== 'production' ||
    environment.IAM_ENV !== 'staging'
  )
    return 64;
  try {
    const states = await inspect(environment);
    const dependencies = {};
    for (const name of ['postgres', 'redis', 'storage']) {
      if (!['up', 'down'].includes(states[name])) throw new Error();
      dependencies[name] = states[name];
    }
    const ready = Object.values(dependencies).every((state) => state === 'up');
    emit(
      JSON.stringify({
        check: 'LOT14_INFRASTRUCTURE',
        dependencies,
        status: ready ? 'PASS' : 'FAIL',
      }),
    );
    return ready ? 0 : 1;
  } catch {
    emit(JSON.stringify({ check: 'LOT14_INFRASTRUCTURE', status: 'FAIL' }));
    return 1;
  }
}

const workerTables = [
  '_prisma_migrations',
  'outbox_events',
  'documents',
  'message_templates',
  'report_exports',
];
const workerInspection = {
  messaging: async (environment) => {
    const { loadMessagingConfig } = await import('../packages/config/dist/messaging.js');
    loadMessagingConfig(environment);
  },
  schema: async (environment) => {
    const { loadInfrastructureConfig } = await import('../packages/config/dist/environment.js');
    const { Client } = createRequire(
      new URL('../packages/infrastructure/package.json', import.meta.url),
    )('pg');
    const client = new Client({
      connectionString: loadInfrastructureConfig(environment).databaseUrl,
      connectionTimeoutMillis: 2_000,
      query_timeout: 2_000,
    });
    try {
      await client.connect();
      const result = await client.query(`SELECT
        to_regclass('public._prisma_migrations') IS NOT NULL AS _prisma_migrations,
        to_regclass('public.outbox_events') IS NOT NULL AS outbox_events,
        to_regclass('public.documents') IS NOT NULL AS documents,
        to_regclass('public.message_templates') IS NOT NULL AS message_templates,
        to_regclass('public.report_exports') IS NOT NULL AS report_exports`);
      return result.rows[0];
    } finally {
      await client.end().catch(() => undefined);
    }
  },
};

export async function probeWorkerPreflight(
  environment = process.env,
  inspect = workerInspection,
  emit = (line) => process.stdout.write(`${line}\n`),
) {
  if (
    environment.APP_ENV !== 'staging' ||
    environment.NODE_ENV !== 'production' ||
    environment.IAM_ENV !== 'staging'
  )
    return 64;
  let check = 'LOT14_MESSAGING_CONFIG';
  try {
    await inspect.messaging(environment);
    emit(JSON.stringify({ check, status: 'PASS' }));
    check = 'LOT14_WORKER_SCHEMA';
    const observed = await inspect.schema(environment);
    const tables = {};
    for (const name of workerTables) {
      if (typeof observed?.[name] !== 'boolean') throw new Error();
      tables[name] = observed[name];
    }
    const ready = Object.values(tables).every(Boolean);
    emit(JSON.stringify({ check, status: ready ? 'PASS' : 'FAIL', tables }));
    return ready ? 0 : 1;
  } catch (error) {
    const output = { check, status: 'FAIL' };
    if (check === 'LOT14_MESSAGING_CONFIG') {
      const names = [
        'BREVO_API_KEY',
        'BREVO_WEBHOOK_SECRET',
        'BREVO_EMAIL_SENDER',
        'MESSAGING_TOKEN_KEY',
        'MESSAGING_PROVIDER',
        'APP_PUBLIC_ORIGIN',
        'IAM_MFA_KEYS_JSON',
      ];
      const fields = new Set();
      for (const issue of Array.isArray(error?.issues) ? error.issues : []) {
        const name = issue?.path?.[0];
        if (names.includes(name)) fields.add(name);
      }
      const message = typeof error?.message === 'string' ? error.message : '';
      for (const name of names) if (message.startsWith(`${name} `)) fields.add(name);
      if (
        [
          'Messaging token encryption requires a 256-bit key',
          'Messaging and IAM encryption keys must be independent',
        ].includes(message)
      )
        fields.add('MESSAGING_TOKEN_KEY');
      if (message === 'Production messaging requires Brevo') fields.add('MESSAGING_PROVIDER');
      output.variables = [...fields].toSorted();
    }
    emit(JSON.stringify(output));
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  let code = await probeRedis();
  if (code === 0 && process.argv.includes('--infrastructure')) code = await probeInfrastructure();
  if (code === 0 && process.argv.includes('--worker-preflight'))
    code = await probeWorkerPreflight();
  // Flush the small, sanitized output, then bound CLI lifetime even if OS DNS is pending.
  process.stdout.write('', () => process.exit(code));
}
