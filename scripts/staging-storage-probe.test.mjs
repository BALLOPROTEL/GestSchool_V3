import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { probeConfiguration, runStorageProbe, storageTarget } from './staging-storage-probe.mjs';

const environment = {
  APP_ENV: 'staging',
  NODE_ENV: 'production',
  S3_ENDPOINT: storageTarget.endpoint,
  S3_REGION: storageTarget.region,
  S3_BUCKET: storageTarget.bucket,
  S3_FORCE_PATH_STYLE: 'true',
  S3_ACCESS_KEY_ID: 'access-key-canary-never-output',
  S3_SECRET_ACCESS_KEY: 'secret-canary-never-output',
};

test('refuses missing, local, V2, production and mismatched storage targets before any write', () => {
  assert.equal(probeConfiguration(environment).bucket, storageTarget.bucket);
  for (const change of [
    { APP_ENV: 'production' },
    { NODE_ENV: 'test' },
    { S3_ENDPOINT: 'http://127.0.0.1:9000' },
    { S3_ENDPOINT: 'https://rdxxwvpqiulnayaldcbm.storage.supabase.co/storage/v1/s3' },
    { S3_BUCKET: 'other-bucket' },
    { S3_REGION: 'eu-central-1' },
    { S3_FORCE_PATH_STYLE: 'false' },
    { S3_SECRET_ACCESS_KEY: '' },
  ])
    assert.throws(() => probeConfiguration({ ...environment, ...change }), {
      message: 'STAGING_STORAGE_PROBE_CONFIGURATION_INVALID',
    });
});

function fixture(statuses = [403, 403, 403, 404]) {
  let value;
  let deleted = 0;
  const entries = [];
  const requests = [];
  const adapter = {
    async check() {},
    async putPdf(key, bytes) {
      assert.match(key, /^tenants\/[a-f\d-]+\/documents\/[a-f\d-]+\/[a-f\d]{64}\.pdf$/);
      value = bytes;
    },
    async getPdf() {
      if (value) return value;
      throw Object.assign(new Error('safe'), { $metadata: { httpStatusCode: 404 } });
    },
    async deleteUncommittedPdf() {
      deleted++;
      value = undefined;
    },
  };
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers?.Authorization, undefined);
    assert.equal(options.headers?.apikey, undefined);
    return new Response('', { status: statuses.shift() });
  };
  return {
    adapter,
    fetcher,
    entries,
    requests,
    report: (entry) => entries.push(entry),
    deleted: () => deleted,
  };
}

test('checks an existing probe object, denies anonymous access, verifies deletion and reports only safe fields', async () => {
  const state = fixture();
  await runStorageProbe(state.adapter, state.fetcher, state.report);
  assert.equal(state.deleted(), 1);
  assert.equal(state.requests.length, 4);
  assert.deepEqual(state.entries.at(-1), {
    event: 'LOT14_STORAGE_PROBE',
    check: 'overall',
    result: 'PASS',
  });
  assert.ok(
    state.entries.every((entry) => Object.keys(entry).toSorted().join() === 'check,event,result'),
  );
});

test('refuses anonymous success, redirects and nonexistent-object responses, then cleans up', async () => {
  for (const status of [200, 302, 404]) {
    const state = fixture([status]);
    await assert.rejects(
      runStorageProbe(state.adapter, state.fetcher, state.report),
      /PROBE_ANONYMOUS_NOT_DENIED/,
    );
    assert.equal(state.deleted(), 1);
    assert.ok(!state.entries.some((entry) => entry.check === 'overall'));
  }
});

test('refuses modified bytes and deletes only its disposable probe', async () => {
  const state = fixture();
  state.adapter.getPdf = async () => Buffer.from('changed');
  await assert.rejects(
    runStorageProbe(state.adapter, state.fetcher, state.report),
    /PROBE_CHECKSUM_MISMATCH/,
  );
  assert.equal(state.deleted(), 1);
  assert.equal(state.requests.length, 0);
});

test('build hook is disabled by default and fails closed for enabled invalid or production targets', () => {
  const script = fileURLToPath(new URL('./staging-storage-build-probe.mjs', import.meta.url));
  for (const [flag, expected] of [
    [undefined, 0],
    ['false', 0],
    ['1', 1],
    ['true', 1],
  ]) {
    const env = { PATH: process.env.PATH, NODE_ENV: 'production', APP_ENV: 'production' };
    if (flag !== undefined) env.LOT14_STORAGE_PROBE = flag;
    const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
    assert.equal(result.status, expected);
    assert.equal(result.stderr, '');
    assert.ok(!result.stdout.includes(environment.S3_SECRET_ACCESS_KEY));
  }
});
