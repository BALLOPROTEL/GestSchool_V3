import { Inject, Injectable } from '@nestjs/common';
import {
  attendanceBulkWrite,
  attendanceHistoryQuery,
  attendanceSheetQuery,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { AttendanceRepository } from '../domain/attendance.repository.js';
import { attendanceAccess, attendanceWriteScopes } from '../domain/policy.js';

@Injectable()
export class AttendanceService {
  constructor(@Inject(AttendanceRepository) private readonly repository: AttendanceRepository) {}

  sheet(context: RequestContext, input: unknown) {
    attendanceAccess(context, 'attendance.read');
    return this.repository.sheet(context, attendanceSheetQuery.parse(input));
  }

  history(context: RequestContext, input: unknown) {
    attendanceAccess(context, 'attendance.read');
    return this.repository.history(context, attendanceHistoryQuery.parse(input));
  }

  write(context: RequestContext, input: unknown) {
    attendanceAccess(context, 'attendance.write', attendanceWriteScopes);
    return this.repository.write(context, attendanceBulkWrite.parse(input));
  }
}
