import { Inject, Injectable } from '@nestjs/common';
import {
  academicId,
  academicQueries,
  academicYearCreate,
  academicYearUpdate,
  academicPeriodCreate,
  academicPeriodUpdate,
  levelCreate,
  levelUpdate,
  schoolClassCreate,
  schoolClassUpdate,
  subjectCreate,
  subjectUpdate,
  classSubjectCreate,
  classSubjectUpdate,
  teachingAssignmentCreate,
  teachingAssignmentUpdate,
  emptyCommand,
  type AcademicEntity,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { AcademicRepository } from '../domain/academic.repository.js';
import { academicAccess } from '../domain/policy.js';

type Creatable = 'academic-years' | 'levels' | 'classes' | 'subjects' | 'teaching-assignments';
type Archivable = Exclude<AcademicEntity, 'academic-years' | 'class-subjects'>;
@Injectable()
export class AcademicService {
  constructor(@Inject(AcademicRepository) private readonly repository: AcademicRepository) {}
  list(
    context: RequestContext,
    entity: AcademicEntity,
    input: unknown,
    parentId?: string,
    own = false,
  ) {
    academicAccess(context, entity);
    return this.repository.list(
      context,
      entity,
      academicQueries[entity].parse(input),
      parentId === undefined ? undefined : academicId.parse(parentId),
      own,
    );
  }
  get(context: RequestContext, entity: AcademicEntity, id: unknown) {
    academicAccess(context, entity);
    return this.repository.get(context, entity, academicId.parse(id));
  }
  create(context: RequestContext, entity: Creatable, input: unknown) {
    academicAccess(context, entity, 'create');
    switch (entity) {
      case 'academic-years':
        return this.repository.write(context, {
          type: 'year.create',
          input: academicYearCreate.parse(input),
        });
      case 'levels':
        return this.repository.write(context, {
          type: 'catalog.create',
          entity,
          input: levelCreate.parse(input),
        });
      case 'subjects':
        return this.repository.write(context, {
          type: 'catalog.create',
          entity,
          input: subjectCreate.parse(input),
        });
      case 'classes':
        return this.repository.write(context, {
          type: 'class.create',
          input: schoolClassCreate.parse(input),
        });
      case 'teaching-assignments':
        return this.repository.write(context, {
          type: 'assignment.create',
          input: teachingAssignmentCreate.parse(input),
        });
    }
  }
  update(
    context: RequestContext,
    entity: Creatable | 'academic-periods',
    identifier: unknown,
    input: unknown,
  ) {
    academicAccess(context, entity, 'update');
    const id = academicId.parse(identifier);
    switch (entity) {
      case 'academic-years':
        return this.repository.write(context, {
          type: 'year.update',
          id,
          input: academicYearUpdate.parse(input),
        });
      case 'academic-periods':
        return this.repository.write(context, {
          type: 'period.update',
          id,
          input: academicPeriodUpdate.parse(input),
        });
      case 'levels':
        return this.repository.write(context, {
          type: 'catalog.update',
          entity,
          id,
          input: levelUpdate.parse(input),
        });
      case 'subjects':
        return this.repository.write(context, {
          type: 'catalog.update',
          entity,
          id,
          input: subjectUpdate.parse(input),
        });
      case 'classes':
        return this.repository.write(context, {
          type: 'class.update',
          id,
          input: schoolClassUpdate.parse(input),
        });
      case 'teaching-assignments':
        return this.repository.write(context, {
          type: 'assignment.update',
          id,
          input: teachingAssignmentUpdate.parse(input),
        });
    }
  }
  transition(
    context: RequestContext,
    identifier: unknown,
    action: 'activate' | 'close' | 'archive',
    body: unknown,
  ) {
    academicAccess(context, 'academic-years', action);
    emptyCommand.parse(body ?? {});
    return this.repository.write(context, {
      type: 'year.transition',
      id: academicId.parse(identifier),
      action,
    });
  }
  archive(
    context: RequestContext,
    entity: Archivable,
    identifier: unknown,
    restore: boolean,
    body: unknown,
  ) {
    academicAccess(context, entity, 'archive');
    emptyCommand.parse(body ?? {});
    const id = academicId.parse(identifier);
    switch (entity) {
      case 'levels':
      case 'subjects':
        return this.repository.write(context, { type: 'catalog.archive', entity, id, restore });
      case 'classes':
        return this.repository.write(context, { type: 'class.archive', id, restore });
      case 'academic-periods':
        return this.repository.write(context, { type: 'period.archive', id });
      case 'teaching-assignments':
        return this.repository.write(context, { type: 'assignment.archive', id });
    }
  }
  createPeriod(context: RequestContext, yearId: unknown, input: unknown) {
    academicAccess(context, 'academic-periods', 'create');
    return this.repository.write(context, {
      type: 'period.create',
      yearId: academicId.parse(yearId),
      input: academicPeriodCreate.parse(input),
    });
  }
  createLink(context: RequestContext, classId: unknown, input: unknown) {
    academicAccess(context, 'classes', 'update');
    return this.repository.write(context, {
      type: 'link.create',
      classId: academicId.parse(classId),
      input: classSubjectCreate.parse(input),
    });
  }
  updateLink(context: RequestContext, classId: unknown, subjectId: unknown, input: unknown) {
    academicAccess(context, 'classes', 'update');
    return this.repository.write(context, {
      type: 'link.update',
      classId: academicId.parse(classId),
      subjectId: academicId.parse(subjectId),
      input: classSubjectUpdate.parse(input),
    });
  }
  removeLink(context: RequestContext, classId: unknown, subjectId: unknown, body: unknown) {
    academicAccess(context, 'classes', 'update');
    emptyCommand.parse(body ?? {});
    return this.repository.write(context, {
      type: 'link.remove',
      classId: academicId.parse(classId),
      subjectId: academicId.parse(subjectId),
    });
  }
}
