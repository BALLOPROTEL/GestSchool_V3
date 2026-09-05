import { loadInfrastructureConfig } from '@gestschool/config/environment';
import { Pool, type PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/client.js';

const databaseUrl = loadInfrastructureConfig().databaseUrl;
const pool = new Pool({ connectionString: databaseUrl });
const prisma = createPrismaClient(databaseUrl);

interface AcademicGraph {
  readonly academicPeriodId: string;
  readonly academicYearId: string;
  readonly classSubjectId: string;
  readonly schoolClassId: string;
  readonly studentId: string;
  readonly subjectId: string;
  readonly tenantId: string;
}

async function queryId(client: PoolClient, text: string, values: unknown[] = []): Promise<string> {
  const result = await client.query<{ id: string }>(text, values);
  const row = result.rows[0];
  if (!row) throw new Error('Test fixture statement did not return an identifier');
  return row.id;
}

async function withRollback(run: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await run(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function createTenant(client: PoolClient, suffix: string): Promise<string> {
  return queryId(
    client,
    `INSERT INTO tenants (slug, name, updated_at)
     VALUES ($1, $2, NOW())
     RETURNING id`,
    [`ecole-test-${suffix}`, `École test ${suffix}`],
  );
}

async function createAcademicGraph(client: PoolClient, suffix: string): Promise<AcademicGraph> {
  const tenantId = await createTenant(client, suffix);
  const academicYearId = await queryId(
    client,
    `INSERT INTO academic_years
       (tenant_id, code, name, starts_on, ends_on, status, updated_at)
     VALUES ($1, $2, $3, DATE '2026-09-01', DATE '2027-06-30', 'ACTIVE', NOW())
     RETURNING id`,
    [tenantId, `AY-${suffix}`, `Année ${suffix}`],
  );
  const academicPeriodId = await queryId(
    client,
    `INSERT INTO academic_periods
       (tenant_id, academic_year_id, name, type, ordinal, starts_on, ends_on, updated_at)
     VALUES ($1, $2, 'Trimestre 1', 'TRIMESTER', 1, DATE '2026-09-01', DATE '2026-12-18', NOW())
     RETURNING id`,
    [tenantId, academicYearId],
  );
  const levelId = await queryId(
    client,
    `INSERT INTO levels (tenant_id, code, name, updated_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id`,
    [tenantId, `L-${suffix}`, `Niveau ${suffix}`],
  );
  const schoolClassId = await queryId(
    client,
    `INSERT INTO school_classes
       (tenant_id, academic_year_id, level_id, code, name, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id`,
    [tenantId, academicYearId, levelId, `C-${suffix}`, `Classe ${suffix}`],
  );
  const subjectId = await queryId(
    client,
    `INSERT INTO subjects (tenant_id, code, name, updated_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id`,
    [tenantId, `S-${suffix}`, `Matière ${suffix}`],
  );
  const classSubjectId = await queryId(
    client,
    `INSERT INTO class_subjects
       (tenant_id, school_class_id, subject_id, coefficient, updated_at)
     VALUES ($1, $2, $3, 2, NOW())
     RETURNING id`,
    [tenantId, schoolClassId, subjectId],
  );
  const studentId = await queryId(
    client,
    `INSERT INTO students
       (tenant_id, matricule, first_name, last_name, updated_at)
     VALUES ($1, $2, 'Élève', $3, NOW())
     RETURNING id`,
    [tenantId, `MAT-${suffix}`, suffix],
  );

  return {
    academicPeriodId,
    academicYearId,
    classSubjectId,
    schoolClassId,
    studentId,
    subjectId,
    tenantId,
  };
}

async function createAssessment(
  client: PoolClient,
  graph: AcademicGraph,
  suffix: string,
): Promise<string> {
  return queryId(
    client,
    `INSERT INTO assessments
       (tenant_id, reference, class_subject_id, academic_period_id, title,
        max_score, weight, assessed_on, updated_at)
     VALUES ($1, $2, $3, $4, $5, 20, 1, DATE '2026-10-15', NOW())
     RETURNING id`,
    [
      graph.tenantId,
      `ASS-${suffix}`,
      graph.classSubjectId,
      graph.academicPeriodId,
      `Évaluation ${suffix}`,
    ],
  );
}

async function createInvoice(
  client: PoolClient,
  graph: AcademicGraph,
  suffix: string,
): Promise<string> {
  return queryId(
    client,
    `INSERT INTO invoices
       (tenant_id, student_id, invoice_number, total_amount_minor, issued_on, updated_at)
     VALUES ($1, $2, $3, 25000, DATE '2026-09-10', NOW())
     RETURNING id`,
    [graph.tenantId, graph.studentId, `FAC-${suffix}`],
  );
}

afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

describe('tenant-aware PostgreSQL integrity', () => {
  it('allows the same matricule in two tenants', async () => {
    await withRollback(async (client) => {
      const tenantAId = await createTenant(client, 'mat-a');
      const tenantBId = await createTenant(client, 'mat-b');
      await client.query(
        `INSERT INTO students
           (tenant_id, matricule, first_name, last_name, updated_at)
         VALUES
           ($1, 'MAT-SHARED', 'A', 'Test', NOW()),
           ($2, 'MAT-SHARED', 'B', 'Test', NOW())`,
        [tenantAId, tenantBId],
      );
      const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM students WHERE matricule = 'MAT-SHARED'`,
      );
      expect(result.rows[0]?.count).toBe('2');
    });
  });

  it('rejects a duplicate matricule inside one tenant', async () => {
    await withRollback(async (client) => {
      const tenantId = await createTenant(client, 'mat-duplicate');
      const insert = `INSERT INTO students
        (tenant_id, matricule, first_name, last_name, updated_at)
        VALUES ($1, 'MAT-DUPLICATE', 'Élève', 'Test', NOW())`;
      await client.query(insert, [tenantId]);
      await expect(client.query(insert, [tenantId])).rejects.toThrow();
    });
  });

  it('allows one user in several tenants but rejects a duplicate membership', async () => {
    await withRollback(async (client) => {
      const tenantAId = await createTenant(client, 'membership-a');
      const tenantBId = await createTenant(client, 'membership-b');
      const userId = await queryId(
        client,
        `INSERT INTO users (email, display_name, updated_at)
         VALUES ('multi-tenant@gestschool.invalid', 'Utilisateur Test', NOW())
         RETURNING id`,
      );
      await client.query(
        `INSERT INTO memberships (tenant_id, user_id, updated_at)
         VALUES ($1, $3, NOW()), ($2, $3, NOW())`,
        [tenantAId, tenantBId, userId],
      );
      const result = await client.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM memberships WHERE user_id = $1',
        [userId],
      );
      expect(result.rows[0]?.count).toBe('2');
      await expect(
        client.query(
          'INSERT INTO memberships (tenant_id, user_id, updated_at) VALUES ($1, $2, NOW())',
          [tenantAId, userId],
        ),
      ).rejects.toThrow();
    });
  });

  it('rejects an enrollment that points to another tenant class', async () => {
    await withRollback(async (client) => {
      const graphA = await createAcademicGraph(client, 'enrollment-a');
      const graphB = await createAcademicGraph(client, 'enrollment-b');
      await expect(
        client.query(
          `INSERT INTO enrollments
             (tenant_id, student_id, school_class_id, academic_year_id, enrolled_on, updated_at)
           VALUES ($1, $2, $3, $4, DATE '2026-09-05', NOW())`,
          [graphA.tenantId, graphA.studentId, graphB.schoolClassId, graphB.academicYearId],
        ),
      ).rejects.toThrow();
    });
  });

  it('rejects an assessment that points to another tenant class-subject', async () => {
    await withRollback(async (client) => {
      const graphA = await createAcademicGraph(client, 'assessment-a');
      const graphB = await createAcademicGraph(client, 'assessment-b');
      await expect(
        client.query(
          `INSERT INTO assessments
             (tenant_id, reference, class_subject_id, academic_period_id, title,
              max_score, weight, assessed_on, updated_at)
           VALUES ($1, 'ASS-CROSS-TENANT', $2, $3, 'Évaluation interdite',
                   20, 1, DATE '2026-10-15', NOW())`,
          [graphA.tenantId, graphB.classSubjectId, graphA.academicPeriodId],
        ),
      ).rejects.toThrow();
    });
  });

  it('rejects a grade that points to another tenant student', async () => {
    await withRollback(async (client) => {
      const graphA = await createAcademicGraph(client, 'grade-a');
      const graphB = await createAcademicGraph(client, 'grade-b');
      const assessmentId = await createAssessment(client, graphA, 'CROSS');
      await expect(
        client.query(
          `INSERT INTO grades (tenant_id, assessment_id, student_id, score, updated_at)
           VALUES ($1, $2, $3, 15, NOW())`,
          [graphA.tenantId, assessmentId, graphB.studentId],
        ),
      ).rejects.toThrow();
    });
  });

  it('rejects deleting an archived student with academic history', async () => {
    await withRollback(async (client) => {
      const graph = await createAcademicGraph(client, 'student-history');
      await client.query(
        `INSERT INTO enrollments
           (tenant_id, student_id, school_class_id, academic_year_id, enrolled_on, updated_at)
         VALUES ($1, $2, $3, $4, DATE '2026-09-05', NOW())`,
        [graph.tenantId, graph.studentId, graph.schoolClassId, graph.academicYearId],
      );
      await client.query(
        `UPDATE students SET status = 'ARCHIVED', archived_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [graph.studentId],
      );
      await expect(
        client.query('DELETE FROM students WHERE id = $1', [graph.studentId]),
      ).rejects.toThrow();
    });
  });

  it('rejects allocating a payment to another tenant invoice', async () => {
    await withRollback(async (client) => {
      const graphA = await createAcademicGraph(client, 'payment-a');
      const graphB = await createAcademicGraph(client, 'payment-b');
      const invoiceBId = await createInvoice(client, graphB, '2026-OTHER');
      const paymentAId = await queryId(
        client,
        `INSERT INTO payments
           (tenant_id, student_id, payment_reference, idempotency_key, amount_minor, updated_at)
         VALUES ($1, $2, 'PAY-2026-CROSS', 'idem-cross-tenant', 25000, NOW())
         RETURNING id`,
        [graphA.tenantId, graphA.studentId],
      );
      await expect(
        client.query(
          `INSERT INTO payment_allocations (tenant_id, payment_id, invoice_id, amount_minor)
           VALUES ($1, $2, $3, 25000)`,
          [graphA.tenantId, paymentAId, invoiceBId],
        ),
      ).rejects.toThrow();
    });
  });

  it('rejects a duplicate grade for one assessment and student', async () => {
    await withRollback(async (client) => {
      const graph = await createAcademicGraph(client, 'grade-duplicate');
      const assessmentId = await createAssessment(client, graph, 'DUPLICATE');
      const insert = `INSERT INTO grades
        (tenant_id, assessment_id, student_id, score, updated_at)
        VALUES ($1, $2, $3, 14, NOW())`;
      const values = [graph.tenantId, assessmentId, graph.studentId];
      await client.query(insert, values);
      await expect(client.query(insert, values)).rejects.toThrow();
    });
  });

  it('rejects a second enrollment for one student and academic year', async () => {
    await withRollback(async (client) => {
      const graph = await createAcademicGraph(client, 'enrollment-duplicate');
      const insert = `INSERT INTO enrollments
        (tenant_id, student_id, school_class_id, academic_year_id, enrolled_on, updated_at)
        VALUES ($1, $2, $3, $4, DATE '2026-09-05', NOW())`;
      const values = [graph.tenantId, graph.studentId, graph.schoolClassId, graph.academicYearId];
      await client.query(insert, values);
      await expect(client.query(insert, values)).rejects.toThrow();
    });
  });

  it('rejects a duplicate receipt number in one tenant', async () => {
    await withRollback(async (client) => {
      const graph = await createAcademicGraph(client, 'receipt-duplicate');
      const paymentAId = await queryId(
        client,
        `INSERT INTO payments
           (tenant_id, payment_reference, idempotency_key, amount_minor, updated_at)
         VALUES ($1, 'PAY-RECEIPT-A', 'idem-receipt-a', 10000, NOW())
         RETURNING id`,
        [graph.tenantId],
      );
      const paymentBId = await queryId(
        client,
        `INSERT INTO payments
           (tenant_id, payment_reference, idempotency_key, amount_minor, updated_at)
         VALUES ($1, 'PAY-RECEIPT-B', 'idem-receipt-b', 10000, NOW())
         RETURNING id`,
        [graph.tenantId],
      );
      const insert = `INSERT INTO receipts
        (tenant_id, payment_id, receipt_number, amount_minor)
        VALUES ($1, $2, 'REC-2026-DUPLICATE', 10000)`;
      await client.query(insert, [graph.tenantId, paymentAId]);
      await expect(client.query(insert, [graph.tenantId, paymentBId])).rejects.toThrow();
    });
  });

  it('enforces payment idempotency and positive minor-unit amounts', async () => {
    await withRollback(async (client) => {
      const tenantId = await createTenant(client, 'money');
      await expect(
        client.query(
          `INSERT INTO payments
             (tenant_id, payment_reference, idempotency_key, amount_minor, updated_at)
           VALUES ($1, 'PAY-ZERO', 'idem-zero', 0, NOW())`,
          [tenantId],
        ),
      ).rejects.toThrow();
    });

    await withRollback(async (client) => {
      const tenantId = await createTenant(client, 'idempotency');
      await client.query(
        `INSERT INTO payments
           (tenant_id, payment_reference, idempotency_key, amount_minor, updated_at)
         VALUES ($1, 'PAY-IDEM-A', 'idem-unique', 5000, NOW())`,
        [tenantId],
      );
      await expect(
        client.query(
          `INSERT INTO payments
             (tenant_id, payment_reference, idempotency_key, amount_minor, updated_at)
           VALUES ($1, 'PAY-IDEM-B', 'idem-unique', 5000, NOW())`,
          [tenantId],
        ),
      ).rejects.toThrow();
    });
  });

  it('cascades only a pure student-guardian link', async () => {
    await withRollback(async (client) => {
      const graph = await createAcademicGraph(client, 'link-cascade');
      const guardianId = await queryId(
        client,
        `INSERT INTO guardians
           (tenant_id, guardian_reference, first_name, last_name, updated_at)
         VALUES ($1, 'GRD-CASCADE', 'Parent', 'Test', NOW())
         RETURNING id`,
        [graph.tenantId],
      );
      await client.query(
        `INSERT INTO student_guardians
           (tenant_id, student_id, guardian_id, relationship)
         VALUES ($1, $2, $3, 'Responsable légal')`,
        [graph.tenantId, graph.studentId, guardianId],
      );
      await client.query('DELETE FROM guardians WHERE id = $1', [guardianId]);
      const result = await client.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM student_guardians WHERE guardian_id = $1',
        [guardianId],
      );
      expect(result.rows[0]?.count).toBe('0');
    });
  });

  it('preserves a student profile when its optional user account is deleted', async () => {
    await withRollback(async (client) => {
      const tenantId = await createTenant(client, 'user-profile');
      const userId = await queryId(
        client,
        `INSERT INTO users (email, display_name, updated_at)
         VALUES ('profile-delete@gestschool.invalid', 'Compte temporaire', NOW())
         RETURNING id`,
      );
      const studentId = await queryId(
        client,
        `INSERT INTO students
           (tenant_id, user_id, matricule, first_name, last_name, updated_at)
         VALUES ($1, $2, 'MAT-PROFILE-DELETE', 'Élève', 'Conservé', NOW())
         RETURNING id`,
        [tenantId, userId],
      );
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
      const result = await client.query<{ user_id: string | null }>(
        'SELECT user_id FROM students WHERE id = $1',
        [studentId],
      );
      expect(result.rows[0]?.user_id).toBeNull();
    });
  });

  it('restricts deletion of financial history', async () => {
    await withRollback(async (client) => {
      const graph = await createAcademicGraph(client, 'finance-restrict');
      const invoiceId = await createInvoice(client, graph, '2026-RESTRICT');
      await client.query(
        `INSERT INTO invoice_lines
           (tenant_id, invoice_id, description, quantity, unit_amount_minor, total_amount_minor)
         VALUES ($1, $2, 'Frais de test', 1, 25000, 25000)`,
        [graph.tenantId, invoiceId],
      );
      await expect(
        client.query('DELETE FROM invoices WHERE id = $1', [invoiceId]),
      ).rejects.toThrow();
    });
  });

  it('keeps audit entries and published report snapshots immutable', async () => {
    await withRollback(async (client) => {
      const graph = await createAcademicGraph(client, 'immutable');
      const auditId = await queryId(
        client,
        `INSERT INTO audit_logs (tenant_id, action, entity_type)
         VALUES ($1, 'test.created', 'test')
         RETURNING id`,
        [graph.tenantId],
      );
      await expect(
        client.query("UPDATE audit_logs SET action = 'test.changed' WHERE id = $1", [auditId]),
      ).rejects.toThrow();
    });

    await withRollback(async (client) => {
      const graph = await createAcademicGraph(client, 'snapshot');
      const reportCardId = await queryId(
        client,
        `INSERT INTO report_cards
           (tenant_id, student_id, academic_year_id, academic_period_id, school_class_id,
            status, snapshot, published_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'PUBLISHED', $6::jsonb, NOW(), NOW())
         RETURNING id`,
        [
          graph.tenantId,
          graph.studentId,
          graph.academicYearId,
          graph.academicPeriodId,
          graph.schoolClassId,
          JSON.stringify({ average: 14.5, version: 1 }),
        ],
      );
      await expect(
        client.query('UPDATE report_cards SET rank = 2 WHERE id = $1', [reportCardId]),
      ).rejects.toThrow();
    });
  });

  it('has no orphan rows in the seeded database', async () => {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM (
         SELECT m.id FROM memberships m LEFT JOIN tenants t ON t.id = m.tenant_id WHERE t.id IS NULL
         UNION ALL
         SELECT e.id FROM enrollments e LEFT JOIN students s
           ON (s.tenant_id, s.id) = (e.tenant_id, e.student_id) WHERE s.id IS NULL
         UNION ALL
         SELECT g.id FROM grades g LEFT JOIN students s
           ON (s.tenant_id, s.id) = (g.tenant_id, g.student_id) WHERE s.id IS NULL
         UNION ALL
         SELECT pa.id FROM payment_allocations pa LEFT JOIN invoices i
           ON (i.tenant_id, i.id) = (pa.tenant_id, pa.invoice_id) WHERE i.id IS NULL
       ) orphan_rows`,
    );
    expect(result.rows[0]?.count).toBe('0');

    const tenant = await prisma.tenant.findFirst({ select: { id: true } });
    expect(tenant?.id).toBeDefined();
  });

  it('uses PostgreSQL UUIDv7 defaults for technical identifiers', async () => {
    await withRollback(async (client) => {
      const tenantId = await createTenant(client, 'uuid-v7');
      expect(tenantId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });
  });
});
