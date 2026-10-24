import {
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { InfrastructureConfig } from '@gestschool/config/environment';

import type { StorageHealth } from './storage-health.js';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const pdfKey = new RegExp(`^tenants/${uuid}/documents/${uuid}/[0-9a-f]{64}\\.pdf$`);
const reportKey = new RegExp(`^tenants/${uuid}/reports/${uuid}/[0-9a-f]{64}\\.(csv|xlsx|pdf)$`);
export function validateStorageKey(key: string, kind: 'document' | 'report'): void {
  if (!(kind === 'document' ? pdfKey : reportKey).test(key))
    throw new Error('STORAGE_OBJECT_KEY_INVALID');
}

export class S3StorageAdapter implements StorageHealth {
  readonly name = 'storage';
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(
    config: InfrastructureConfig['storage'],
    private readonly timeoutMilliseconds = 2_000,
  ) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      region: config.region,
    });
  }

  async check(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), {
      abortSignal: AbortSignal.timeout(this.timeoutMilliseconds),
    });
  }

  async putPdf(key: string, bytes: Uint8Array): Promise<void> {
    validateStorageKey(key, 'document');
    if (bytes.length > 10_000_000 || Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-')
      throw new Error('DOCUMENT_OBJECT_INVALID');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: 'application/pdf',
        CacheControl: 'private, no-store',
      }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
  }

  async putReport(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    validateStorageKey(key, 'report');
    const mime: Record<string, string> = {
      csv: 'text/csv; charset=utf-8',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
    };
    if (
      !bytes.length ||
      bytes.length > 50_000_000 ||
      contentType !== mime[key.split('.').at(-1) ?? '']
    )
      throw new Error('REPORT_OBJECT_INVALID');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: 'private, no-store',
      }),
      { abortSignal: AbortSignal.timeout(30_000) },
    );
  }

  async getReport(key: string, expectedContentType: string): Promise<Uint8Array> {
    validateStorageKey(key, 'report');
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(30_000),
    });
    if (
      !result.Body ||
      result.ContentType !== expectedContentType ||
      !result.ContentLength ||
      result.ContentLength > 50_000_000
    )
      throw new Error('REPORT_OBJECT_INVALID');
    return result.Body.transformToByteArray();
  }

  async getPdf(key: string): Promise<Uint8Array> {
    validateStorageKey(key, 'document');
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
    if (
      !result.Body ||
      result.ContentType !== 'application/pdf' ||
      !result.ContentLength ||
      result.ContentLength > 10_000_000
    )
      throw new Error('DOCUMENT_OBJECT_INVALID');
    return result.Body.transformToByteArray();
  }

  async deleteUncommittedPdf(key: string): Promise<void> {
    validateStorageKey(key, 'document');
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
  }

  async deleteUncommittedReport(key: string): Promise<void> {
    validateStorageKey(key, 'report');
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
  }

  close(): void {
    this.client.destroy();
  }
}
