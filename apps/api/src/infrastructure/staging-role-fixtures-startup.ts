import { randomUUID } from 'node:crypto';

import { CredentialsService } from '../modules/iam/application/credentials.service.js';
import type { RequestMetadata } from '../modules/iam/domain/context.js';
import { Passwords } from '../modules/iam/infrastructure/crypto.js';
import { IamRepository } from '../modules/iam/infrastructure/iam.repository.js';

const failureCode = 'STAGING_ROLE_FIXTURES_STARTUP_FAILED';
const stagingHost = 'dpg-dbei7tqvcj2c73d1qukg-a.frankfurt-postgres.render.com';
const stagingDatabase = 'gestschool_v3_postgres_staging';

export const stagingRoleFixtures = [
  {
    role: 'SUPER_ADMIN',
    email: 'leprotel+superadmin@gmail.com',
    displayName: 'Recette Super Admin',
  },
  {
    role: 'SCHOOL_ADMIN',
    email: 'leprotel+schooladmin@gmail.com',
    displayName: 'Recette School Admin',
  },
  {
    role: 'DIRECTOR',
    email: 'leprotel+director@gmail.com',
    displayName: 'Recette Direction',
  },
  {
    role: 'ACADEMIC_STAFF',
    email: 'leprotel+scolarite@gmail.com',
    displayName: 'Recette Scolarité',
  },
  {
    role: 'ACCOUNTANT',
    email: 'leprotel+finance@gmail.com',
    displayName: 'Recette Finance',
  },
  {
    role: 'TEACHER',
    email: 'leprotel+teacher@gmail.com',
    displayName: 'Recette Enseignant',
  },
  {
    role: 'PARENT',
    email: 'leprotel+parent@gmail.com',
    displayName: 'Recette Parent',
  },
  {
    role: 'STUDENT',
    email: 'leprotel+student@gmail.com',
    displayName: 'Recette Élève',
  },
] as const;

type FixtureRole = (typeof stagingRoleFixtures)[number]['role'];

function safeStagingDatabase(environment: NodeJS.ProcessEnv): string {
  if (
    environment.STAGING_ROLE_FIXTURES_APPLY !== 'true' ||
    environment.APP_ENV !== 'staging' ||
    environment.NODE_ENV !== 'production' ||
    environment.IAM_ENV !== 'staging' ||
    environment.APP_PUBLIC_ORIGIN !== 'https://gestschool-v3-staging.vercel.app'
  )
    throw new Error(failureCode);

  const owner = environment.STAGING_ROLE_FIXTURES_OWNER_EMAIL?.trim().toLowerCase();
  if (!owner || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner)) throw new Error(failureCode);

  const url = new URL(environment.DATABASE_URL ?? '');
  const parameters = [...url.searchParams.entries()];
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== stagingHost ||
    Number(url.port || 5432) !== 5432 ||
    decodeURIComponent(url.pathname) !== `/${stagingDatabase}` ||
    !url.username ||
    !url.password ||
    url.hash ||
    parameters.length !== 1 ||
    parameters[0]?.[0] !== 'sslmode' ||
    parameters[0]?.[1] !== 'verify-full'
  )
    throw new Error(failureCode);

  return url.href;
}

export async function provisionStagingRoleFixtures(
  repository: IamRepository,
  ownerEmail: string,
  issueActivation: (
    membershipId: string,
    tenantId: string,
    metadata: RequestMetadata,
  ) => Promise<void>,
  metadata: RequestMetadata,
): Promise<{ created: number; existing: number; ownerPromoted: boolean }> {
  const owner = await repository.userByEmail(ownerEmail);
  if (!owner || owner.disabledAt || !owner.identity?.activatedAt) throw new Error(failureCode);

  const ownerMemberships = (await repository.memberships(owner.id)).filter(
    (membership) => membership.status === 'ACTIVE' && membership.tenant.status === 'ACTIVE',
  );
  if (ownerMemberships.length !== 1) throw new Error(failureCode);

  const ownerMembership = ownerMemberships[0]!;
  const tenantId = ownerMembership.tenantId;
  const roles = await repository.assignableRoles(tenantId, true);
  const roleByCode = new Map<FixtureRole, (typeof roles)[number]>();

  for (const fixture of stagingRoleFixtures) {
    const matches = roles.filter(
      (role) => role.code === fixture.role && role.isSystem && role.tenantId === null,
    );
    if (matches.length !== 1) throw new Error(failureCode);
    roleByCode.set(fixture.role, matches[0]!);
  }

  let ownerPromoted = false;
  if (!ownerMembership.roles.some((binding) => binding.role.code === 'SUPER_ADMIN')) {
    const ownerCodes = ownerMembership.roles.map((binding) => binding.role.code);
    if (ownerCodes.length !== 1 || ownerCodes[0] !== 'SCHOOL_ADMIN') throw new Error(failureCode);

    const superAdmin = roleByCode.get('SUPER_ADMIN');
    if (!superAdmin) throw new Error(failureCode);

    await repository.atomic(owner.id, async (current) => {
      await current.replaceRole(ownerMembership.id, tenantId, superAdmin.id);
      await current.revokeMembershipSessions(owner.id, ownerMembership.id);
      await current.invalidateMembershipTokens(owner.id, ownerMembership.id);
      await current.audit(
        'staging.super_admin.promoted',
        metadata,
        owner.id,
        tenantId,
        ownerMembership.id,
      );
    });
    ownerPromoted = true;
  }

  let created = 0;
  let existing = 0;

  for (const fixture of stagingRoleFixtures) {
    const role = roleByCode.get(fixture.role);
    if (!role) throw new Error(failureCode);

    const known = await repository.userByEmail(fixture.email);
    if (known?.disabledAt) throw new Error(failureCode);

    let membership =
      known && (await repository.memberships(known.id)).find((item) => item.tenantId === tenantId);

    if (membership) {
      const roleIds = membership.roles.map((binding) => binding.role.id);
      if (roleIds.length !== 1 || roleIds[0] !== role.id) throw new Error(failureCode);

      if (
        (membership.status === 'INVITED' && Boolean(known?.identity?.activatedAt)) ||
        (membership.status === 'ACTIVE' && !known?.identity?.activatedAt) ||
        !['INVITED', 'ACTIVE'].includes(membership.status)
      )
        throw new Error(failureCode);

      existing += 1;
    } else {
      if (known?.identity?.activatedAt) throw new Error(failureCode);

      const invited = await repository.atomic(owner.id, async (current) => {
        const result = await current.invite(fixture.email, fixture.displayName, tenantId, role.id);
        await current.audit('user.invited', metadata, owner.id, tenantId, result.membership.id);
        return result;
      });
      if (!invited.activationRequired) throw new Error(failureCode);

      membership = (await repository.memberships(invited.user.id)).find(
        (item) => item.id === invited.membership.id,
      );
      if (!membership) throw new Error(failureCode);
      created += 1;
    }

    if (membership.status === 'INVITED')
      await issueActivation(membership.id, tenantId, {
        ...metadata,
        requestId: randomUUID(),
      });
  }

  await repository.audit(
    'staging.role_fixtures.provisioned',
    metadata,
    owner.id,
    tenantId,
    ownerMembership.id,
  );

  return { created, existing, ownerPromoted };
}

export async function runStagingRoleFixturesStartup(
  environment: NodeJS.ProcessEnv = process.env,
  emit: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
  dependencies: { open?: (url: string) => IamRepository } = {},
): Promise<void> {
  const flag = environment.STAGING_ROLE_FIXTURES_APPLY;
  if (flag === undefined || flag === 'false') return;

  const databaseUrl = safeStagingDatabase(environment);
  const ownerEmail = environment.STAGING_ROLE_FIXTURES_OWNER_EMAIL!.trim().toLowerCase();
  const repository = (dependencies.open ?? IamRepository.connect)(databaseUrl);

  try {
    const credentials = new CredentialsService(repository, new Passwords());
    const result = await provisionStagingRoleFixtures(
      repository,
      ownerEmail,
      (membershipId, tenantId, metadata) =>
        credentials.issueForMembership(membershipId, tenantId, 'ACTIVATION', true, metadata),
      {
        requestId: randomUUID(),
        ipAddress: '127.0.0.1',
        userAgent: 'gestschool-staging-role-fixtures',
      },
    );

    emit(
      JSON.stringify({
        check: 'STAGING_ROLE_FIXTURES',
        status: 'PASS',
        created: result.created,
        existing: result.existing,
        ownerPromoted: result.ownerPromoted,
      }),
    );
  } catch {
    throw new Error(failureCode);
  } finally {
    await repository.close().catch(() => undefined);
  }
}
