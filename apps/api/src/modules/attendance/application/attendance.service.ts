import { Inject, Injectable } from '@nestjs/common';
import {
  attendanceBulkWrite,
  attendanceHistoryQuery,
  attendanceSheetQuery,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';
import { AttendanceRepository } from '../domain/attendance.repository.js';
import {
  attendanceAccess,
  attendanceExportScopes,
  attendanceWriteScopes,
} from '../domain/policy.js';

function csvCell(value: string) {
  const protectedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

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

  async export(context: RequestContext, input: unknown) {
    attendanceAccess(context, 'attendance.export', attendanceExportScopes);
    const query = attendanceSheetQuery.parse(input);
    const sheet = await this.repository.sheet(context, query, 'attendance.export');
    const lines = [
      ['student', 'matricule', 'class', 'date', 'status', 'note'],
      ...sheet.students.map((student) => [
        student.studentName,
        student.matricule,
        sheet.className,
        sheet.date,
        student.status ?? 'UNMARKED',
        student.note ?? '',
      ]),
    ];
    const csv = `\uFEFF${lines.map((row) => row.map((value) => csvCell(value)).join(',')).join('\r\n')}\r\n`;
    return {
      bytes: new TextEncoder().encode(csv),
      fileName: `gestschool-attendance-${sheet.date}.csv`,
    };
  }
}
