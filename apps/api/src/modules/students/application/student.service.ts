import { Inject, Injectable } from '@nestjs/common';
import {
  avatarUpload,
  peopleQuery,
  personId,
  studentCreate,
  studentUpdate,
} from '@gestschool/contracts';
import { deny, type RequestContext } from '../../iam/domain/context.js';
import { requireWrite, readScopes } from '../../people/domain/policy.js';
import {
  AvatarInputError,
  AvatarStorageService,
} from '../../../infrastructure/avatar-storage.service.js';
import { StudentRepository } from '../domain/student.repository.js';

@Injectable()
export class StudentService {
  constructor(
    @Inject(StudentRepository) private readonly repository: StudentRepository,
    @Inject(AvatarStorageService) private readonly avatars: AvatarStorageService,
  ) {}
  private read(context: RequestContext) {
    if (
      !context.grants.some(
        (grant) =>
          grant.permission === 'students.read' && readScopes.some((scope) => scope === grant.scope),
      )
    )
      deny();
  }
  list(context: RequestContext, query: unknown) {
    this.read(context);
    return this.repository.list(context, peopleQuery.parse(query));
  }
  get(context: RequestContext, id: unknown) {
    this.read(context);
    return this.repository.get(context, personId.parse(id));
  }
  create(context: RequestContext, input: unknown) {
    requireWrite(context, 'students', 'create');
    return this.repository.create(context, studentCreate.parse(input));
  }
  update(context: RequestContext, id: unknown, input: unknown) {
    requireWrite(context, 'students', 'update');
    return this.repository.update(context, personId.parse(id), studentUpdate.parse(input));
  }
  archive(context: RequestContext, id: unknown, restore: boolean) {
    requireWrite(context, 'students', 'archive');
    return this.repository.archive(context, personId.parse(id), restore);
  }

  async avatar(context: RequestContext, id: unknown) {
    this.read(context);
    const studentId = personId.parse(id);
    await this.repository.get(context, studentId);
    const avatar = await this.repository.avatar(context, studentId);
    if (!avatar) return null;
    return {
      bytes: await this.avatars.read(avatar.key, avatar.mimeType),
      mimeType: avatar.mimeType,
    };
  }

  async updateAvatar(context: RequestContext, id: unknown, input: unknown): Promise<void> {
    requireWrite(context, 'students', 'update');
    const studentId = personId.parse(id);
    const payload = avatarUpload.parse(input);
    let nextKey: string;
    try {
      nextKey = await this.avatars.upload(context.tenantId, 'students', studentId, payload);
    } catch (error) {
      if (error instanceof AvatarInputError) deny('AUTH_INVALID_REQUEST', 400);
      throw error;
    }

    let previousKey: string | null;
    try {
      previousKey = await this.repository.setAvatar(context, studentId, nextKey, payload.mimeType);
    } catch (error) {
      await this.avatars.remove(nextKey).catch(() => undefined);
      throw error;
    }
    if (previousKey && previousKey !== nextKey)
      await this.avatars.remove(previousKey).catch(() => undefined);
  }

  async deleteAvatar(context: RequestContext, id: unknown): Promise<void> {
    requireWrite(context, 'students', 'update');
    const previousKey = await this.repository.clearAvatar(context, personId.parse(id));
    if (previousKey) await this.avatars.remove(previousKey).catch(() => undefined);
  }
}
