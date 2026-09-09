import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  enrollmentClassQuery,
  enrollmentCreate,
  enrollmentEnd,
  enrollmentPage,
  enrollmentQuery,
  enrollmentTransfer,
  enrollmentUpdate,
  emptyCommand,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { EnrollmentRepository } from '../domain/enrollment.repository.js';
import { enrollmentAccess } from '../domain/policy.js';
@Injectable()
export class EnrollmentService {
  constructor(@Inject(EnrollmentRepository) private readonly repository: EnrollmentRepository) {}
  list(context: RequestContext, input: unknown, studentId?: string) {
    enrollmentAccess(context);
    const query = enrollmentQuery.parse(input);
    return this.repository.list(context, {
      ...query,
      ...(studentId === undefined ? {} : { studentId: z.uuid().parse(studentId) }),
    });
  }
  get(context: RequestContext, id: string) {
    enrollmentAccess(context);
    return this.repository.get(context, z.uuid().parse(id));
  }
  history(context: RequestContext, id: string, input: unknown) {
    enrollmentAccess(context);
    return this.repository.history(context, z.uuid().parse(id), enrollmentPage.parse(input));
  }
  classes(context: RequestContext, input: unknown) {
    enrollmentAccess(context, 'create');
    return this.repository.classes(context, enrollmentClassQuery.parse(input));
  }
  create(context: RequestContext, input: unknown) {
    enrollmentAccess(context, 'create');
    return this.repository.write(context, {
      action: 'create',
      input: enrollmentCreate.parse(input),
    });
  }
  update(context: RequestContext, id: string, input: unknown) {
    enrollmentAccess(context, 'update');
    return this.repository.write(context, {
      action: 'update',
      id: z.uuid().parse(id),
      input: enrollmentUpdate.parse(input),
    });
  }
  transition(
    context: RequestContext,
    action: 'confirm' | 'cancel' | 'transfer' | 'complete',
    identifier: string,
    input: unknown,
  ) {
    enrollmentAccess(context, action);
    const id = z.uuid().parse(identifier);
    if (action === 'confirm') {
      emptyCommand.parse(input ?? {});
      return this.repository.write(context, { action, id });
    }
    if (action === 'transfer')
      return this.repository.write(context, { action, id, input: enrollmentTransfer.parse(input) });
    return this.repository.write(context, { action, id, input: enrollmentEnd.parse(input) });
  }
}
