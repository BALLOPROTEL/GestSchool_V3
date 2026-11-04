import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { S3StorageAdapter } from '@gestschool/infrastructure';
import type { AvatarMimeType } from '@gestschool/contracts';
import {
  INFRASTRUCTURE_CONFIGURATION,
  type InfrastructureConfiguration,
} from './tokens.js';

type AvatarOwnerKind = 'memberships' | 'students';

@Injectable()
export class AvatarStorageService {
  private readonly storage: S3StorageAdapter;

  constructor(
    @Inject(INFRASTRUCTURE_CONFIGURATION)
    configuration: InfrastructureConfiguration,
  ) {
    this.storage = new S3StorageAdapter(configuration.storage);
  }

  private key(
    tenantId: string,
    kind: AvatarOwnerKind,
    ownerId: string,
    mimeType: AvatarMimeType,
  ): string {
    return `tenants/${tenantId}/avatars/${kind}/${ownerId}/${randomUUID()}.${
      mimeType === 'image/png' ? 'png' : 'jpg'
    }`;
  }

  async upload(
    tenantId: string,
    kind: AvatarOwnerKind,
    ownerId: string,
    mimeType: AvatarMimeType,
    bytes: Uint8Array,
  ): Promise<string> {
    const key = this.key(tenantId, kind, ownerId, mimeType);
    await this.storage.putAvatar(key, bytes, mimeType);
    return key;
  }

  read(key: string, mimeType: AvatarMimeType): Promise<Uint8Array> {
    return this.storage.getAvatar(key, mimeType);
  }

  remove(key: string): Promise<void> {
    return this.storage.deleteAvatar(key);
  }
}
