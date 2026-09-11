import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  assessmentInput,
  assessmentPatch,
  assessmentActionInput,
  gradeBulkInput,
  gradePatchInput,
  gradeCorrectionInput,
  classPeriodInput,
  reportRemarkInput,
  resultQuery,
  type AssessmentAction,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { ResultsRepository } from '../domain/results.repository.js';
import {
  resultAccess,
  resultActionPermission,
  resultAdminScopes,
  resultWriteScopes,
} from '../domain/policy.js';

@Injectable()
export class ResultsService {
  constructor(@Inject(ResultsRepository) private readonly repository: ResultsRepository) {}
  assessments(context: RequestContext, query: unknown) {
    resultAccess(context, 'assessments.read');
    return this.repository.assessments(context, resultQuery.parse(query));
  }
  assessment(context: RequestContext, id: string) {
    resultAccess(context, 'assessments.read');
    return this.repository.assessment(context, z.uuid().parse(id));
  }
  sheet(context: RequestContext, id: string) {
    resultAccess(context, 'grades.read');
    return this.repository.sheet(context, z.uuid().parse(id));
  }
  changes(context: RequestContext, id: string) {
    resultAccess(context, 'grades.read');
    return this.repository.changes(context, z.uuid().parse(id));
  }
  create(context: RequestContext, input: unknown) {
    resultAccess(context, 'assessments.create', resultWriteScopes);
    return this.repository.write(context, {
      type: 'assessment.create',
      input: assessmentInput.parse(input),
    });
  }
  update(context: RequestContext, id: string, input: unknown) {
    resultAccess(context, 'assessments.update', resultWriteScopes);
    return this.repository.write(context, {
      type: 'assessment.update',
      id: z.uuid().parse(id),
      input: assessmentPatch.parse(input),
    });
  }
  action(context: RequestContext, id: string, action: AssessmentAction, input: unknown) {
    resultAccess(
      context,
      resultActionPermission[action],
      ['submit', 'archive'].includes(action) ? resultWriteScopes : resultAdminScopes,
    );
    return this.repository.write(context, {
      type: 'assessment.action',
      id: z.uuid().parse(id),
      action,
      input: assessmentActionInput.parse(input),
    });
  }
  bulk(context: RequestContext, id: string, input: unknown) {
    resultAccess(context, 'grades.create', resultWriteScopes);
    resultAccess(context, 'grades.update', resultWriteScopes);
    return this.repository.write(context, {
      type: 'grades.bulk',
      id: z.uuid().parse(id),
      input: gradeBulkInput.parse(input),
    });
  }
  patchGrade(context: RequestContext, id: string, input: unknown) {
    resultAccess(context, 'grades.update', resultWriteScopes);
    return this.repository.write(context, {
      type: 'grade.update',
      id: z.uuid().parse(id),
      input: gradePatchInput.parse(input),
    });
  }
  correct(context: RequestContext, id: string, input: unknown) {
    resultAccess(context, 'grades.correct', resultAdminScopes);
    return this.repository.write(context, {
      type: 'grade.correct',
      id: z.uuid().parse(id),
      input: gradeCorrectionInput.parse(input),
    });
  }
  results(context: RequestContext, input: unknown) {
    resultAccess(context, 'grades.read', resultAdminScopes);
    return this.repository.classResults(context, classPeriodInput.parse(input));
  }
  reports(context: RequestContext, input: unknown) {
    resultAccess(context, 'report-cards.read', [...resultAdminScopes, 'OWN', 'CHILDREN']);
    return this.repository.reports(context, resultQuery.parse(input));
  }
  report(context: RequestContext, id: string) {
    resultAccess(context, 'report-cards.read', [...resultAdminScopes, 'OWN', 'CHILDREN']);
    return this.repository.report(context, z.uuid().parse(id));
  }
  generate(context: RequestContext, input: unknown, publish = false) {
    resultAccess(
      context,
      publish ? 'report-cards.publish' : 'report-cards.generate',
      resultAdminScopes,
    );
    return this.repository.write(context, {
      type: publish ? 'reports.publish' : 'reports.generate',
      input: classPeriodInput.parse(input),
    });
  }
  remark(context: RequestContext, id: string, input: unknown) {
    resultAccess(context, 'report-cards.generate', resultAdminScopes);
    return this.repository.write(context, {
      type: 'report.remark',
      id: z.uuid().parse(id),
      input: reportRemarkInput.parse(input),
    });
  }
  lockReport(context: RequestContext, id: string) {
    resultAccess(context, 'report-cards.lock', resultAdminScopes);
    return this.repository.write(context, { type: 'report.lock', id: z.uuid().parse(id) });
  }
}
