import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateExportActor } from './generation.js';

describe('report worker actor boundary', () => {
  const tenantId = randomUUID(),
    membershipId = randomUUID();
  const actor = {
    tenantId,
    membershipId,
    userId: randomUUID(),
    roles: ['SCHOOL_ADMIN'],
    grants: [],
  };
  it('accepts only the persisted requester in the queued tenant', () => {
    expect(validateExportActor(actor, tenantId, membershipId)).toEqual(actor);
    expect(() =>
      validateExportActor({ ...actor, tenantId: randomUUID() }, tenantId, membershipId),
    ).toThrow('REPORT_ACTOR_TENANT_INVALID');
    expect(() =>
      validateExportActor({ ...actor, membershipId: randomUUID() }, tenantId, membershipId),
    ).toThrow('REPORT_ACTOR_TENANT_INVALID');
    expect(() =>
      validateExportActor({ ...actor, tenantId: '__proto__' }, tenantId, membershipId),
    ).toThrow();
  });
});
