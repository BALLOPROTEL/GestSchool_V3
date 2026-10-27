import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const storageTarget = Object.freeze({
  endpoint: 'https://rwmuksaafbnphurxaofq.storage.supabase.co/storage/v1/s3',
  region: 'eu-west-1',
  bucket: 'gestschool-v3-staging-private',
});

export function probeConfiguration(environment) {
  if (
    environment.APP_ENV !== 'staging' ||
    environment.NODE_ENV !== 'production' ||
    environment.S3_ENDPOINT !== storageTarget.endpoint ||
    environment.S3_REGION !== storageTarget.region ||
    environment.S3_BUCKET !== storageTarget.bucket ||
    environment.S3_FORCE_PATH_STYLE !== 'true' ||
    !environment.S3_ACCESS_KEY_ID ||
    !environment.S3_SECRET_ACCESS_KEY
  )
    throw new Error('STAGING_STORAGE_PROBE_CONFIGURATION_INVALID');
  return {
    ...storageTarget,
    forcePathStyle: true,
    accessKeyId: environment.S3_ACCESS_KEY_ID,
    secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
  };
}

export async function runStorageProbe(adapter, fetcher, report) {
  const bytes = Buffer.from('%PDF-1.4\n% GestSchool LOT14 disposable storage probe\n%%EOF\n');
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const key = `tenants/${randomUUID()}/documents/${randomUUID()}/${checksum}.pdf`;
  const objectUrl = `${storageTarget.endpoint}/${storageTarget.bucket}/${key}`;
  let created = false;
  const pass = (check) => report({ event: 'LOT14_STORAGE_PROBE', check, result: 'PASS' });
  const equalBytes = (actual) => Buffer.from(actual).equals(bytes);
  try {
    await adapter.check();
    pass('HeadBucket');
    await adapter.putPdf(key, bytes);
    created = true;
    pass('PutObject');
    if (!equalBytes(await adapter.getPdf(key))) throw new Error('PROBE_CHECKSUM_MISMATCH');
    pass('GetObject_checksum_mime');
    for (const [check, url, options] of [
      ['anonymous_GET', objectUrl, { method: 'GET' }],
      [
        'anonymous_LIST',
        `${storageTarget.endpoint}/${storageTarget.bucket}?list-type=2&prefix=${encodeURIComponent(key)}`,
        { method: 'GET' },
      ],
      [
        'anonymous_PUT',
        objectUrl,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/pdf' },
          body: Buffer.from('%PDF-1.4\n% Anonymous overwrite must be rejected\n%%EOF\n'),
        },
      ],
    ]) {
      const response = await fetcher(url, {
        ...options,
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });
      await response.body?.cancel();
      if (![401, 403].includes(response.status)) {
        report({
          event: 'LOT14_STORAGE_PROBE',
          check,
          result: 'FAIL',
          httpStatus: response.status,
        });
        throw new Error('PROBE_ANONYMOUS_NOT_DENIED');
      }
      pass(check);
    }
    if (!equalBytes(await adapter.getPdf(key)))
      throw new Error('PROBE_ANONYMOUS_WRITE_CHANGED_OBJECT');
    pass('anonymous_PUT_did_not_change_object');
    const publicUrl = `https://rwmuksaafbnphurxaofq.supabase.co/storage/v1/object/public/${storageTarget.bucket}/${key}`;
    const publicResponse = await fetcher(publicUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    await publicResponse.body?.cancel();
    if (![400, 401, 403, 404].includes(publicResponse.status))
      throw new Error('PROBE_PUBLIC_ROUTE_NOT_DENIED');
    pass('Supabase_public_GET_denied');
    await adapter.deleteUncommittedPdf(key);
    created = false;
    try {
      await adapter.getPdf(key);
    } catch (error) {
      if (error?.$metadata?.httpStatusCode === 404) {
        pass('DeleteObject_verified');
        pass('overall');
        return;
      }
      throw new Error('PROBE_DELETE_NOT_VERIFIED', { cause: error });
    }
    throw new Error('PROBE_DELETE_NOT_VERIFIED');
  } finally {
    if (created) {
      await adapter.deleteUncommittedPdf(key);
      pass('cleanup');
    }
  }
}

export async function main() {
  let adapter;
  try {
    const configuration = probeConfiguration(process.env);
    const { S3StorageAdapter } = await import(
      new URL('../packages/infrastructure/dist/index.js', import.meta.url).href
    );
    adapter = new S3StorageAdapter(configuration);
    await runStorageProbe(adapter, globalThis.fetch, (entry) =>
      process.stdout.write(`${JSON.stringify(entry)}\n`),
    );
  } catch (error) {
    const known = [
      'AccessDenied',
      'InvalidAccessKeyId',
      'SignatureDoesNotMatch',
      'NoSuchBucket',
      'NotImplemented',
      'InvalidRequest',
      'AbortError',
      'TimeoutError',
    ];
    process.stdout.write(
      `${JSON.stringify({
        event: 'LOT14_STORAGE_PROBE',
        check: 'overall',
        result: 'FAIL',
        code: known.includes(error?.name) ? error.name : 'STORAGE_PROBE_FAILED',
      })}\n`,
    );
    process.exitCode = 1;
  } finally {
    adapter?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main();
