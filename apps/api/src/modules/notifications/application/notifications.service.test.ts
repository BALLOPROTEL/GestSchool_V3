import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '../../iam/domain/context.js';
import { NotificationsService } from './notifications.service.js';
import type { NotificationsDatabase } from '../infrastructure/notifications.database.js';

const context: RequestContext = {
  requestId: randomUUID(),
  ipAddress: '127.0.0.1',
  userAgent: 'unit-test',
  userId: randomUUID(),
  sessionId: randomUUID(),
  membershipId: randomUUID(),
  tenantId: randomUUID(),
  roles: [],
  grants: [],
};

function fixture() {
  const notification = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue({ id: randomUUID() }),
    count: vi.fn().mockResolvedValue(0),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const auditLog = { create: vi.fn().mockResolvedValue({ id: randomUUID() }) };
  const transaction = { notification, auditLog };
  const client = {
    ...transaction,
    $transaction: vi.fn(async (run: (db: typeof transaction) => Promise<unknown>) =>
      run(transaction),
    ),
  };
  const service = new NotificationsService({ client } as unknown as NotificationsDatabase);
  return { service, notification, auditLog };
}

describe('notification ownership and idempotent reads', () => {
  it('scopes list, count and pagination to the current tenant and membership', async () => {
    const { service, notification } = fixture();
    await service.list(context, { page: '2', pageSize: '5', status: 'UNREAD' });
    expect(notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: context.tenantId,
          membershipId: context.membershipId,
          status: 'UNREAD',
        },
        skip: 5,
        take: 5,
      }),
    );
    expect(notification.count).toHaveBeenCalledWith({
      where: {
        tenantId: context.tenantId,
        membershipId: context.membershipId,
        status: 'UNREAD',
      },
    });
    await service.unreadCount(context);
    expect(notification.count).toHaveBeenLastCalledWith({
      where: {
        tenantId: context.tenantId,
        membershipId: context.membershipId,
        status: 'UNREAD',
      },
    });
  });

  it('refuses a foreign notification UUID without changing or auditing it', async () => {
    const { service, notification, auditLog } = fixture();
    notification.findFirst.mockResolvedValueOnce(null);
    const foreignId = randomUUID();
    await expect(service.read(context, foreignId)).rejects.toMatchObject({
      code: 'NOTIFICATION_NOT_FOUND',
      status: 404,
    });
    expect(notification.findFirst).toHaveBeenCalledWith({
      where: {
        id: foreignId,
        tenantId: context.tenantId,
        membershipId: context.membershipId,
      },
      select: { id: true },
    });
    expect(notification.updateMany).not.toHaveBeenCalled();
    expect(auditLog.create).not.toHaveBeenCalled();
  });

  it('marks one owned notification read only once, even when requested twice', async () => {
    const { service, notification, auditLog } = fixture();
    notification.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const id = randomUUID();
    await service.read(context, id);
    await service.read(context, id);
    expect(notification.updateMany).toHaveBeenCalledWith({
      where: {
        id,
        tenantId: context.tenantId,
        membershipId: context.membershipId,
        status: 'UNREAD',
      },
      data: { status: 'READ', readAt: expect.any(Date) },
    });
    expect(auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('marks all unread notifications for only the current membership', async () => {
    const { service, notification, auditLog } = fixture();
    notification.updateMany.mockResolvedValueOnce({ count: 2 });
    await expect(service.readAll(context)).resolves.toEqual({ ok: true, count: 2 });
    expect(notification.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: context.tenantId,
        membershipId: context.membershipId,
        status: 'UNREAD',
      },
      data: { status: 'READ', readAt: expect.any(Date) },
    });
    expect(auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: context.tenantId,
        actorMembershipId: context.membershipId,
        action: 'notification.read_all',
        metadata: { count: 2 },
      }),
    });
  });
});
