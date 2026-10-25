import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { probeInfrastructure, probeRedis } from './staging-redis-probe.mjs';

const environment = {
  APP_ENV: 'staging',
  NODE_ENV: 'production',
  IAM_ENV: 'staging',
  REDIS_URL: 'rediss://fixture-user:fixture-password@fixture.upstash.io:6379',
};

function fixture(failAt) {
  const calls = [];
  const sockets = [];
  const operation = async (name) => {
    calls.push(name);
    if (name === failAt) throw new Error(environment.REDIS_URL);
  };
  const connect = async (name) => {
    await operation(name);
    const socket = {
      destroyed: false,
      destroy() {
        this.destroyed = true;
      },
    };
    sockets.push(socket);
    return socket;
  };
  return {
    calls,
    sockets,
    network: {
      lookup: () => operation('DNS'),
      tcp: () => connect('TCP'),
      tls: () => connect('TLS'),
      reply: (_socket, parts) => operation(parts[0] === 'AUTH' ? 'AUTH' : 'PING'),
    },
  };
}

test('refuses production, REST, invalid URLs, absent credentials and PostgreSQL parameters before network access', async () => {
  for (const extra of [
    { APP_ENV: 'production' },
    { NODE_ENV: 'development' },
    { IAM_ENV: 'local' },
    { REDIS_URL: undefined },
    { REDIS_URL: 'https://rest.example.invalid' },
    { REDIS_URL: 'rediss://default:fixture@localhost:6379' },
    { REDIS_URL: 'rediss://default:fixture@fixture.upstash.io:6380' },
    { REDIS_URL: `${environment.REDIS_URL}?sslmode=verify-full` },
    { REDIS_URL: 'rediss://fixture.upstash.io:6379' },
    { REDIS_URL: 'rediss://default:%@fixture.upstash.io:6379' },
  ]) {
    const mock = fixture();
    const output = [];
    assert.equal(
      await probeRedis({ ...environment, ...extra }, mock.network, (s) => output.push(s)),
      64,
    );
    assert.deepEqual(mock.calls, []);
    assert.deepEqual(output, []);
  }
});

test('reports five phases in order, closes sockets and never prints credentials', async () => {
  const mock = fixture();
  const output = [];
  assert.equal(await probeRedis(environment, mock.network, (s) => output.push(s)), 0);
  assert.deepEqual(mock.calls, ['DNS', 'TCP', 'TLS', 'AUTH', 'PING']);
  assert.deepEqual(
    output.slice(1),
    mock.calls.map((name) => `REDIS_${name}_PASS`),
  );
  const metadata = JSON.parse(output[0]);
  assert.equal(metadata.protocol, 'rediss:');
  assert.equal(metadata.port, 6379);
  assert.match(metadata.host, /^[a-f0-9]{12}$/);
  assert.deepEqual(Object.keys(metadata).toSorted(), ['host', 'port', 'protocol']);
  assert.ok(mock.sockets.every((s) => s.destroyed));
  for (const secret of [
    'fixture-user',
    'fixture-password',
    'fixture.upstash.io',
    environment.REDIS_URL,
  ])
    assert.ok(!output.join('\n').includes(secret));
});

test('identifies the failed phase, omits error details and never runs later phases', async () => {
  const phases = ['DNS', 'TCP', 'TLS', 'AUTH', 'PING'];
  for (const [index, phase] of phases.entries()) {
    const mock = fixture(phase);
    const output = [];
    assert.equal(await probeRedis(environment, mock.network, (s) => output.push(s)), 1);
    assert.deepEqual(mock.calls, phases.slice(0, index + 1));
    assert.equal(output.at(-1), `REDIS_${phase}_FAIL`);
    assert.ok(!output.join('\n').includes(environment.REDIS_URL));
    assert.ok(mock.sockets.every((s) => s.destroyed));
  }
});

test('bounds a stalled DNS lookup and never attempts TCP after its timeout', async () => {
  const mock = fixture();
  mock.network.lookup = () => new Promise(() => undefined);
  const output = [];
  assert.equal(await probeRedis(environment, mock.network, (s) => output.push(s)), 1);
  assert.deepEqual(mock.calls, []);
  assert.equal(output.at(-1), 'REDIS_DNS_FAIL');
});

test('hostname fingerprints permit safe comparison across API and worker', async () => {
  const fingerprints = [];
  for (const url of [
    environment.REDIS_URL,
    environment.REDIS_URL,
    environment.REDIS_URL.replace('fixture.upstash.io', 'other.upstash.io'),
  ]) {
    const output = [];
    assert.equal(
      await probeRedis({ ...environment, REDIS_URL: url }, fixture().network, (s) =>
        output.push(s),
      ),
      0,
    );
    fingerprints.push(JSON.parse(output[0]).host);
  }
  assert.equal(fingerprints[0], fingerprints[1]);
  assert.notEqual(fingerprints[0], fingerprints[2]);
});

test('CLI refuses production silently without credential or error stack output', () => {
  const result = spawnSync(process.execPath, ['scripts/staging-redis-probe.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, ...environment, APP_ENV: 'production' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 64);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('optional readiness inspection reports only public dependency states and fails closed', async () => {
  for (const postgres of ['up', 'down']) {
    const output = [];
    const code = await probeInfrastructure(
      environment,
      async () => ({
        postgres,
        redis: 'up',
        storage: 'up',
        unexpected: environment.REDIS_URL,
      }),
      (s) => output.push(s),
    );
    assert.equal(code, postgres === 'up' ? 0 : 1);
    assert.deepEqual(JSON.parse(output[0]), {
      check: 'LOT14_INFRASTRUCTURE',
      dependencies: { postgres, redis: 'up', storage: 'up' },
      status: postgres === 'up' ? 'PASS' : 'FAIL',
    });
    assert.ok(!output.join('\n').includes(environment.REDIS_URL));
  }
});

test('readiness inspection never emits error details or runs outside staging', async () => {
  const output = [];
  const inspect = async () => {
    throw new Error(environment.REDIS_URL);
  };
  assert.equal(await probeInfrastructure(environment, inspect, (s) => output.push(s)), 1);
  assert.deepEqual(output, [JSON.stringify({ check: 'LOT14_INFRASTRUCTURE', status: 'FAIL' })]);
  assert.equal(
    await probeInfrastructure({ ...environment, APP_ENV: 'production' }, inspect, (s) =>
      output.push(s),
    ),
    64,
  );
  assert.equal(output.length, 1);
});
