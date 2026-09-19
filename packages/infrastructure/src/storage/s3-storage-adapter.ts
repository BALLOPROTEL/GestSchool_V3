import {
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { InfrastructureConfig } from '@gestschool/config/environment';

import type { StorageHealth } from './storage-health.js';

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

  async getPdf(key: string): Promise<Uint8Array> {
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
    if (!/^tenants\/[0-9a-f-]{36}\/documents\/[0-9a-f-]{36}\/[0-9a-f]{64}\.pdf$/.test(key))
      throw new Error('DOCUMENT_OBJECT_KEY_INVALID');
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
  }

  close(): void {
    this.client.destroy();
  }
}
