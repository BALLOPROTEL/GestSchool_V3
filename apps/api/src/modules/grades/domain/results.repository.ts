import type {
  AssessmentInput,
  AssessmentPatch,
  AssessmentAction,
  AssessmentActionInput,
  AssessmentView,
  GradeBulkInput,
  GradePatchInput,
  GradeCorrectionInput,
  GradeChangeView,
  GradeSheet,
  ClassPeriodInput,
  ClassResults,
  ReportRemarkInput,
  ReportCardView,
  ResultList,
  ResultQuery,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';

export type ResultCommand =
  | { type: 'assessment.create'; input: AssessmentInput }
  | { type: 'assessment.update'; id: string; input: AssessmentPatch }
  | {
      type: 'assessment.action';
      id: string;
      action: AssessmentAction;
      input: AssessmentActionInput;
    }
  | { type: 'grades.bulk'; id: string; input: GradeBulkInput }
  | { type: 'grade.update'; id: string; input: GradePatchInput }
  | { type: 'grade.correct'; id: string; input: GradeCorrectionInput }
  | { type: 'reports.generate' | 'reports.publish'; input: ClassPeriodInput }
  | { type: 'report.remark'; id: string; input: ReportRemarkInput }
  | { type: 'report.lock'; id: string };
export abstract class ResultsRepository {
  abstract assessments(
    context: RequestContext,
    query: ResultQuery,
  ): Promise<ResultList<AssessmentView>>;
  abstract assessment(context: RequestContext, id: string): Promise<AssessmentView>;
  abstract sheet(context: RequestContext, id: string): Promise<GradeSheet>;
  abstract changes(context: RequestContext, id: string): Promise<GradeChangeView[]>;
  abstract classResults(context: RequestContext, input: ClassPeriodInput): Promise<ClassResults>;
  abstract reports(
    context: RequestContext,
    query: ResultQuery,
  ): Promise<ResultList<ReportCardView>>;
  abstract report(context: RequestContext, id: string): Promise<ReportCardView>;
  abstract write(
    context: RequestContext,
    command: ResultCommand,
  ): Promise<AssessmentView | GradeSheet | ReportCardView | ReportCardView[]>;
}
