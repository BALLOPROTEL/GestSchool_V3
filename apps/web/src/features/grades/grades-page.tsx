'use client';
import {
  Button,
  Card,
  CardContent,
  DataTable,
  Pagination,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type DataTableColumn,
} from '@gestschool/ui';
import {
  resultStatuses,
  type AcademicView,
  type AssessmentView,
  type GradeSheet,
  type PageResult,
  type ResultList,
} from '@gestschool/contracts';
import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '../auth/auth-provider';
import { AcademicPicker } from '../academics/academic-components';
import { usePeopleData } from '../directory/people-hooks';
import { PageHeader } from '../shared/page-header';
import { canResults } from './results-client';
import { ResultError, ResultSelect, ResultStatus } from './results-components';
import { AssessmentEditor } from './assessment-editor';
import { GradeEntrySheet } from './grade-sheet';
import { ClassResultPanel, ReportCards } from './report-cards';
export function GradesPage() {
  const { session } = useAuth();
  return (
    <ResultsWorkspace key={`${session?.session.tenant.id}:${session?.session.membershipId}`} />
  );
}
export function StudentResults({ studentId }: { studentId: string }) {
  const { session } = useAuth();
  return (
    <ResultsWorkspace
      key={`${session?.session.tenant.id}:${session?.session.membershipId}:${studentId}`}
      studentId={studentId}
    />
  );
}
function ResultsWorkspace({ studentId }: { studentId?: string }) {
  const t = useTranslations('Results'),
    common = useTranslations('Common'),
    nav = useTranslations('Nav'),
    { session } = useAuth();
  const allowed = canResults(session?.session, 'grades.read'),
    administrative = canResults(session?.session, 'grades.read', 'tenant'),
    academic = canResults(session?.session, 'grades.read', 'write');
  const [year, setYear] = useState(''),
    [period, setPeriod] = useState(''),
    [classId, setClass] = useState(''),
    [subject, setSubject] = useState(''),
    [status, setStatus] = useState(''),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string>(),
    [creating, setCreating] = useState(false),
    [revision, setRevision] = useState(0),
    [dirty, setDirty] = useState(false);
  const refresh = useCallback(() => {
    setDirty(false);
    setRevision((value) => value + 1);
  }, []);
  const scope = `${studentId ? `&studentId=${studentId}` : ''}${year ? `&academicYearId=${year}` : ''}${period ? `&academicPeriodId=${period}` : ''}${classId ? `&classId=${classId}` : ''}`;
  const list = usePeopleData<ResultList<AssessmentView>>(
    allowed
      ? `assessments?page=${page}&pageSize=20${scope}${subject ? `&classSubjectId=${subject}` : ''}${status ? `&status=${status}` : ''}`
      : null,
    revision,
  );
  const detail = usePeopleData<GradeSheet>(
    allowed && selected ? `assessments/${selected}/grades` : null,
    revision,
  );
  const assignments = usePeopleData<PageResult<AcademicView>>(
    academic && classId && period
      ? `teaching-assignments?classId=${classId}&academicPeriodId=${period}&pageSize=100&status=ACTIVE`
      : null,
  );
  const subjectOptions = [
    ...new Map((assignments.data?.items ?? []).map((row) => [row.classSubjectId, row])).values(),
  ];
  function reset() {
    setSelected(undefined);
    setPage(1);
  }
  const columns: DataTableColumn<AssessmentView>[] = [
    {
      id: 'title',
      header: t('assessmentTitle'),
      cell: (row) => (
        <div className="font-semibold">
          {row.title}
          <span className="block text-xs font-normal text-muted-foreground">
            {row.subjectName} · {row.className}
          </span>
        </div>
      ),
    },
    {
      id: 'period',
      header: t('period'),
      cell: (row) => (
        <div>
          {row.periodName}
          <span className="block text-xs">{row.assessedOn}</span>
        </div>
      ),
    },
    {
      id: 'scale',
      header: t('maxScore'),
      cell: (row) => <bdi className="font-mono">{row.maxScore}</bdi>,
    },
    { id: 'status', header: t('status'), cell: (row) => <ResultStatus status={row.status} /> },
    {
      id: 'open',
      header: t('actions'),
      cell: (row) => (
        <Button
          data-assessment-open={row.id}
          size="sm"
          variant="outline"
          disabled={dirty}
          onClick={() => setSelected(row.id)}
        >
          {t('open')}
        </Button>
      ),
    },
  ];
  return (
    <div className="page-shell space-y-5" data-results-ready={!list.loading}>
      <PageHeader
        headingLevel={studentId ? 2 : 1}
        eyebrow={nav('academic')}
        title={t('title')}
        description={t('description')}
        actions={
          canResults(session?.session, 'assessments.create', 'write') && !studentId ? (
            <Button
              size="sm"
              onClick={() => setCreating(true)}
              disabled={!year || !period || !classId || dirty}
            >
              <Plus />
              {t('createAssessment')}
            </Button>
          ) : undefined
        }
      />
      {!allowed ? (
        <p role="status" className="rounded-lg border p-4">
          {t('forbidden')}
        </p>
      ) : (
        <>
          {academic ? (
            <fieldset disabled={dirty} className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <AcademicPicker
                path="academic-years"
                value={year}
                label={t('year')}
                disabled={dirty}
                onChange={(value) => {
                  setYear(value);
                  setClass('');
                  setPeriod('');
                  setSubject('');
                  reset();
                }}
              />
              <AcademicPicker
                path={year ? `academic-years/${year}/periods` : null}
                value={period}
                label={t('period')}
                disabled={dirty}
                onChange={(value) => {
                  setPeriod(value);
                  setSubject('');
                  reset();
                }}
              />
              <AcademicPicker
                path={year ? `classes?academicYearId=${year}` : null}
                value={classId}
                label={t('class')}
                disabled={dirty}
                onChange={(value) => {
                  setClass(value);
                  setSubject('');
                  reset();
                }}
              />
              <ResultSelect
                label={t('subject')}
                value={subject}
                disabled={dirty || !period || !classId}
                onChange={(e) => {
                  setSubject(e.target.value);
                  reset();
                }}
                items={[
                  { value: '', label: t('all') },
                  ...subjectOptions.map((row) => ({
                    value: row.classSubjectId ?? '',
                    label: row.subjectName ?? row.name,
                  })),
                ]}
              />
              {assignments.error ? <ResultError error={assignments.error} /> : null}
              {(assignments.data?.total ?? 0) > 100 ? (
                <p className="text-sm">{t('refineSearch')}</p>
              ) : null}
            </fieldset>
          ) : (
            <p className="text-sm text-muted-foreground">{t('publishedOnly')}</p>
          )}
          {dirty ? (
            <p role="status" className="rounded-lg bg-muted p-3 text-sm">
              {t('unsavedHint')}
            </p>
          ) : null}
          <Tabs defaultValue="assessments">
            <div className="max-w-full overflow-x-auto">
              <TabsList>
                <TabsTrigger value="assessments" disabled={dirty}>
                  {t('assessments')}
                </TabsTrigger>
                {administrative && !studentId ? (
                  <TabsTrigger value="results" disabled={dirty}>
                    {t('classResults')}
                  </TabsTrigger>
                ) : null}
                {canResults(session?.session, 'report-cards.read') ? (
                  <TabsTrigger value="reports" disabled={dirty}>
                    {t('reports')}
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </div>
            <TabsContent value="assessments" className="space-y-4">
              {academic ? (
                <div className="max-w-xs">
                  <ResultSelect
                    label={t('status')}
                    value={status}
                    disabled={dirty}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      reset();
                    }}
                    items={[
                      { value: '', label: t('all') },
                      ...resultStatuses.map((value) => ({ value, label: t(value) })),
                    ]}
                  />
                </div>
              ) : null}
              <Card className="min-w-0 overflow-hidden">
                <CardContent className="space-y-3">
                  {list.loading ? <p role="status">{t('loading')}</p> : null}
                  {list.error ? <ResultError error={list.error} /> : null}
                  {list.data?.items.length === 0 ? <p>{t('emptyAssessments')}</p> : null}
                  {list.data?.items.length ? (
                    <DataTable
                      caption={t('assessments')}
                      columns={columns}
                      rows={list.data.items}
                      getRowId={(row) => row.id}
                      minWidth={690}
                    />
                  ) : null}
                  {list.data && list.data.total > 20 ? (
                    <Pagination
                      currentPage={page}
                      totalPages={Math.ceil(list.data.total / 20)}
                      labels={{ previous: common('previous'), next: common('next') }}
                      onPageChange={(value) => {
                        if (!dirty) setPage(value);
                      }}
                    />
                  ) : null}
                </CardContent>
              </Card>
              {detail.loading ? <p role="status">{t('loading')}</p> : null}
              {detail.error ? <ResultError error={detail.error} /> : null}
              {detail.data ? (
                <GradeEntrySheet
                  key={`${detail.data.assessment.id}:${revision}`}
                  sheet={detail.data}
                  refresh={refresh}
                  dirtyChanged={setDirty}
                />
              ) : null}
            </TabsContent>
            {administrative && !studentId ? (
              <TabsContent value="results">
                <ClassResultPanel
                  classId={classId}
                  period={period}
                  revision={revision}
                  refresh={refresh}
                />
              </TabsContent>
            ) : null}
            {canResults(session?.session, 'report-cards.read') ? (
              <TabsContent value="reports">
                <ReportCards key={scope} scope={scope} revision={revision} refresh={refresh} />
              </TabsContent>
            ) : null}
          </Tabs>
        </>
      )}
      {creating ? (
        <AssessmentEditor
          year={year}
          period={period}
          classId={classId}
          close={() => setCreating(false)}
          saved={(row) => {
            setCreating(false);
            setSelected(row.id);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
