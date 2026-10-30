import type {
  AttendanceBulkWrite,
  AttendanceHistoryQuery,
  AttendanceHistoryView,
  AttendanceSheetQuery,
  AttendanceSheetView,
} from '@gestschool/contracts';
import type { RequestContext } from '../../iam/domain/context.js';

export abstract class AttendanceRepository {
  abstract sheet(
    context: RequestContext,
    query: AttendanceSheetQuery,
  ): Promise<AttendanceSheetView>;
  abstract history(
    context: RequestContext,
    query: AttendanceHistoryQuery,
  ): Promise<AttendanceHistoryView>;
  abstract write(context: RequestContext, input: AttendanceBulkWrite): Promise<AttendanceSheetView>;
}
