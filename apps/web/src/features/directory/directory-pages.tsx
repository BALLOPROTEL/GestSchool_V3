'use client';

import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  DataTable,
  EmptyState,
  StatusBadge,
} from '@gestschool/ui';
import type { DataTableColumn, StatusTone } from '@gestschool/ui';
import { Download, Plus, SearchX, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { auditRecords, users } from '../../mocks/data';
import type { AuditRecord, UserRecord } from '../../mocks/data';
import { getInitials } from '../shared/format';
import { useMockAction } from '../shared/mock-action';
import { PageHeader } from '../shared/page-header';
import { RowActions } from '../shared/row-actions';
import { SearchField } from '../shared/search-field';
import { StatusPill } from '../shared/status-pill';

function EmptySearch({ title }: { title: string }) {
  const common = useTranslations('Common');
  return (
    <EmptyState className="py-10" description={common('noResults')} icon={SearchX} title={title} />
  );
}

const roleTones: Record<UserRecord['role'], StatusTone> = {
  accountant: 'success',
  admin: 'danger',
  director: 'violet',
  registrar: 'warning',
  teacher: 'info',
};

export function UsersPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Users');
  const mockAction = useMockAction();
  const [query, setQuery] = useState('');
  const filtered = users.filter((user) =>
    `${user.name} ${user.email}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const columns: readonly DataTableColumn<UserRecord>[] = [
    {
      cell: (user) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="whitespace-nowrap font-semibold">{user.name}</p>
            <p className="text-[11px] text-muted-foreground">{user.email}</p>
          </div>
        </div>
      ),
      header: translate('user'),
      id: 'user',
    },
    {
      cell: (user) => (
        <StatusBadge tone={roleTones[user.role]}>
          <ShieldCheck className="size-3" />
          {translate(user.role)}
        </StatusBadge>
      ),
      header: common('role'),
      id: 'role',
    },
    {
      cell: (user) => <span className="text-xs text-muted-foreground">{user.lastLogin}</span>,
      header: translate('lastLogin'),
      id: 'login',
    },
    { cell: (user) => <StatusPill status={user.status} />, header: common('status'), id: 'status' },
    { cell: () => <RowActions />, header: common('actions'), id: 'actions' },
  ];
  return (
    <DirectoryLayout
      actions={
        <Button onClick={() => mockAction(translate('invite'))} size="sm">
          <Plus />
          {translate('invite')}
        </Button>
      }
      description={translate('description', { count: users.length })}
      eyebrow={nav('system')}
      query={query}
      searchPlaceholder={translate('search')}
      setQuery={setQuery}
      title={translate('title')}
    >
      <DataTable
        caption={translate('caption')}
        columns={columns}
        emptyState={<EmptySearch title={common('noResults')} />}
        getRowId={(user) => user.id}
        minWidth={860}
        rows={filtered}
      />
    </DirectoryLayout>
  );
}

export function AuditPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Audit');
  const mockAction = useMockAction();
  const [query, setQuery] = useState('');
  const filtered = auditRecords.filter((record) =>
    `${record.user} ${record.action} ${record.details}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const columns: readonly DataTableColumn<AuditRecord>[] = [
    {
      cell: (record) => (
        <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
          {record.timestamp}
        </span>
      ),
      header: translate('timestamp'),
      id: 'timestamp',
    },
    {
      cell: (record) => <span className="whitespace-nowrap font-semibold">{record.user}</span>,
      header: translate('user'),
      id: 'user',
    },
    {
      cell: (record) => <StatusBadge tone={record.severity}>{record.action}</StatusBadge>,
      header: translate('action'),
      id: 'action',
    },
    {
      cell: (record) => <span className="text-xs text-muted-foreground">{record.entity}</span>,
      header: translate('entity'),
      id: 'entity',
    },
    {
      cell: (record) => <span className="text-xs">{record.details}</span>,
      header: translate('details'),
      id: 'details',
    },
  ];
  return (
    <DirectoryLayout
      actions={
        <>
          <Button onClick={() => mockAction(common('filters'))} size="sm" variant="outline">
            {common('filters')}
          </Button>
          <Button onClick={() => mockAction(translate('export'))} size="sm" variant="outline">
            <Download />
            {translate('export')}
          </Button>
        </>
      }
      description={translate('description')}
      eyebrow={nav('system')}
      query={query}
      searchPlaceholder={translate('search')}
      setQuery={setQuery}
      title={translate('title')}
    >
      <DataTable
        caption={translate('caption')}
        columns={columns}
        emptyState={<EmptySearch title={common('noResults')} />}
        getRowId={(record) => record.id}
        minWidth={900}
        rows={filtered}
      />
    </DirectoryLayout>
  );
}

type DirectoryLayoutProperties = {
  actions: ReactNode;
  children: ReactNode;
  description: string;
  eyebrow: string;
  query: string;
  searchPlaceholder: string;
  setQuery: (query: string) => void;
  title: string;
};

function DirectoryLayout({
  actions,
  children,
  description,
  eyebrow,
  query,
  searchPlaceholder,
  setQuery,
  title,
}: DirectoryLayoutProperties) {
  const common = useTranslations('Common');
  return (
    <div className="page-shell">
      <PageHeader actions={actions} description={description} eyebrow={eyebrow} title={title} />
      <SearchField
        label={common('search')}
        onChange={setQuery}
        placeholder={searchPlaceholder}
        value={query}
      />
      <Card className="mt-5 overflow-hidden">{children}</Card>
    </div>
  );
}
