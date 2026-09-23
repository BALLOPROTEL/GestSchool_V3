import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '../../iam/domain/context.js';
import type { MessagingDatabase } from '../infrastructure/messaging.database.js';
import { CommunicationsService } from './communications.service.js';

const context = (role: string, scope: 'TENANT' | 'ASSIGNED' = 'TENANT'): RequestContext => ({
  requestId: randomUUID(),
  ipAddress: '127.0.0.1',
  userAgent: 'unit-test',
  userId: randomUUID(),
  sessionId: randomUUID(),
  membershipId: randomUUID(),
  tenantId: randomUUID(),
  roles: [role],
  grants: [
    { permission: 'communications.read', scope },
    { permission: 'communications.send', scope },
  ],
});

function fixture() {
  const createdRequest = { id: randomUUID(), recipientCount: 1 };
  const student = { findFirst: vi.fn().mockResolvedValue({ id: randomUUID() }) };
  const schoolClass = { findFirst: vi.fn() };
  const communicationRequest = {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(createdRequest),
  };
  const outboxEvent = { create: vi.fn().mockResolvedValue({ id: randomUUID() }) };
  const auditLog = { create: vi.fn().mockResolvedValue({ id: randomUUID() }) };
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    communicationRequest,
    outboxEvent,
    auditLog,
  };
  const client = {
    student,
    schoolClass,
    message: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(async (run: (db: typeof transaction) => Promise<unknown>) =>
      run(transaction),
    ),
  };
  return {
    service: new CommunicationsService({ client } as unknown as MessagingDatabase),
    student,
    schoolClass,
    communicationRequest,
    outboxEvent,
    auditLog,
  };
}

const body = (studentId: string, category: 'SCHOOL' | 'ACADEMIC' | 'FINANCE' = 'SCHOOL') => ({
  category,
  audience: { type: 'STUDENT', id: studentId },
  channels: ['EMAIL'],
  confirmedRecipientCount: 1,
});

describe('controlled manual communications', () => {
  it('creates one durable request, outbox event and safe audit under a tenant lock', async () => {
    const { service, student, communicationRequest, outboxEvent, auditLog } = fixture();
    const actor = context('SCHOOL_ADMIN');
    const studentId = randomUUID();
    student.findFirst.mockResolvedValueOnce({ id: studentId });
    await expect(service.send(actor, body(studentId), randomUUID())).resolves.toMatchObject({
      recipientCount: 1,
    });
    expect(communicationRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: actor.tenantId,
        senderMembershipId: actor.membershipId,
        audienceId: studentId,
        channels: ['IN_APP', 'EMAIL'],
      }),
    });
    expect(outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'communications.manual.requested.v1' }),
    });
    expect(auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'communication.manual_send' }),
    });
  });

  it('denies role/category escalation before creating a request', async () => {
    const { service, communicationRequest } = fixture();
    await expect(
      service.send(context('ACCOUNTANT'), body(randomUUID(), 'ACADEMIC'), randomUUID()),
    ).rejects.toMatchObject({ code: 'COMMUNICATION_CATEGORY_FORBIDDEN', status: 403 });
    await expect(
      service.send(context('ACADEMIC_STAFF'), body(randomUUID(), 'FINANCE'), randomUUID()),
    ).rejects.toMatchObject({ code: 'COMMUNICATION_CATEGORY_FORBIDDEN', status: 403 });
    expect(communicationRequest.create).not.toHaveBeenCalled();
  });

  it('embeds the authenticated teacher assignment in the audience query', async () => {
    const { service, student } = fixture();
    const teacher = context('TEACHER', 'ASSIGNED');
    const studentId = randomUUID();
    student.findFirst.mockResolvedValueOnce({ id: studentId });
    await service.preview(teacher, {
      category: 'ACADEMIC',
      audience: { type: 'STUDENT', id: studentId },
    });
    expect(student.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId: teacher.tenantId,
        id: studentId,
        enrollments: {
          some: {
            status: 'ACTIVE',
            schoolClass: {
              subjects: {
                some: {
                  assignments: {
                    some: expect.objectContaining({
                      tenantId: teacher.tenantId,
                      teacher: expect.objectContaining({ userId: teacher.userId }),
                    }),
                  },
                },
              },
            },
          },
        },
      }),
      select: { id: true },
    });
  });

  it('returns the same operation for the same tenant idempotency key', async () => {
    const { service, communicationRequest, outboxEvent } = fixture();
    const existing = { id: randomUUID(), recipientCount: 3 };
    communicationRequest.findUnique.mockResolvedValueOnce(existing);
    await expect(
      service.send(context('SCHOOL_ADMIN'), body(randomUUID()), randomUUID()),
    ).resolves.toEqual(existing);
    expect(communicationRequest.create).not.toHaveBeenCalled();
    expect(outboxEvent.create).not.toHaveBeenCalled();
  });
});
