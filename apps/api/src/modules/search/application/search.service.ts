import { Inject, Injectable } from '@nestjs/common';
import {
  globalSearchQuery,
  type AcademicView,
  type DocumentList,
  type EnrollmentList,
  type FinanceList,
  type GlobalSearchKind,
  type GlobalSearchResponse,
  type GlobalSearchResult,
  type InvoiceView,
  type PageResult,
  type PersonView,
} from '@gestschool/contracts';

import { AcademicService } from '../../academics/application/academic.service.js';
import { academicReadScopes } from '../../academics/domain/policy.js';
import { DocumentsService } from '../../documents/application/documents.service.js';
import { documentReadScopes } from '../../documents/domain/policy.js';
import { EnrollmentService } from '../../enrollments/application/enrollment.service.js';
import { enrollmentReadScopes } from '../../enrollments/domain/policy.js';
import { FinanceService } from '../../finance/application/finance.service.js';
import { financeReadScopes } from '../../finance/domain/policy.js';
import { GuardianService } from '../../guardians/application/guardian.service.js';
import type { RequestContext } from '../../iam/domain/context.js';
import { readScopes } from '../../people/domain/policy.js';
import { StudentService } from '../../students/application/student.service.js';
import { TeacherService } from '../../teachers/application/teacher.service.js';

const PER_CATEGORY_LIMIT = 5;

function can(context: RequestContext, permission: string, scopes: readonly string[]): boolean {
  return context.grants.some(
    (grant) => grant.permission === permission && scopes.includes(grant.scope),
  );
}

function compact(parts: Array<string | null | undefined>): string | undefined {
  const value = parts.filter((part): part is string => Boolean(part)).join(' · ');
  return value || undefined;
}

function item(
  kind: GlobalSearchKind,
  id: string,
  title: string,
  resourcePath: string,
  subtitle?: string,
): GlobalSearchResult {
  return {
    kind,
    id,
    title,
    resourcePath,
    ...(subtitle ? { subtitle } : {}),
  };
}

@Injectable()
export class SearchService {
  constructor(
    @Inject(StudentService) private readonly students: StudentService,
    @Inject(GuardianService) private readonly guardians: GuardianService,
    @Inject(TeacherService) private readonly teachers: TeacherService,
    @Inject(AcademicService) private readonly academics: AcademicService,
    @Inject(EnrollmentService) private readonly enrollments: EnrollmentService,
    @Inject(FinanceService) private readonly finance: FinanceService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
  ) {}

  async search(context: RequestContext, input: unknown): Promise<GlobalSearchResponse> {
    const query = globalSearchQuery.parse(input);
    if (query.q.length < 2) return { items: [] };

    const pageSize = Math.min(PER_CATEGORY_LIMIT, query.limit);
    const tasks: Array<Promise<GlobalSearchResult[]>> = [];

    if (can(context, 'students.read', readScopes))
      tasks.push(this.people(context, 'student', query.q, pageSize));
    if (can(context, 'guardians.read', readScopes))
      tasks.push(this.people(context, 'guardian', query.q, pageSize));
    if (can(context, 'teachers.read', readScopes))
      tasks.push(this.people(context, 'teacher', query.q, pageSize));
    if (can(context, 'classes.read', academicReadScopes))
      tasks.push(this.classes(context, query.q, pageSize));
    if (can(context, 'enrollments.read', enrollmentReadScopes))
      tasks.push(this.enrollmentResults(context, query.q, pageSize));
    if (can(context, 'invoices.read', financeReadScopes))
      tasks.push(this.invoiceResults(context, query.q, pageSize));
    if (can(context, 'documents.read', documentReadScopes))
      tasks.push(this.documentResults(context, query.q, pageSize));

    const groups = await Promise.all(tasks);
    return { items: groups.flat().slice(0, query.limit) };
  }

  private async people(
    context: RequestContext,
    kind: 'student' | 'guardian' | 'teacher',
    search: string,
    pageSize: number,
  ): Promise<GlobalSearchResult[]> {
    const query = {
      page: '1',
      pageSize: String(pageSize),
      search,
      status: 'ACTIVE',
      sort: 'name',
    };
    const result: PageResult<PersonView> =
      kind === 'student'
        ? await this.students.list(context, query)
        : kind === 'guardian'
          ? await this.guardians.list(context, query)
          : await this.teachers.list(context, query);

    return result.items.map((person) => {
      const title = `${person.firstName} ${person.lastName}`;
      const personSubtitle =
        kind === 'student'
          ? person.matricule
          : kind === 'guardian'
            ? compact([person.guardianReference, person.email, person.phone])
            : person.employeeNumber;
      const resourcePath =
        kind === 'student'
          ? `/students/${person.id}`
          : `/${kind === 'guardian' ? 'parents' : 'teachers'}?search=${encodeURIComponent(search)}`;
      return item(kind, person.id, title, resourcePath, personSubtitle);
    });
  }

  private async classes(
    context: RequestContext,
    search: string,
    pageSize: number,
  ): Promise<GlobalSearchResult[]> {
    const result = (await this.academics.list(context, 'classes', {
      page: '1',
      pageSize: String(pageSize),
      search,
      status: 'ACTIVE',
      sort: 'name',
    })) as PageResult<AcademicView>;

    return result.items.map((schoolClass) =>
      item(
        'class',
        schoolClass.id,
        schoolClass.name,
        `/classes?search=${encodeURIComponent(schoolClass.name)}`,
        compact([schoolClass.code, schoolClass.academicYearName, schoolClass.levelName]),
      ),
    );
  }

  private async enrollmentResults(
    context: RequestContext,
    search: string,
    pageSize: number,
  ): Promise<GlobalSearchResult[]> {
    const result = (await this.enrollments.list(context, {
      page: '1',
      pageSize: String(pageSize),
      search,
      status: 'ALL',
      type: 'ALL',
      sort: '-enrolledOn',
    })) as EnrollmentList;

    return result.items.map((enrollment) =>
      item(
        'enrollment',
        enrollment.id,
        enrollment.studentName,
        `/enrollments?search=${encodeURIComponent(search)}`,
        compact([
          enrollment.matricule,
          enrollment.className,
          enrollment.academicYearName,
          enrollment.status,
        ]),
      ),
    );
  }

  private async invoiceResults(
    context: RequestContext,
    search: string,
    pageSize: number,
  ): Promise<GlobalSearchResult[]> {
    const result = (await this.finance.list(context, 'invoices', {
      page: 1,
      pageSize,
      search,
      status: 'ALL',
      sort: 'newest',
    })) as FinanceList;

    return result.items
      .filter((row): row is InvoiceView => row.kind === 'invoices')
      .map((invoice) =>
        item(
          'invoice',
          invoice.id,
          invoice.invoiceNumber,
          `/finance?search=${encodeURIComponent(invoice.invoiceNumber)}`,
          compact([invoice.studentName, invoice.className, invoice.status]),
        ),
      );
  }

  private async documentResults(
    context: RequestContext,
    search: string,
    pageSize: number,
  ): Promise<GlobalSearchResult[]> {
    const result = (await this.documents.list(context, {
      page: 1,
      pageSize,
      search,
    })) as DocumentList;

    return result.items.map((document) =>
      item(
        'document',
        document.id,
        document.reference,
        `/documents?search=${encodeURIComponent(document.reference)}`,
        compact([document.holder, document.documentType, document.status]),
      ),
    );
  }
}
