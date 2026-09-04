import type { InfrastructureConfig } from '@gestschool/config/environment';

export const INFRASTRUCTURE_CONFIGURATION = Symbol('INFRASTRUCTURE_CONFIGURATION');
export type InfrastructureConfiguration = InfrastructureConfig;
