import type { GestSchoolPrismaClient } from '@gestschool/database';
import { resolveMessagingLocale, type MessagingLocale } from '@gestschool/infrastructure';

export interface MessageRecipient {
  reference: string;
  membershipId: string | null;
  guardianId: string | null;
  firstName: string;
  locale: MessagingLocale;
  email: string | null;
  phone: string | null;
}

export function normalizeInternationalPhone(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .replace(/[\s().-]/g, '')
    .replace(/^00/, '+');
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export function guardianIsEligible(
  link: { isFinancialContact: boolean; receivesNotifications: boolean },
  kind: 'SCHOOL' | 'FINANCE',
): boolean {
  return kind === 'FINANCE' ? link.isFinancialContact : link.receivesNotifications;
}

export async function studentRecipients(
  db: GestSchoolPrismaClient,
  tenantId: string,
  studentId: string,
  kind: 'SCHOOL' | 'FINANCE',
): Promise<{ studentName: string; recipients: MessageRecipient[] }> {
  const student = await db.student.findFirst({
    where: { tenantId, id: studentId, status: 'ACTIVE' },
    include: {
      user: true,
      guardians: {
        include: { guardian: { include: { user: true } } },
      },
    },
  });
  if (!student) return { studentName: '', recipients: [] };
  const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
  const members = await db.membership.findMany({
    where: {
      tenantId,
      status: 'ACTIVE',
      userId: {
        in: [student.userId, ...student.guardians.map((link) => link.guardian.userId)].filter(
          (id): id is string => Boolean(id),
        ),
      },
    },
  });
  const membershipByUser = new Map(members.map((membership) => [membership.userId, membership]));
  const recipients: MessageRecipient[] = [];
  if (kind === 'SCHOOL' && student.user && !student.user.disabledAt) {
    const membership = membershipByUser.get(student.user.id);
    if (membership)
      recipients.push({
        reference: `member:${membership.id}`,
        membershipId: membership.id,
        guardianId: null,
        firstName: student.firstName,
        locale: resolveMessagingLocale(
          student.user.preferredLocale,
          membership.preferredLocale,
          settings?.defaultLocale,
        ),
        email: student.user.email,
        phone: null,
      });
  }
  for (const link of student.guardians) {
    if (!guardianIsEligible(link, kind)) continue;
    const guardian = link.guardian;
    if (guardian.status !== 'ACTIVE' || guardian.user?.disabledAt) continue;
    const membership = guardian.userId ? membershipByUser.get(guardian.userId) : undefined;
    recipients.push({
      reference: `guardian:${guardian.id}`,
      membershipId: membership?.id ?? null,
      guardianId: guardian.id,
      firstName: guardian.firstName,
      locale: resolveMessagingLocale(
        guardian.user?.preferredLocale,
        membership?.preferredLocale,
        settings?.defaultLocale,
      ),
      email: guardian.email ?? guardian.user?.email ?? null,
      phone: normalizeInternationalPhone(guardian.phone),
    });
  }
  return { studentName: student.firstName, recipients };
}

export async function memberRecipient(
  db: GestSchoolPrismaClient,
  tenantId: string,
  userId: string,
): Promise<MessageRecipient | null> {
  const member = await db.membership.findFirst({
    where: { tenantId, userId, status: 'ACTIVE', user: { disabledAt: null } },
    include: { user: true, tenant: { include: { settings: true } } },
    orderBy: { id: 'asc' },
  });
  if (!member) return null;
  return {
    reference: `member:${member.id}`,
    membershipId: member.id,
    guardianId: null,
    firstName: member.user.displayName.split(' ')[0] ?? member.user.displayName,
    locale: resolveMessagingLocale(
      member.user.preferredLocale,
      member.preferredLocale,
      member.tenant.settings?.defaultLocale,
    ),
    email: member.user.email,
    phone: null,
  };
}
