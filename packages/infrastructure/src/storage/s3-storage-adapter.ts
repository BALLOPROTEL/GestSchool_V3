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
const avatarKey = new RegExp(
  `^tenants/${uuid}/avatars/(memberships|students)/${uuid}/${uuid}\\.(jpg|png)$`,
);
export function validateStorageKey(key: string, kind: 'document' | 'report'): void {
  if (!(kind === 'document' ? pdfKey : reportKey).test(key))
    throw new Error('STORAGE_OBJECT_KEY_INVALID');
}

export function validateAvatarStorageKey(key: string): void {
  if (!avatarKey.test(key)) throw new Error('STORAGE_OBJECT_KEY_INVALID');
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) return null;
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (length < 2 || offset + length > bytes.length) return null;
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    ) {
      if (length < 7) return null;
      return {
        height: ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0),
        width: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
      };
    }
    offset += length;
  }
  return null;
}

export function validateAvatarImage(
  bytes: Uint8Array,
  contentType: 'image/jpeg' | 'image/png',
): void {
  if (!bytes.length || bytes.length > 2_000_000) throw new Error('AVATAR_OBJECT_INVALID');
  let dimensions: { width: number; height: number } | null = null;

  if (contentType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value))
      throw new Error('AVATAR_OBJECT_INVALID');

    const width =
      (((bytes[16] ?? 0) << 24) |
        ((bytes[17] ?? 0) << 16) |
        ((bytes[18] ?? 0) << 8) |
        (bytes[19] ?? 0)) >>>
      0;
    const height =
      (((bytes[20] ?? 0) << 24) |
        ((bytes[21] ?? 0) << 16) |
        ((bytes[22] ?? 0) << 8) |
        (bytes[23] ?? 0)) >>>
      0;
    dimensions = { width, height };
  } else {
    dimensions = jpegDimensions(bytes);
  }

  if (
    !dimensions ||
    dimensions.width < 32 ||
    dimensions.height < 32 ||
    dimensions.width > 4096 ||
    dimensions.height > 4096
  )
    throw new Error('AVATAR_OBJECT_INVALID');
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

  async putAvatar(
    key: string,
    bytes: Uint8Array,
    contentType: 'image/jpeg' | 'image/png',
  ): Promise<void> {
    validateAvatarStorageKey(key);
    validateAvatarImage(bytes, contentType);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: 'private, no-store',
      }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
  }

  async getAvatar(
    key: string,
    expectedContentType: 'image/jpeg' | 'image/png',
  ): Promise<Uint8Array> {
    validateAvatarStorageKey(key);
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
    if (
      !result.Body ||
      result.ContentType !== expectedContentType ||
      !result.ContentLength ||
      result.ContentLength > 2_000_000
    )
      throw new Error('AVATAR_OBJECT_INVALID');

    const bytes = await result.Body.transformToByteArray();
    validateAvatarImage(bytes, expectedContentType);
    return bytes;
  }

  async deleteAvatar(key: string): Promise<void> {
    validateAvatarStorageKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(10_000),
    });
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
