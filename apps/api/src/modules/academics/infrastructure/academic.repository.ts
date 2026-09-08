import { Inject, Injectable } from '@nestjs/common';
import type { AcademicEntity, AcademicQuery } from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { AcademicRepository, type AcademicCommand } from '../domain/academic.repository.js';
import { required } from '../domain/policy.js';
import { AcademicDatabase } from './database.js';
import { readAcademic } from './reads.js';
import { writeYear, writePeriod } from './year-writes.js';
import { writeCatalog, writeClass } from './catalog-writes.js';
import { writeLink, writeAssignment } from './assignment-writes.js';

@Injectable()
export class PrismaAcademicRepository extends AcademicRepository {
  constructor(@Inject(AcademicDatabase) private readonly database: AcademicDatabase) {
    super();
  }
  override list(
    context: RequestContext,
    entity: AcademicEntity,
    query: AcademicQuery,
    parentId?: string,
    own = false,
  ) {
    return this.database.client.$transaction(
      (db) => readAcademic(db, context, entity, query, parentId, own),
      { isolationLevel: 'RepeatableRead', timeout: 15000 },
    );
  }
  override async get(context: RequestContext, entity: AcademicEntity, id: string) {
    const result = await this.database.client.$transaction(
      (db) =>
        readAcademic(
          db,
          context,
          entity,
          { page: 1, pageSize: 1, status: 'ALL', sort: 'name', search: '' },
          undefined,
          false,
          id,
        ),
      { isolationLevel: 'RepeatableRead' },
    );
    return required(result.items[0] ?? null);
  }
  override write(context: RequestContext, command: AcademicCommand) {
    return this.database.write(context, (db) => {
      switch (command.type) {
        case 'year.create':
        case 'year.update':
        case 'year.transition':
          return writeYear(db, context, command);
        case 'period.create':
        case 'period.update':
        case 'period.archive':
          return writePeriod(db, context, command);
        case 'catalog.create':
        case 'catalog.update':
        case 'catalog.archive':
          return writeCatalog(db, context, command);
        case 'class.create':
        case 'class.update':
        case 'class.archive':
          return writeClass(db, context, command);
        case 'link.create':
        case 'link.update':
        case 'link.remove':
          return writeLink(db, context, command);
        case 'assignment.create':
        case 'assignment.update':
        case 'assignment.archive':
          return writeAssignment(db, context, command);
      }
    });
  }
}
