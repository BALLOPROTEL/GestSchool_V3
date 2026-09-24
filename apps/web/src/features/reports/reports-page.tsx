'use client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Pagination,
} from '@gestschool/ui';
import { Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { ReportExportList, ReportFormat, ReportPage, ReportType } from '@gestschool/contracts';
import { useAuth } from '../auth/auth-provider';
import { useDebounced, usePeopleData } from '../directory/people-hooks';
import { PageHeader } from '../shared/page-header';
import { canReport, downloadReport, reportingRequest } from './reporting-client';
const types: ReportType[] = [
  'STUDENTS',
  'ENROLLMENTS',
  'ACADEMIC',
  'RESULTS',
  'FINANCE',
  'PAYMENTS',
  'OUTSTANDING_BALANCES',
  'DOCUMENTS',
  'COMMUNICATIONS',
];
const formats: Record<ReportType, ReportFormat[]> = {
  STUDENTS: ['CSV', 'XLSX'],
  ENROLLMENTS: ['CSV', 'XLSX'],
  ACADEMIC: ['CSV', 'XLSX'],
  RESULTS: ['XLSX', 'PDF'],
  FINANCE: ['CSV', 'XLSX', 'PDF'],
  PAYMENTS: ['CSV', 'XLSX'],
  OUTSTANDING_BALANCES: ['CSV', 'XLSX', 'PDF'],
  DOCUMENTS: ['CSV', 'XLSX'],
  COMMUNICATIONS: ['CSV', 'XLSX'],
};
export function ReportsPage() {
  const t = useTranslations('Reports'),
    common = useTranslations('Common'),
    locale = useLocale() as 'fr' | 'en' | 'ar',
    { session } = useAuth(),
    allowed = canReport(session?.session, 'reports.read'),
    exportAllowed = canReport(session?.session, 'reports.export');
  const [type, setType] = useState<ReportType>('STUDENTS'),
    [format, setFormat] = useState<ReportFormat>('CSV'),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [exporting, setExporting] = useState(false),
    [error, setError] = useState(false),
    debounced = useDebounced(search);
  const query = useMemo(
    () =>
      `reports/${type.toLowerCase()}?page=${page}&pageSize=20&search=${encodeURIComponent(debounced)}${status ? `&status=${encodeURIComponent(status)}` : ''}`,
    [type, page, debounced, status],
  );
  const report = usePeopleData<ReportPage>(allowed ? query : null, revision),
    history = usePeopleData<ReportExportList>(
      allowed ? `report-exports?page=1&pageSize=20` : null,
      revision,
    );
  useEffect(() => {
    if (!history.data?.items.some((item) => ['PENDING', 'PROCESSING'].includes(item.status)))
      return;
    const timer = setInterval(() => setRevision((value) => value + 1), 2000);
    return () => clearInterval(timer);
  }, [history.data]);
  async function create() {
    setExporting(true);
    setError(false);
    try {
      await reportingRequest(
        'report-exports',
        {
          reportType: type,
          format,
          locale,
          filters: { search: debounced, ...(status ? { status } : {}) },
        },
        'POST',
        crypto.randomUUID(),
      );
      setRevision((value) => value + 1);
    } catch {
      setError(true);
    } finally {
      setExporting(false);
    }
  }
  if (!allowed)
    return (
      <div className="page-shell">
        <PageHeader description={t('description')} title={t('title')} />
        <p role="alert">{t('forbidden')}</p>
      </div>
    );
  return (
    <div className="page-shell" data-reports-ready={!report.loading}>
      <PageHeader description={t('description')} title={t('title')} />
      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_2fr_1fr_auto]">
          <label className="grid gap-1 text-sm">
            {t('reportType')}
            <select
              aria-label={t('reportType')}
              className="h-10 rounded-md border bg-background px-3"
              value={type}
              onChange={(event) => {
                const next = event.target.value as ReportType;
                setType(next);
                setFormat(formats[next][0] ?? 'CSV');
                setPage(1);
              }}
            >
              {types.map((value) => (
                <option key={value} value={value}>
                  {t(`types.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            {t('format')}
            <select
              aria-label={t('format')}
              className="h-10 rounded-md border bg-background px-3"
              value={format}
              onChange={(event) => setFormat(event.target.value as ReportFormat)}
            >
              {formats[type].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            {t('search')}
            <Input
              aria-label={t('search')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            {t('status')}
            <Input
              aria-label={t('status')}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value.toUpperCase());
                setPage(1);
              }}
            />
          </label>
          <Button
            className="self-end"
            disabled={!exportAllowed || exporting}
            onClick={() => void create()}
          >
            {exporting ? <RefreshCw className="animate-spin" /> : <FileSpreadsheet />}
            {exporting ? t('generating') : t('generate')}
          </Button>
        </CardContent>
      </Card>
      {error || report.error ? (
        <p className="mt-4" role="alert">
          {t('error')}
        </p>
      ) : null}
      {report.loading ? (
        <p className="mt-4" role="status">
          {t('loading')}
        </p>
      ) : null}
      {report.data ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>
              {t(`types.${type}`)} · {report.data.total}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">{t('preview')}</caption>
                <thead>
                  <tr>
                    {report.data.columns.map((column) => (
                      <th className="border-b p-2 text-start" key={column}>
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.data.items.map((row, index) => (
                    <tr key={`${page}-${index}`}>
                      {report.data?.columns.map((column) => (
                        <td className="border-b p-2" key={column}>
                          {String(row[column] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.data.total > 20 ? (
              <Pagination
                currentPage={page}
                onPageChange={setPage}
                totalPages={Math.ceil(report.data.total / 20)}
                labels={{ next: common('next'), previous: common('previous') }}
              />
            ) : null}
            {report.data.items.length === 0 ? <p>{t('empty')}</p> : null}
          </CardContent>
        </Card>
      ) : null}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('history')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {history.data?.items.map((item) => (
            <article
              className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"
              key={item.id}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {t(`types.${item.reportType}`)} · {item.format}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(item.createdAt))}{' '}
                  · {item.requestedBy} · {item.rowCount ?? '—'} {t('rows')}
                </p>
              </div>
              <Badge variant="secondary">{t(`states.${item.status}`)}</Badge>
              {item.status === 'READY' ? (
                <Button size="sm" variant="outline" onClick={() => void downloadReport(item.id)}>
                  <Download />
                  {t('download')}
                </Button>
              ) : null}
            </article>
          ))}
          {history.data?.items.length === 0 ? <p>{t('emptyHistory')}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
