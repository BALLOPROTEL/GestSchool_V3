import { Global, Module, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { createPrismaClient, Prisma } from '@gestschool/database';
import type { PersonView } from '@gestschool/contracts';
import { IamError, type RequestContext } from '../../iam/domain/context.js';

// Shared connection and transaction/audit mechanics only. Entity queries live in their modules.
@Injectable()
export class PeopleDatabase implements OnModuleDestroy {
  readonly client = createPrismaClient(loadInfrastructureConfig().databaseUrl);
  async onModuleDestroy() {
    await this.client.$disconnect();
  }
  async write<T>(
    context: RequestContext,
    run: (db: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.client.$transaction(
        async (db) => {
          // Serialize directory writes in a tenant: exact audit before/after, archive/link races.
          await db.$queryRaw`SELECT id FROM tenants WHERE id = ${context.tenantId}::uuid FOR UPDATE`;
          return run(db);
        },
        { timeout: 15000 },
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new IamError('PERSON_REFERENCE_CONFLICT', 409);
        if (error.code === 'P2025') throw new IamError('PERSON_NOT_FOUND', 404);
        if (error.code === 'P2003') throw new IamError('PERSON_RELATION_CONFLICT', 409);
      }
      throw error;
    }
  }
}
@Global()
@Module({ providers: [PeopleDatabase], exports: [PeopleDatabase] })
export class PeopleDatabaseModule {}

export async function audit(
  db: Prisma.TransactionClient,
  context: RequestContext,
  action: string,
  resourceId: string,
  before: unknown,
  after: unknown,
) {
  // Explicit DTO snapshots exclude IAM identities, hashes, sessions and private credentials.
  const metadata = JSON.parse(
    JSON.stringify({
      userId: context.userId,
      membershipId: context.membershipId,
      requestId: context.requestId,
      resourceId,
      before,
      after,
    }),
  ) as Prisma.InputJsonObject;
  await db.auditLog.create({
    data: {
      tenantId: context.tenantId,
      actorMembershipId: context.membershipId,
      action,
      entityType: action.split('.')[0] ?? 'person',
      entityId: resourceId,
      metadata,
    },
  });
}
type PersonRow = Omit<PersonView, 'createdAt' | 'updatedAt' | 'archivedAt' | 'birthDate'> & {
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  birthDate?: Date | null;
};
export function personView(row: PersonRow): PersonView {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    ...(row.matricule !== undefined ? { matricule: row.matricule } : {}),
    ...(row.guardianReference !== undefined ? { guardianReference: row.guardianReference } : {}),
    ...(row.employeeNumber !== undefined ? { employeeNumber: row.employeeNumber } : {}),
    ...('birthDate' in row ? { birthDate: row.birthDate?.toISOString().slice(0, 10) ?? null } : {}),
    ...(row.email !== undefined ? { email: row.email } : {}),
    ...(row.phone !== undefined ? { phone: row.phone } : {}),
  };
}
export function found<T>(value: T | null): T {
  if (!value) throw new IamError('PERSON_NOT_FOUND', 404);
  return value;
}
export function editable(status: string): void {
  if (status === 'ARCHIVED') throw new IamError('PERSON_ARCHIVED', 409);
}
export async function nextReference(
  db: Prisma.TransactionClient,
  tenantId: string,
  kind: 'students' | 'guardians' | 'teachers',
): Promise<string> {
  // Called under the tenant row lock, for explicit as well as generated references.
  // Tagged SQL identifiers are fixed here, never supplied by the HTTP caller.
  const table = {
    students: Prisma.sql`students`,
    guardians: Prisma.sql`guardians`,
    teachers: Prisma.sql`teachers`,
  }[kind];
  const column = {
    students: Prisma.sql`matricule`,
    guardians: Prisma.sql`guardian_reference`,
    teachers: Prisma.sql`employee_number`,
  }[kind];
  const prefix = `${{ students: 'MAT', guardians: 'PAR', teachers: 'EMP' }[kind]}-${new Date().getUTCFullYear()}-`;
  const pattern = `^${prefix}[0-9]+$`;
  const rows = await db.$queryRaw<{ maximum: string }[]>(
    // Cast the substring offset: PostgreSQL also has a text/regex overload.
    // Numeric -> text -> BigInt avoids JS precision loss for manually supplied long numbers.
    Prisma.sql`SELECT COALESCE(MAX(substring(${column} from ${prefix.length + 1}::integer)::numeric), 0)::text AS maximum FROM ${table} WHERE tenant_id = ${tenantId}::uuid AND ${column} ~ ${pattern}`,
  );
  const reference = `${prefix}${String(BigInt(rows[0]?.maximum ?? '0') + 1n).padStart(6, '0')}`;
  if (reference.length > 40) throw new IamError('PERSON_REFERENCE_CONFLICT', 409);
  return reference;
}
