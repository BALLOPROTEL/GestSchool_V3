'use client';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  Pagination,
  type DataTableColumn,
} from '@gestschool/ui';
import type {
  ClassResults,
  ReportCardView,
  ResultList,
  StudentResult,
  SubjectResult,
} from '@gestschool/contracts';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '../auth/auth-provider';
import { AcademicDialog } from '../academics/academic-components';
import { usePeopleData } from '../directory/people-hooks';
import { canResults, resultsRequest } from './results-client';
import { ResultError, ResultField, ResultStatus } from './results-components';

export function ClassResultPanel({
  classId,
  period,
  revision,
  refresh,
}: {
  classId: string;
  period: string;
  revision: number;
  refresh: () => void;
}) {
  const t = useTranslations('Results'),
    { session } = useAuth();
  const results = usePeopleData<ClassResults>(
    classId && period ? `results/class?classId=${classId}&academicPeriodId=${period}` : null,
    revision,
  );
  const [action, setAction] = useState<'generate' | 'publish'>();
  const columns: DataTableColumn<StudentResult>[] = [
    {
      id: 'student',
      header: t('student'),
      cell: (row) => (
        <div>
          {row.firstName} {row.lastName}
          <span className="block font-mono text-xs">{row.matricule}</span>
        </div>
      ),
    },
    {
      id: 'average',
      header: t('average'),
      cell: (row) => (
        <bdi className="font-mono">
          {row.overallAverage ?? '—'} / {results.data?.scale}
        </bdi>
      ),
    },
    { id: 'rank', header: t('rank'), cell: (row) => <bdi>{row.rank ?? '—'}</bdi> },
    {
      id: 'complete',
      header: t('status'),
      cell: (row) => t(row.complete ? 'complete' : 'incomplete'),
    },
  ];
  return (
    <Card className="min-w-0 overflow-hidden" data-class-results>
      <CardHeader>
        <CardTitle>{t('classResults')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!classId || !period ? <p>{t('selectContext')}</p> : null}
        {results.loading ? <p role="status">{t('loading')}</p> : null}
        {results.error ? <ResultError error={results.error} /> : null}
        {results.data ? (
          <>
            <p>
              {results.data.schoolClass.name} · {results.data.academicPeriod.name} ·{' '}
              {t('population')}: <bdi>{results.data.population}</bdi>
            </p>
            {results.data.warnings.length > 0 ||
            results.data.students.some((row) => !row.complete) ? (
              <p role="status" className="rounded-lg bg-muted p-3">
                {t('incomplete')}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {(['generate', 'publish'] as const)
                .filter((verb) => canResults(session?.session, `report-cards.${verb}`, 'tenant'))
                .map((verb) => (
                  <Button
                    key={verb}
                    variant="outline"
                    onClick={() => setAction(verb)}
                    disabled={results.data?.population === 0}
                  >
                    {t(verb === 'generate' ? 'generateReports' : 'publishReports')}
                  </Button>
                ))}
            </div>
            <DataTable
              caption={t('classResults')}
              columns={columns}
              rows={results.data.students}
              getRowId={(row) => row.studentId}
              minWidth={580}
            />
          </>
        ) : null}
        {action ? (
          <ReportAction
            title={t(action === 'generate' ? 'generateReports' : 'publishReports')}
            hint={t('reportPublicationHint')}
            path={`report-cards/${action}`}
            body={{ classId, academicPeriodId: period }}
            close={() => setAction(undefined)}
            saved={refresh}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
export function ReportCards({
  scope,
  revision,
  refresh,
}: {
  scope: string;
  revision: number;
  refresh: () => void;
}) {
  const t = useTranslations('Results'),
    common = useTranslations('Common');
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<string>();
  const reports = usePeopleData<ResultList<ReportCardView>>(
    `report-cards?page=${page}&pageSize=20${scope}`,
    revision,
  );
  const detail = usePeopleData<ReportCardView>(
    selected ? `report-cards/${selected}` : null,
    revision,
  );
  const columns: DataTableColumn<ReportCardView>[] = [
    {
      id: 'student',
      header: t('student'),
      cell: (row) =>
        row.snapshot
          ? `${row.snapshot.student.firstName} ${row.snapshot.student.lastName}`
          : t('historicalReport'),
    },
    {
      id: 'context',
      header: t('period'),
      cell: (row) =>
        row.snapshot
          ? `${row.snapshot.schoolClass.name} · ${row.snapshot.academicYear.name} · ${row.snapshot.academicPeriod.name}`
          : '—',
    },
    {
      id: 'average',
      header: t('average'),
      cell: (row) => <bdi className="font-mono">{row.snapshot?.student.overallAverage ?? '—'}</bdi>,
    },
    {
      id: 'rank',
      header: t('rank'),
      cell: (row) => <bdi>{row.snapshot?.student.rank ?? '—'}</bdi>,
    },
    { id: 'status', header: t('status'), cell: (row) => <ResultStatus status={row.status} /> },
    {
      id: 'open',
      header: t('actions'),
      cell: (row) => (
        <Button size="sm" variant="outline" onClick={() => setSelected(row.id)}>
          {t('viewReport')}
        </Button>
      ),
    },
  ];
  return (
    <div className="space-y-4" data-reports-ready={!reports.loading}>
      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>{t('reports')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {reports.loading ? <p role="status">{t('loading')}</p> : null}
          {reports.error ? <ResultError error={reports.error} /> : null}
          {reports.data?.items.length === 0 ? <p>{t('emptyReports')}</p> : null}
          {reports.data?.items.length ? (
            <DataTable
              caption={t('reports')}
              columns={columns}
              rows={reports.data.items}
              getRowId={(row) => row.id}
              minWidth={740}
            />
          ) : null}
          {reports.data && reports.data.total > 20 ? (
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(reports.data.total / 20)}
              labels={{ previous: common('previous'), next: common('next') }}
              onPageChange={setPage}
            />
          ) : null}
        </CardContent>
      </Card>
      {detail.loading ? <p role="status">{t('loading')}</p> : null}
      {detail.error ? <ResultError error={detail.error} /> : null}
      {detail.data ? (
        <ReportPreview
          key={`${detail.data.id}:${revision}`}
          report={detail.data}
          refresh={refresh}
          close={() => setSelected(undefined)}
        />
      ) : null}
    </div>
  );
}
function ReportPreview({
  report,
  refresh,
  close,
}: {
  report: ReportCardView;
  refresh: () => void;
  close: () => void;
}) {
  const t = useTranslations('Results'),
    { session } = useAuth(),
    snapshot = report.snapshot;
  const [locking, setLocking] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const editable =
    report.status === 'DRAFT' && canResults(session?.session, 'report-cards.generate', 'tenant');
  const columns: DataTableColumn<SubjectResult>[] = [
    { id: 'subject', header: t('subject'), cell: (row) => row.name },
    { id: 'coefficient', header: t('coefficient'), cell: (row) => <bdi>{row.coefficient}</bdi> },
    { id: 'average', header: t('average'), cell: (row) => <bdi>{row.average ?? '—'}</bdi> },
    { id: 'outcome', header: t('outcome'), cell: (row) => t(row.outcome) },
    {
      id: 'remark',
      header: t('remark'),
      cell: (row) =>
        editable ? (
          <ResultField
            label={t('remarkFor', { name: row.name })}
            name={row.subjectId}
            defaultValue={row.remark ?? ''}
            maxLength={500}
          />
        ) : (
          (row.remark ?? '—')
        ),
    },
  ];
  return (
    <Card data-report-preview={report.id} className="min-w-0 overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t('reportPreview')}</CardTitle>
          <Button variant="ghost" onClick={close}>
            {t('close')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResultStatus status={report.status} />
        {!snapshot ? (
          <p>{t('historicalReport')}</p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              setBusy(true);
              setError(undefined);
              void resultsRequest(
                `report-cards/${report.id}`,
                {
                  generalRemark: String(form.get('generalRemark') ?? '') || null,
                  remarks: snapshot.student.subjects.map((row) => ({
                    subjectId: row.subjectId,
                    remark: String(form.get(row.subjectId) ?? '') || null,
                  })),
                },
                'PATCH',
              )
                .then(refresh)
                .catch(setError)
                .finally(() => setBusy(false));
            }}
          >
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">
                {snapshot.student.firstName} {snapshot.student.lastName}
              </h3>
              <p className="font-mono text-sm">{snapshot.student.matricule}</p>
              <p>
                {snapshot.academicYear.name} · {snapshot.academicPeriod.name} ·{' '}
                {snapshot.schoolClass.name}
              </p>
            </div>
            <fieldset disabled={busy} className="min-w-0 space-y-4">
              <DataTable
                caption={t('reportPreview')}
                columns={columns}
                rows={snapshot.student.subjects}
                getRowId={(row) => row.subjectId}
                minWidth={640}
              />
              <dl className="flex flex-wrap gap-6">
                {[
                  ['average', `${snapshot.student.overallAverage ?? '—'} / ${snapshot.scale}`],
                  ['rank', snapshot.student.rank ?? '—'],
                  ['population', snapshot.population],
                ].map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-sm text-muted-foreground">{t(String(key))}</dt>
                    <dd className="text-xl font-semibold">
                      <bdi>{value}</bdi>
                    </dd>
                  </div>
                ))}
              </dl>
              {editable ? (
                <ResultField
                  label={t('generalRemark')}
                  name="generalRemark"
                  defaultValue={snapshot.generalRemark ?? ''}
                  maxLength={1000}
                />
              ) : (
                <p>{snapshot.generalRemark ?? t('noRemark')}</p>
              )}
              {editable ? (
                <Button type="submit" disabled={busy}>
                  {t('saveRemarks')}
                </Button>
              ) : null}
            </fieldset>
            {report.publishedAt ? (
              <p className="text-sm text-muted-foreground">
                {t('publishedAt')}: <time dateTime={report.publishedAt}>{report.publishedAt}</time>
              </p>
            ) : null}
            {error ? <ResultError error={error} /> : null}
          </form>
        )}
        {report.status === 'PUBLISHED' &&
        canResults(session?.session, 'report-cards.lock', 'tenant') ? (
          <Button variant="outline" onClick={() => setLocking(true)}>
            {t('lockReport')}
          </Button>
        ) : null}
        {locking ? (
          <ReportAction
            title={t('lockReport')}
            hint={t('immutable')}
            path={`report-cards/${report.id}/lock`}
            body={{}}
            close={() => setLocking(false)}
            saved={refresh}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
function ReportAction({
  title,
  hint,
  path,
  body,
  close,
  saved,
}: {
  title: string;
  hint: string;
  path: string;
  body: unknown;
  close: () => void;
  saved: () => void;
}) {
  const t = useTranslations('Results');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <AcademicDialog title={title} description={hint} close={close} busy={busy}>
      <div className="space-y-4">
        {error ? <ResultError error={error} /> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(undefined);
              void resultsRequest(path, body, 'POST')
                .then(() => {
                  close();
                  saved();
                })
                .catch(setError)
                .finally(() => setBusy(false));
            }}
          >
            {t('confirm')}
          </Button>
        </div>
      </div>
    </AcademicDialog>
  );
}
