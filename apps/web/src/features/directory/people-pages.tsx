'use client';
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Pagination,
  Select,
  SelectItem,
  StatusBadge,
} from '@gestschool/ui';
import type { DataTableColumn } from '@gestschool/ui';
import type { PeopleKind, PersonView, PageResult } from '@gestschool/contracts';
import { Plus, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '../../i18n/navigation';
import { useAuth } from '../auth/auth-provider';
import { getInitials } from '../shared/format';
import { PageHeader } from '../shared/page-header';
import { SearchField } from '../shared/search-field';
import { canRead, canWrite, peopleRequest } from './people-client';
import { useDebounced, usePeopleData } from './people-hooks';
import { ErrorNotice, PersonEditor } from './person-editor';
import { GuardianLinks } from './guardian-links';

export function PersonStatus({ person }: { person: PersonView }) {
  const t = useTranslations('People');
  return (
    <StatusBadge dot tone={person.status === 'ACTIVE' ? 'success' : 'neutral'}>
      {t(person.status)}
    </StatusBadge>
  );
}
export function PeoplePage({ kind }: { kind: PeopleKind }) {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const t = useTranslations('People');
  const translate = useTranslations(
    kind === 'students' ? 'Students' : kind === 'guardians' ? 'Parents' : 'Teachers',
  );
  const { session } = useAuth();
  const allowed = canRead(session?.session, kind);
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('ACTIVE');
  const [sort, setSort] = useState('name');
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<PersonView | null | undefined>();
  const [detail, setDetail] = useState<PersonView | null>(null);
  const [pending, setPending] = useState<PersonView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const result = usePeopleData<PageResult<PersonView>>(
    allowed
      ? `${kind}?page=${page}&pageSize=25&search=${encodeURIComponent(search)}&status=${status}&sort=${sort}`
      : null,
    revision,
  );
  const columns: DataTableColumn<PersonView>[] = [
    {
      id: 'name',
      header: translate('name'),
      cell: (person) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarFallback className="text-[11px]">
              {getInitials(`${person.firstName} ${person.lastName}`)}
            </AvatarFallback>
          </Avatar>
          {kind === 'students' ? (
            <Link
              className="whitespace-nowrap font-semibold text-foreground outline-none hover:text-primary focus-visible:underline"
              href={`/students/${person.id}`}
            >
              {person.firstName} {person.lastName}
            </Link>
          ) : (
            <span className="whitespace-nowrap font-semibold">
              {person.firstName} {person.lastName}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'reference',
      header: t(
        kind === 'students'
          ? 'matricule'
          : kind === 'guardians'
            ? 'guardianReference'
            : 'employeeNumber',
      ),
      cell: (person) => (
        <span className="font-mono text-xs">
          {person.matricule ?? person.guardianReference ?? person.employeeNumber}
        </span>
      ),
    },
    ...(kind === 'guardians'
      ? [
          {
            id: 'contact',
            header: common('contact'),
            cell: (person: PersonView) => (
              <div className="text-xs text-muted-foreground">
                <p>{person.phone ?? '—'}</p>
                <p>{person.email ?? '—'}</p>
              </div>
            ),
          },
        ]
      : []),
    ...(kind === 'students'
      ? [
          {
            id: 'birthDate',
            header: t('birthDate'),
            cell: (person: PersonView) => (
              <span className="text-xs text-muted-foreground">{person.birthDate ?? '—'}</span>
            ),
          },
        ]
      : []),
    { id: 'status', header: common('status'), cell: (person) => <PersonStatus person={person} /> },
    {
      id: 'actions',
      header: common('actions'),
      cell: (person) => (
        <div className="flex gap-2">
          {kind === 'guardians' ? (
            <Button size="sm" variant="ghost" onClick={() => setDetail(person)}>
              {t('children')}
            </Button>
          ) : null}
          {canWrite(session?.session, kind, 'update') && person.status !== 'ARCHIVED' ? (
            <Button size="sm" variant="ghost" onClick={() => setEditor(person)}>
              {common('edit')}
            </Button>
          ) : null}
          {canWrite(session?.session, kind, 'archive') ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setError(undefined);
                setPending(person);
              }}
            >
              {person.status === 'ARCHIVED' ? t('restore') : t('archive')}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];
  async function archive() {
    if (!pending) return;
    setBusy(true);
    setError(undefined);
    try {
      await peopleRequest(
        `${kind}/${pending.id}/${pending.status === 'ARCHIVED' ? 'restore' : 'archive'}`,
        {},
        'POST',
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
    <div className="page-shell" data-people-ready={!result.loading}>
      <PageHeader
        eyebrow={nav('schoolLife')}
        title={translate('title')}
        description={
          kind === 'students'
            ? translate('description')
            : translate('description', { count: result.data?.total ?? 0 })
        }
        actions={
          canWrite(session?.session, kind, 'create') ? (
            <Button data-person-focus onClick={() => setEditor(null)} size="sm">
              <Plus />
              {translate('add')}
            </Button>
          ) : undefined
        }
      />
      {!allowed ? (
        <p role="status" className="rounded-xl border border-border p-5">
          {t('forbidden')}
        </p>
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(220px,1fr)_180px_180px]">
              <SearchField
                label={common('search')}
                placeholder={translate('search')}
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
                {(['ACTIVE', 'INACTIVE', 'ARCHIVED', 'ALL'] as const).map((value) => (
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
                <SelectItem value="name">{t('sortName')}</SelectItem>
                <SelectItem value="-name">{t('sortNameDesc')}</SelectItem>
                <SelectItem value="-createdAt">{t('sortRecent')}</SelectItem>
                <SelectItem value="reference">{t('sortReference')}</SelectItem>
              </Select>
            </CardContent>
          </Card>
          <Card className="mt-4 overflow-hidden" aria-busy={result.loading}>
            {result.loading ? (
              <p className="p-6" role="status">
                {t('loading')}
              </p>
            ) : result.error ? (
              <div className="p-4">
                <ErrorNotice error={result.error} />
                <Button
                  className="mt-3"
                  variant="outline"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  {t('retry')}
                </Button>
              </div>
            ) : (
              <DataTable
                caption={translate('caption')}
                columns={columns}
                getRowId={(person) => person.id}
                rows={result.data?.items ?? []}
                minWidth={kind === 'guardians' ? 850 : 900}
                emptyState={
                  <EmptyState
                    className="py-10"
                    icon={SearchX}
                    title={common('noResults')}
                    description={t('empty')}
                  />
                }
              />
            )}
            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-muted-foreground" role="status">
                {common('results', { count: result.data?.total ?? 0 })}
              </span>
              <Pagination
                currentPage={page}
                totalPages={Math.max(page, Math.ceil((result.data?.total ?? 0) / 25))}
                onPageChange={setPage}
                labels={{ next: common('next'), previous: common('previous') }}
              />
            </div>
          </Card>
        </>
      )}
      {editor !== undefined ? (
        <PersonEditor
          kind={kind}
          person={editor}
          close={() => setEditor(undefined)}
          saved={() => {
            setEditor(undefined);
            setRevision((value) => value + 1);
          }}
        />
      ) : null}
      {detail ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setDetail(null);
          }}
        >
          <DialogContent
            closeLabel={common('close')}
            className="max-h-[90dvh] max-w-2xl overflow-y-auto"
          >
            <DialogHeader>
              <DialogTitle>
                {detail.firstName} {detail.lastName}
              </DialogTitle>
              <DialogDescription>{t('linkedChildren')}</DialogDescription>
            </DialogHeader>
            <GuardianLinks person={detail} side="guardian" />
          </DialogContent>
        </Dialog>
      ) : null}
      {pending ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setPending(null);
          }}
        >
          <DialogContent closeLabel={common('close')}>
            <DialogHeader>
              <DialogTitle>
                {pending.status === 'ARCHIVED' ? t('restore') : t('archive')}
              </DialogTitle>
              <DialogDescription>
                {t('archiveHint', { name: `${pending.firstName} ${pending.lastName}` })}
              </DialogDescription>
            </DialogHeader>
            {error ? <ErrorNotice error={error} /> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" disabled={busy} onClick={() => setPending(null)}>
                {common('cancel')}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  void archive();
                }}
              >
                {common('confirm')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
export function StudentsPage() {
  return <PeoplePage kind="students" />;
}
export function ParentsPage() {
  return <PeoplePage kind="guardians" />;
}
export function TeachersPage() {
  return <PeoplePage kind="teachers" />;
}
