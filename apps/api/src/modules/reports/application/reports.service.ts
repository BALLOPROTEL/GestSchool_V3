import { Inject, Injectable } from '@nestjs/common';
import {
  createReportExportInput,
  reportQuery,
  reportTypes,
  type ReportActor,
  type ReportType,
} from '@gestschool/contracts';
import { z } from 'zod';
import type { RequestContext } from '../../iam/domain/context.js';
import { IamError } from '../../iam/domain/context.js';
import { ReportsRepository } from '../domain/reports.repository.js';
const actor = (context: RequestContext): ReportActor => ({
  tenantId: context.tenantId,
  membershipId: context.membershipId,
  userId: context.userId,
  roles: context.roles,
  grants: context.grants,
});
function mapped(error: unknown): never {
  if (error instanceof z.ZodError) throw error;
  const allowed = new Set([
    'AUTH_FORBIDDEN',
    'REPORT_FILTER_NOT_FOUND',
    'REPORT_ROW_LIMIT_EXCEEDED',
    'REPORT_FORMAT_UNSUPPORTED',
    'REPORT_IDEMPOTENCY_CONFLICT',
    'REPORT_CONCURRENCY_LIMIT',
    'REPORT_EXPORT_NOT_FOUND',
    'REPORT_EXPORT_EXPIRED',
    'REPORT_EXPORT_NOT_READY',
    'REPORT_CHECKSUM_MISMATCH',
  ]);
  const code =
    error instanceof Error && allowed.has(error.message) ? error.message : 'REPORT_UNAVAILABLE';
  const status = code.endsWith('NOT_FOUND')
    ? 404
    : code.includes('CONFLICT') || code.includes('CONCURRENCY')
      ? 409
      : code.includes('EXPIRED')
        ? 410
        : code.includes('LIMIT')
          ? 422
          : code === 'REPORT_UNAVAILABLE'
            ? 503
            : 403;
  throw new IamError(code, status);
}
@Injectable()
export class ReportsService {
  constructor(@Inject(ReportsRepository) private readonly repository: ReportsRepository) {}
  async page(context: RequestContext, type: string, query: unknown) {
    try {
      return await this.repository.page(
        z.enum(reportTypes).parse(type.toUpperCase()) as ReportType,
        actor(context),
        reportQuery.parse(query),
      );
    } catch (error) {
      mapped(error);
    }
  }
  async create(context: RequestContext, input: unknown, key: unknown) {
    try {
      return await this.repository.create(
        actor(context),
        createReportExportInput.parse(input),
        z.uuid().parse(key),
      );
    } catch (error) {
      mapped(error);
    }
  }
  async history(context: RequestContext, query: unknown) {
    const value = z
      .strictObject({
        page: z.coerce.number().int().positive().max(10000).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(query);
    try {
      return await this.repository.history(actor(context), value.page, value.pageSize);
    } catch (error) {
      mapped(error);
    }
  }
  async download(context: RequestContext, id: string) {
    try {
      return await this.repository.download(actor(context), z.uuid().parse(id));
    } catch (error) {
      mapped(error);
    }
  }
}
