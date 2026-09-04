import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
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

  close(): void {
    this.client.destroy();
  }
}
