import type {
  CreateReportExportInput,
  ReportActor,
  ReportExportList,
  ReportExportView,
  ReportPage,
  ReportQuery,
  ReportType,
} from '@gestschool/contracts';

export abstract class ReportsRepository {
  abstract page(type: ReportType, actor: ReportActor, query: ReportQuery): Promise<ReportPage>;
  abstract create(
    actor: ReportActor,
    input: CreateReportExportInput,
    idempotencyKey: string,
  ): Promise<ReportExportView>;
  abstract history(actor: ReportActor, page: number, pageSize: number): Promise<ReportExportList>;
  abstract download(
    actor: ReportActor,
    id: string,
  ): Promise<{ bytes: Uint8Array; fileName: string; mimeType: string }>;
}
