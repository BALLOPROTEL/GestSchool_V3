import type { TenantSettingsUpdate, TenantSettingsView } from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';

export abstract class SettingsRepository {
  abstract read(context: RequestContext): Promise<TenantSettingsView>;
  abstract update(
    context: RequestContext,
    input: TenantSettingsUpdate,
  ): Promise<TenantSettingsView>;
}
