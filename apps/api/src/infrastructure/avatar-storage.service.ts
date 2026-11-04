import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { S3StorageAdapter, validateAvatarImage } from '@gestschool/infrastructure';
import type { AvatarMimeType, AvatarUpload } from '@gestschool/contracts';
import {
  INFRASTRUCTURE_CONFIGURATION,
  type InfrastructureConfiguration,
} from './tokens.js';

type AvatarOwnerKind = 'memberships' | 'students';

export class AvatarInputError extends Error {
  constructor() {
    super('AVATAR_INPUT_INVALID');
  }
}

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

  private decode(input: AvatarUpload): Uint8Array {
    const bytes = Buffer.from(input.base64, 'base64');
    if (bytes.toString('base64') !== input.base64) throw new AvatarInputError();
    try {
      validateAvatarImage(bytes, input.mimeType);
    } catch {
      throw new AvatarInputError();
    }
    return bytes;
  }

  async upload(
    tenantId: string,
    kind: AvatarOwnerKind,
    ownerId: string,
    input: AvatarUpload,
  ): Promise<string> {
    const bytes = this.decode(input);
    const key = this.key(tenantId, kind, ownerId, input.mimeType);
    await this.storage.putAvatar(key, bytes, input.mimeType);
    return key;
  }

  read(key: string, mimeType: AvatarMimeType): Promise<Uint8Array> {
    return this.storage.getAvatar(key, mimeType);
  }

  remove(key: string): Promise<void> {
    return this.storage.deleteAvatar(key);
  }
}
