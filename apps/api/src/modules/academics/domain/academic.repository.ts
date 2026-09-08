import type {
  AcademicEntity,
  AcademicQuery,
  AcademicView,
  PageResult,
  AcademicYearCreate,
  AcademicYearUpdate,
  AcademicPeriodCreate,
  AcademicPeriodUpdate,
  LevelCreate,
  LevelUpdate,
  SchoolClassCreate,
  SchoolClassUpdate,
  ClassSubjectCreate,
  ClassSubjectUpdate,
  TeachingAssignmentCreate,
  TeachingAssignmentUpdate,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';

export type AcademicCommand =
  | { type: 'year.create'; input: AcademicYearCreate }
  | { type: 'year.update'; id: string; input: AcademicYearUpdate }
  | { type: 'year.transition'; id: string; action: 'activate' | 'close' | 'archive' }
  | { type: 'period.create'; yearId: string; input: AcademicPeriodCreate }
  | { type: 'period.update'; id: string; input: AcademicPeriodUpdate }
  | { type: 'period.archive'; id: string }
  | { type: 'catalog.create'; entity: 'levels' | 'subjects'; input: LevelCreate }
  | { type: 'catalog.update'; entity: 'levels' | 'subjects'; id: string; input: LevelUpdate }
  | { type: 'catalog.archive'; entity: 'levels' | 'subjects'; id: string; restore: boolean }
  | { type: 'class.create'; input: SchoolClassCreate }
  | { type: 'class.update'; id: string; input: SchoolClassUpdate }
  | { type: 'class.archive'; id: string; restore: boolean }
  | { type: 'link.create'; classId: string; input: ClassSubjectCreate }
  | { type: 'link.update'; classId: string; subjectId: string; input: ClassSubjectUpdate }
  | { type: 'link.remove'; classId: string; subjectId: string }
  | { type: 'assignment.create'; input: TeachingAssignmentCreate }
  | { type: 'assignment.update'; id: string; input: TeachingAssignmentUpdate }
  | { type: 'assignment.archive'; id: string };

export abstract class AcademicRepository {
  abstract list(
    context: RequestContext,
    entity: AcademicEntity,
    query: AcademicQuery,
    parentId?: string,
    own?: boolean,
  ): Promise<PageResult<AcademicView>>;
  abstract get(context: RequestContext, entity: AcademicEntity, id: string): Promise<AcademicView>;
  abstract write(context: RequestContext, command: AcademicCommand): Promise<AcademicView>;
}
