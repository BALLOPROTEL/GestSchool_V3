'use client';
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  KpiCard,
  Pagination,
  Select,
  SelectItem,
  type DataTableColumn,
} from '@gestschool/ui';
import {
  enrollmentStatuses,
  enrollmentTypes,
  type EnrollmentList,
  type EnrollmentView,
} from '@gestschool/contracts';
import { CheckCircle2, CircleX, Clock3, FileText, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '../auth/auth-provider';
import { useDebounced, usePeopleData } from '../directory/people-hooks';
import { PageHeader } from '../shared/page-header';
import { SearchField } from '../shared/search-field';
import { getInitials } from '../shared/format';
import { Link } from '../../i18n/navigation';
import { AcademicPicker } from '../academics/academic-components';
import { canEnrollment, canEnrollmentAction } from './enrollment-client';
import { EnrollmentError, EnrollmentStatusBadge } from './enrollment-components';
import { EnrollmentWizard } from './enrollment-wizard';
import { EnrollmentHistory } from './enrollment-history';
import { EnrollmentActionDialog, type EnrollmentAction } from './enrollment-actions';

export function EnrollmentsPage() {
  const { session } = useAuth();
  return (
    <EnrollmentWorkspace key={`${session?.session.tenant.id}:${session?.session.membershipId}`} />
  );
}
export function StudentEnrollmentHistory({ studentId }: { studentId: string }) {
  const { session } = useAuth();
  return (
    <EnrollmentWorkspace
      key={`${session?.session.tenant.id}:${session?.session.membershipId}:${studentId}`}
      studentId={studentId}
    />
  );
}
function EnrollmentWorkspace({ studentId }: { studentId?: string }) {
  const t = useTranslations('EnrollmentFlow');
  const common = useTranslations('Common');
  const original = useTranslations('Enrollments');
  const nav = useTranslations('Nav');
  const { session } = useAuth();
  const allowed = canEnrollment(session?.session);
  const administrative = canEnrollment(session?.session, 'create');
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [sort, setSort] = useState('-enrolledOn');
  const [yearId, setYearId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [classId, setClassId] = useState('');
  const [revision, setRevision] = useState(0);
  const [wizard, setWizard] = useState<EnrollmentView | null | undefined>();
  const [history, setHistory] = useState<EnrollmentView>();
  const [action, setAction] = useState<{ row: EnrollmentView; kind: EnrollmentAction }>();
  const path = `${studentId ? `students/${studentId}/enrollments` : 'enrollments'}?page=${page}&pageSize=25&search=${encodeURIComponent(search)}&status=${status}&type=${type}&sort=${sort}${yearId ? `&academicYearId=${yearId}` : ''}${levelId ? `&levelId=${levelId}` : ''}${classId ? `&classId=${classId}` : ''}`;
  const result = usePeopleData<EnrollmentList>(allowed ? path : null, revision);
  function saved() {
    setWizard(undefined);
    setAction(undefined);
    setRevision((value) => value + 1);
  }
  const columns: DataTableColumn<EnrollmentView>[] = [
    {
      id: 'student',
      header: t('student'),
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Avatar className="size-7">
            <AvatarFallback className="text-[10px]">{getInitials(row.studentName)}</AvatarFallback>
          </Avatar>
          <Link
            href={`/students/${row.studentId}`}
            className="whitespace-nowrap font-semibold hover:text-primary focus-visible:underline"
          >
            {row.studentName}
          </Link>
        </div>
      ),
    },
    {
      id: 'matricule',
      header: t('matricule'),
      cell: (row) => <span className="font-mono text-xs">{row.matricule}</span>,
    },
    { id: 'year', header: t('year'), cell: (row) => row.academicYearName },
    {
      id: 'class',
      header: t('class'),
      cell: (row) => (
        <span>
          {row.className}
          <span className="block text-xs text-muted-foreground">{row.levelName}</span>
        </span>
      ),
    },
    { id: 'type', header: t('type'), cell: (row) => t(row.type ?? 'LEGACY') },
    {
      id: 'date',
      header: t('enrolledOn'),
      cell: (row) => <span className="whitespace-nowrap">{row.enrolledOn}</span>,
    },
    {
      id: 'status',
      header: t('status'),
      cell: (row) => <EnrollmentStatusBadge status={row.status} />,
    },
    {
      id: 'actions',
      header: common('actions'),
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" size="sm" onClick={() => setHistory(row)}>
            {t('history')}
          </Button>
          {!studentId &&
          canEnrollment(session?.session, 'update') &&
          canEnrollmentAction(row, 'update') ? (
            <Button variant="ghost" size="sm" onClick={() => setWizard(row)}>
              {t('edit')}
            </Button>
          ) : null}
          {!studentId
            ? (['confirm', 'transfer', 'cancel', 'complete'] as const)
                .filter(
                  (kind) => canEnrollment(session?.session, kind) && canEnrollmentAction(row, kind),
                )
                .map((kind) => (
                  <Button
                    key={kind}
                    variant="ghost"
                    size="sm"
                    onClick={() => setAction({ row, kind })}
                  >
                    {t(kind)}
                  </Button>
                ))
            : null}
        </div>
      ),
    },
  ];
  return (
    <section
      className={studentId ? 'min-w-0 space-y-4' : 'page-shell'}
      data-enrollment-ready={!result.loading}
    >
      {!studentId ? (
        <PageHeader
          title={original('title')}
          description={t('description')}
          eyebrow={nav('schoolLife')}
          actions={
            administrative ? (
              <Button
                size="sm"
                data-enrollment-create
                data-academic-focus
                onClick={() => setWizard(null)}
              >
                <Plus />
                {t('new')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <h3 className="px-4 pt-4 font-semibold">{t('history')}</h3>
      )}
      {!allowed ? (
        <p role="status" className="p-4 text-sm text-muted-foreground">
          {t('forbidden')}
        </p>
      ) : (
        <>
          {!studentId ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                icon={FileText}
                label={original('total')}
                value={String(result.data?.summary.total ?? '—')}
              />
              <KpiCard
                icon={CheckCircle2}
                label={original('active')}
                value={String(result.data?.summary.active ?? '—')}
              />
              <KpiCard
                icon={Clock3}
                label={original('pending')}
                value={String(result.data?.summary.pending ?? '—')}
              />
              <KpiCard
                icon={CircleX}
                label={original('withdrawn')}
                value={String(result.data?.summary.withdrawn ?? '—')}
              />
            </div>
          ) : null}
          <Card className="mt-5">
            <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
              <SearchField
                label={common('search')}
                placeholder={t('search')}
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setPage(1);
                }}
              />
              <Select
                aria-label={t('status')}
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <SelectItem value="ALL">{common('all')}</SelectItem>
                {enrollmentStatuses.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(value)}
                  </SelectItem>
                ))}
              </Select>
              <Select
                aria-label={t('type')}
                value={type}
                onChange={(event) => {
                  setType(event.target.value);
                  setPage(1);
                }}
              >
                <SelectItem value="ALL">{common('all')}</SelectItem>
                {[...enrollmentTypes, 'LEGACY'].map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(value)}
                  </SelectItem>
                ))}
              </Select>
              <Select
                aria-label={t('sort')}
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setPage(1);
                }}
              >
                <SelectItem value="-enrolledOn">{t('dateDesc')}</SelectItem>
                <SelectItem value="enrolledOn">{t('dateAsc')}</SelectItem>
                <SelectItem value="name">{t('nameAsc')}</SelectItem>
                <SelectItem value="-name">{t('nameDesc')}</SelectItem>
              </Select>
              {administrative ? (
                <>
                  <AcademicPicker
                    path="academic-years?status=ALL"
                    value={yearId}
                    onChange={(value) => {
                      setYearId(value);
                      setClassId('');
                      setPage(1);
                    }}
                    label={t('year')}
                  />
                  <AcademicPicker
                    path="levels?status=ALL"
                    value={levelId}
                    onChange={(value) => {
                      setLevelId(value);
                      setClassId('');
                      setPage(1);
                    }}
                    label={t('level')}
                  />
                  <AcademicPicker
                    path={`classes?status=ALL${yearId ? `&academicYearId=${yearId}` : ''}${levelId ? `&levelId=${levelId}` : ''}`}
                    value={classId}
                    onChange={(value) => {
                      setClassId(value);
                      setPage(1);
                    }}
                    label={t('class')}
                  />
                </>
              ) : null}
            </CardContent>
          </Card>
          {result.error ? (
            <div className="mt-4">
              <EnrollmentError error={result.error} />
              <Button
                variant="outline"
                className="mt-2"
                onClick={() => setRevision((value) => value + 1)}
              >
                {t('retry')}
              </Button>
            </div>
          ) : null}
          {result.loading ? (
            <p role="status" className="p-4 text-sm">
              {t('loading')}
            </p>
          ) : null}
          <Card className="mt-5 overflow-hidden">
            <CardHeader>
              <CardTitle>{studentId ? t('history') : original('caption')}</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <DataTable
                caption={studentId ? t('history') : original('caption')}
                columns={columns}
                rows={result.data?.items ?? []}
                getRowId={(row) => row.id}
                minWidth={1080}
                emptyState={
                  <p className="p-8 text-center text-muted-foreground">
                    {result.loading ? t('loading') : t('empty')}
                  </p>
                }
              />
            </CardContent>
          </Card>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 p-1">
            <p className="text-xs text-muted-foreground">
              {t('results', { count: result.data?.total ?? 0 })}
            </p>
            <Pagination
              currentPage={page}
              totalPages={Math.max(1, Math.ceil((result.data?.total ?? 0) / 25))}
              onPageChange={setPage}
              labels={{ next: common('next'), previous: common('previous') }}
            />
          </div>
        </>
      )}
      {wizard !== undefined ? (
        <EnrollmentWizard
          {...(wizard ? { current: wizard } : {})}
          close={() => setWizard(undefined)}
          saved={saved}
        />
      ) : null}
      {history ? <EnrollmentHistory row={history} close={() => setHistory(undefined)} /> : null}
      {action ? (
        <EnrollmentActionDialog
          row={action.row}
          action={action.kind}
          close={() => setAction(undefined)}
          saved={saved}
        />
      ) : null}
    </section>
  );
}
