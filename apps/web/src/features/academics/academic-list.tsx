'use client';
import {
  Button,
  Card,
  CardContent,
  DataTable,
  EmptyState,
  Pagination,
  Select,
  SelectItem,
  type DataTableColumn,
} from '@gestschool/ui';
import type { AcademicEntity, AcademicView, PageResult } from '@gestschool/contracts';
import { Plus, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { usePeopleData as useAcademicData, useDebounced } from '../directory/people-hooks';
import { SearchField } from '../shared/search-field';
import { academicLabels, academicRequest, academicWritable, canAcademic } from './academic-client';
import {
  AcademicDialog,
  AcademicErrorNotice,
  AcademicPicker,
  AcademicStatus,
} from './academic-components';
import { AcademicEditor, academicPath, academicRowPath } from './academic-editor';

export function AcademicList({
  kind,
  parent,
  select,
}: {
  kind: AcademicEntity;
  parent?: AcademicView | undefined;
  select?: ((row: AcademicView) => void) | undefined;
}) {
  const t = useTranslations('Academics');
  const common = useTranslations('Common');
  const { session } = useAuth();
  const allowed = canAcademic(session?.session, kind);
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(kind === 'academic-years' ? 'ALL' : 'ACTIVE');
  const [sort, setSort] = useState('name');
  const [yearId, setYearId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<AcademicView | null | undefined>();
  const [pending, setPending] = useState<{
    row: AcademicView;
    action: 'activate' | 'close' | 'archive' | 'restore' | 'remove';
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const adminAssignments = canAcademic(session?.session, kind, 'create');
  const base =
    kind === 'teaching-assignments' && !adminAssignments
      ? 'me/teaching-assignments'
      : academicPath(kind, parent);
  const params = new URLSearchParams({ page: String(page), pageSize: '25', search, status, sort });
  if (yearId) params.set('academicYearId', yearId);
  if (levelId) params.set('levelId', levelId);
  if (kind === 'teaching-assignments' && parent) params.set('classId', parent.id);
  const result = useAcademicData<PageResult<AcademicView>>(
    allowed ? `${base}?${params}` : null,
    revision,
  );
  const openParent = !parent || academicWritable(parent);
  const createAction = kind === 'class-subjects' ? 'update' : 'create';
  const creatable =
    openParent &&
    canAcademic(session?.session, kind, createAction) &&
    (kind !== 'teaching-assignments' || Boolean(parent));
  function actions(row: AcademicView) {
    const writable = openParent && academicWritable(row);
    const candidates: NonNullable<typeof pending>['action'][] =
      kind === 'academic-years'
        ? row.status === 'DRAFT'
          ? ['activate']
          : row.status === 'ACTIVE'
            ? ['close']
            : row.status === 'CLOSED'
              ? ['archive']
              : []
        : kind === 'class-subjects'
          ? writable
            ? ['remove']
            : []
          : ['levels', 'classes', 'subjects'].includes(kind)
            ? openParent &&
              row.academicYearStatus !== 'CLOSED' &&
              row.academicYearStatus !== 'ARCHIVED'
              ? [row.status === 'ARCHIVED' ? 'restore' : 'archive']
              : []
            : writable
              ? ['archive']
              : [];
    return (
      <div className="flex flex-wrap gap-1">
        {select ? (
          <Button
            size="sm"
            className={kind === 'classes' ? 'w-full' : undefined}
            variant={kind === 'classes' ? 'outline' : 'ghost'}
            onClick={() => select(row)}
          >
            {t(kind === 'academic-years' ? 'periods' : 'details')}
          </Button>
        ) : null}
        {writable &&
        canAcademic(session?.session, kind, 'update') &&
        (kind !== 'teaching-assignments' || parent) ? (
          <Button size="sm" variant="ghost" onClick={() => setEditor(row)}>
            {common('edit')}
          </Button>
        ) : null}
        {candidates
          .filter((action) =>
            canAcademic(
              session?.session,
              kind,
              action === 'remove' ? 'update' : action === 'restore' ? 'archive' : action,
            ),
          )
          .map((action) => (
            <Button
              key={action}
              size="sm"
              variant="ghost"
              onClick={() => {
                setError(undefined);
                setPending({ row, action });
              }}
            >
              {t(action)}
            </Button>
          ))}
      </div>
    );
  }
  const columns: DataTableColumn<AcademicView>[] = [
    {
      id: 'name',
      header: t(kind === 'teaching-assignments' ? 'teacher' : 'name'),
      cell: (row) => (
        <span className="font-semibold">
          {kind === 'teaching-assignments' ? row.teacherName : row.name}
        </span>
      ),
    },
    ...(kind === 'academic-periods'
      ? [
          {
            id: 'type',
            header: t('type'),
            cell: (row: AcademicView) => (row.type ? t(row.type) : '—'),
          },
          { id: 'ordinal', header: t('ordinal'), cell: (row: AcademicView) => row.ordinal },
        ]
      : kind === 'class-subjects'
        ? [
            {
              id: 'coefficient',
              header: t('coefficient'),
              cell: (row: AcademicView) => row.coefficient,
            },
          ]
        : kind === 'teaching-assignments'
          ? [
              {
                id: 'class',
                header: t('class'),
                cell: (row: AcademicView) => (
                  <span>
                    {row.className}
                    <span className="block text-xs text-muted-foreground">
                      {row.academicYearName}
                    </span>
                  </span>
                ),
              },
              { id: 'subject', header: t('subject'), cell: (row: AcademicView) => row.subjectName },
              {
                id: 'period',
                header: t('period'),
                cell: (row: AcademicView) => row.academicPeriodName,
              },
            ]
          : [
              {
                id: 'code',
                header: t('code'),
                cell: (row: AcademicView) => <span className="font-mono text-xs">{row.code}</span>,
              },
            ]),
    ...(['academic-years', 'academic-periods'].includes(kind)
      ? [
          {
            id: 'dates',
            header: t('dates'),
            cell: (row: AcademicView) => (
              <span className="whitespace-nowrap text-xs">
                <time>{row.startsOn}</time> → <time>{row.endsOn}</time>
              </span>
            ),
          },
        ]
      : []),
    ...(kind === 'levels'
      ? [{ id: 'position', header: t('position'), cell: (row: AcademicView) => row.position }]
      : []),
    { id: 'status', header: common('status'), cell: (row) => <AcademicStatus row={row} /> },
    { id: 'actions', header: common('actions'), cell: actions },
  ];
  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError(undefined);
    try {
      const path = academicRowPath(kind, pending.row, parent);
      await academicRequest(
        pending.action === 'remove' ? path : `${path}/${pending.action}`,
        {},
        pending.action === 'remove' ? 'DELETE' : 'POST',
      );
      setPending(null);
      setRevision((value) => value + 1);
    } catch (issue: unknown) {
      setError(issue);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="min-w-0 space-y-4"
      aria-label={t(academicLabels[kind])}
      data-academic-ready={!result.loading}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t(academicLabels[kind])}</h2>
        {creatable ? (
          <Button data-academic-create size="sm" onClick={() => setEditor(null)}>
            <Plus />
            {t('createEntity', { entity: t(academicLabels[kind]) })}
          </Button>
        ) : null}
      </div>
      {!allowed ? (
        <p role="status" className="rounded-xl border border-border p-5">
          {t('forbidden')}
        </p>
      ) : (
        <>
          {!openParent ? <p className="text-sm text-muted-foreground">{t('yearClosed')}</p> : null}
          {kind === 'teaching-assignments' && !parent && adminAssignments ? (
            <p className="text-sm text-muted-foreground">{t('assignmentHint')}</p>
          ) : null}
          <Card>
            <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(180px,1fr)_160px_160px]">
              <SearchField
                label={common('search')}
                placeholder={t('searchFor', { entity: t(academicLabels[kind]) })}
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setPage(1);
                }}
              />
              <Select
                aria-label={common('status')}
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                {(kind === 'academic-years'
                  ? ['ALL', 'DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED']
                  : ['ACTIVE', 'ARCHIVED', 'ALL']
                ).map((value) => (
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
                {['name', '-name', 'code', '-createdAt'].map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(
                      value === 'name'
                        ? 'sortName'
                        : value === '-name'
                          ? 'sortNameDesc'
                          : value === 'code'
                            ? 'sortCode'
                            : 'sortRecent',
                    )}
                  </SelectItem>
                ))}
              </Select>
              {kind === 'classes' || (kind === 'teaching-assignments' && !parent) ? (
                <div className="grid min-w-0 gap-3 sm:grid-cols-2 md:col-span-3">
                  <AcademicPicker
                    path="academic-years?status=ALL"
                    label={t('year')}
                    value={yearId}
                    onChange={(value) => {
                      setYearId(value);
                      setPage(1);
                    }}
                  />
                  <AcademicPicker
                    path="levels?status=ALL"
                    label={t('level')}
                    value={levelId}
                    onChange={(value) => {
                      setLevelId(value);
                      setPage(1);
                    }}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
          {result.loading ? (
            <p role="status" className="p-5">
              {t('loading')}
            </p>
          ) : result.error ? (
            <div className="space-y-3">
              <AcademicErrorNotice error={result.error} />
              <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>
                {t('retry')}
              </Button>
            </div>
          ) : kind === 'classes' ? (
            <>
              {result.data?.items.length ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {result.data.items.map((row) => (
                    <Card
                      key={row.id}
                      className="min-w-0 [overflow-wrap:anywhere] transition-shadow hover:shadow-sm"
                    >
                      <CardContent className="space-y-4 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className="break-words font-bold">{row.name}</h3>
                          <AcademicStatus row={row} />
                        </div>
                        <p className="font-mono text-xs text-muted-foreground">{row.code}</p>
                        <dl className="space-y-2 text-sm">
                          <div>
                            <dt className="text-xs text-muted-foreground">{t('year')}</dt>
                            <dd className="break-words">{row.academicYearName}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">{t('level')}</dt>
                            <dd>{row.levelName}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">{t('capacity')}</dt>
                            <dd>{row.capacity ?? '—'}</dd>
                          </div>
                        </dl>
                        {actions(row)}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <EmptyState icon={SearchX} title={common('noResults')} description={t('empty')} />
              )}
            </>
          ) : (
            <Card>
              <DataTable
                caption={t(academicLabels[kind])}
                columns={columns}
                rows={result.data?.items ?? []}
                getRowId={(row) => row.id}
                minWidth={kind === 'teaching-assignments' ? 900 : 760}
                emptyState={
                  <EmptyState icon={SearchX} title={common('noResults')} description={t('empty')} />
                }
              />
            </Card>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span role="status" className="text-xs text-muted-foreground">
              {common('results', { count: result.data?.total ?? 0 })}
            </span>
            <Pagination
              currentPage={page}
              totalPages={Math.max(page, Math.ceil((result.data?.total ?? 0) / 25))}
              onPageChange={setPage}
              labels={{ next: common('next'), previous: common('previous') }}
            />
          </div>
        </>
      )}
      {editor !== undefined ? (
        <AcademicEditor
          kind={kind}
          row={editor}
          parent={parent}
          close={() => setEditor(undefined)}
          saved={() => {
            setEditor(undefined);
            setRevision((value) => value + 1);
          }}
        />
      ) : null}
      {pending ? (
        <AcademicDialog
          title={t(pending.action)}
          description={t('confirmAction', { name: pending.row.name })}
          close={() => setPending(null)}
          busy={busy}
        >
          <p className="text-sm text-muted-foreground">
            {t(
              pending.action === 'close' ||
                (kind === 'academic-years' && pending.action === 'archive')
                ? 'irreversible'
                : 'historyHint',
            )}
          </p>
          {error ? <AcademicErrorNotice error={error} /> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setPending(null)}>
              {common('cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                void confirm();
              }}
            >
              {common('confirm')}
            </Button>
          </div>
        </AcademicDialog>
      ) : null}
    </section>
  );
}
