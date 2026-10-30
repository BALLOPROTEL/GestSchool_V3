import { Inject, Injectable } from '@nestjs/common';
import { tenantSettingsUpdate } from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { SettingsRepository } from '../domain/settings.repository.js';
import { settingsAccess } from '../domain/policy.js';

@Injectable()
export class SettingsService {
  constructor(@Inject(SettingsRepository) private readonly repository: SettingsRepository) {}

  read(context: RequestContext) {
    settingsAccess(context, 'settings.read');
    return this.repository.read(context);
  }

  update(context: RequestContext, input: unknown) {
    settingsAccess(context, 'settings.write');
    return this.repository.update(context, tenantSettingsUpdate.parse(input));
  }
}
