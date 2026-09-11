import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@gestschool/database';
import type { ClassPeriodInput, ResultQuery } from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { ResultsRepository, type ResultCommand } from '../domain/results.repository.js';
import { resultFound } from '../domain/policy.js';
import { ResultsDatabase } from './database.js';
import {
  assessmentView,
  createAssessment,
  listAssessments,
  loadAssessment,
  readSheet,
  updateAssessment,
} from './assessments.js';
import {
  assessmentAction,
  correctGrade,
  enterGrades,
  gradeChanges,
  patchGrade,
} from './grade-entry.js';
import { calculateClass } from './results.js';
import { generateReports, listReports, lockReport, remarkReport } from './reports.js';

@Injectable()
export class PrismaResultsRepository extends ResultsRepository {
  constructor(@Inject(ResultsDatabase) private readonly database: ResultsDatabase) {
    super();
  }
  private read<T>(run: (db: Prisma.TransactionClient) => Promise<T>) {
    return this.database.client.$transaction(run, {
      isolationLevel: 'RepeatableRead',
      timeout: 60000,
    });
  }
  override assessments(context: RequestContext, query: ResultQuery) {
    return this.read((db) => listAssessments(db, context, query));
  }
  override assessment(context: RequestContext, id: string) {
    return this.read(async (db) => assessmentView(await loadAssessment(db, context, id)));
  }
  override sheet(context: RequestContext, id: string) {
    return this.read(async (db) =>
      readSheet(db, context, await loadAssessment(db, context, id, 'grades.read')),
    );
  }
  override changes(context: RequestContext, id: string) {
    return this.read((db) => gradeChanges(db, context, id));
  }
  override classResults(context: RequestContext, input: ClassPeriodInput) {
    return this.read((db) => calculateClass(db, context, input));
  }
  override reports(context: RequestContext, query: ResultQuery) {
    return this.read((db) => listReports(db, context, query));
  }
  override report(context: RequestContext, id: string) {
    return this.read(async (db) =>
      resultFound((await listReports(db, context, { page: 1, pageSize: 1 }, id)).items[0]),
    );
  }
  override write(context: RequestContext, command: ResultCommand) {
    return this.database.write(context, async (db) => {
      switch (command.type) {
        case 'assessment.create':
          return createAssessment(db, context, command.input);
        case 'assessment.update':
          return updateAssessment(db, context, command.id, command.input);
        case 'assessment.action':
          return assessmentAction(db, context, command.id, command.action, command.input);
        case 'grades.bulk':
          return enterGrades(db, context, command.id, command.input);
        case 'grade.update':
          return patchGrade(db, context, command.id, command.input);
        case 'grade.correct':
          return correctGrade(db, context, command.id, command.input);
        case 'reports.generate':
          return generateReports(db, context, command.input);
        case 'reports.publish':
          return generateReports(db, context, command.input, true);
        case 'report.remark':
          return remarkReport(db, context, command.id, command.input);
        case 'report.lock':
          return lockReport(db, context, command.id);
      }
    });
  }
}
