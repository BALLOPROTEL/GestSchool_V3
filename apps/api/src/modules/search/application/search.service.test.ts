import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { RequestContext } from '../../iam/domain/context.js';
import { SearchService } from './search.service.js';

function context(grants: RequestContext['grants']): RequestContext {
  return {
    requestId: randomUUID(),
    ipAddress: '127.0.0.1',
    userAgent: 'unit-test',
    userId: randomUUID(),
    sessionId: randomUUID(),
    membershipId: randomUUID(),
    tenantId: randomUUID(),
    roles: [],
    grants,
  };
}

function fixture() {
  const students = { list: vi.fn() };
  const guardians = { list: vi.fn() };
  const teachers = { list: vi.fn() };
  const academics = { list: vi.fn() };
  const enrollments = { list: vi.fn() };
  const finance = { list: vi.fn() };
  const documents = { list: vi.fn() };

  const service = new SearchService(
    students as never,
    guardians as never,
    teachers as never,
    academics as never,
    enrollments as never,
    finance as never,
    documents as never,
  );

  return { service, students, guardians, teachers, academics, enrollments, finance, documents };
}

function person(prefix: string, index: number) {
  return {
    id: `${prefix}-${index}`,
    firstName: prefix,
    lastName: String(index),
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('global search aggregation', () => {
  it('returns no data and does not call a domain for a short query', async () => {
    const { service, students, finance } = fixture();
    const actor = context([
      { permission: 'students.read', scope: 'TENANT' },
      { permission: 'invoices.read', scope: 'TENANT' },
    ]);

    await expect(service.search(actor, { q: 'a' })).resolves.toEqual({ items: [] });
    expect(students.list).not.toHaveBeenCalled();
    expect(finance.list).not.toHaveBeenCalled();
  });

  it('calls only categories explicitly granted to the session', async () => {
    const { service, students, guardians, teachers, academics, enrollments, finance, documents } =
      fixture();
    students.list.mockResolvedValue({
      items: [
        {
          id: 'student-1',
          firstName: 'Awa',
          lastName: 'Koné',
          status: 'ACTIVE',
          matricule: 'STU-001',
          archivedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 5,
    });
    finance.list.mockResolvedValue({
      items: [
        {
          kind: 'invoices',
          id: 'invoice-1',
          invoiceNumber: 'INV-001',
          studentId: 'student-1',
          studentName: 'Awa Koné',
          className: '6e A',
          yearName: '2026-2027',
          enrollmentId: null,
          academicYearId: null,
          currency: 'XOF',
          status: 'ISSUED',
          issuedOn: '2026-09-01',
          dueOn: null,
          subtotalMinor: '1000',
          adjustmentsMinor: '0',
          totalAmountMinor: '1000',
          paidMinor: '0',
          balanceMinor: '1000',
          overdueMinor: '0',
          lines: [],
          adjustments: [],
        },
      ],
      total: 1,
      page: 1,
      pageSize: 5,
    });
    const actor = context([
      { permission: 'students.read', scope: 'OWN' },
      { permission: 'invoices.read', scope: 'CHILDREN' },
    ]);

    const result = await service.search(actor, { q: 'awa', limit: 10 });

    expect(students.list).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ search: 'awa', pageSize: '5' }),
    );
    expect(finance.list).toHaveBeenCalledWith(
      actor,
      'invoices',
      expect.objectContaining({ search: 'awa', pageSize: 5 }),
    );
    expect(guardians.list).not.toHaveBeenCalled();
    expect(teachers.list).not.toHaveBeenCalled();
    expect(academics.list).not.toHaveBeenCalled();
    expect(enrollments.list).not.toHaveBeenCalled();
    expect(documents.list).not.toHaveBeenCalled();
    expect(result.items).toEqual([
      {
        kind: 'student',
        id: 'student-1',
        title: 'Awa Koné',
        subtitle: 'STU-001',
        resourcePath: '/students/student-1',
      },
      {
        kind: 'invoice',
        id: 'invoice-1',
        title: 'INV-001',
        subtitle: 'Awa Koné · 6e A · ISSUED',
        resourcePath: '/finance?search=INV-001',
      },
    ]);
  });

  it('enforces the global result limit after per-category limits', async () => {
    const { service, students, guardians } = fixture();
    students.list.mockResolvedValue({
      items: [1, 2, 3].map((index) => person('Student', index)),
      total: 3,
      page: 1,
      pageSize: 3,
    });
    guardians.list.mockResolvedValue({
      items: [1, 2, 3].map((index) => person('Guardian', index)),
      total: 3,
      page: 1,
      pageSize: 3,
    });

    const result = await service.search(
      context([
        { permission: 'students.read', scope: 'TENANT' },
        { permission: 'guardians.read', scope: 'TENANT' },
      ]),
      { q: 'test', limit: 3 },
    );

    expect(result.items).toHaveLength(3);
  });
});
