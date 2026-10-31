'use client';

import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Select,
  SelectItem,
  StatusBadge,
} from '@gestschool/ui';
import type { DataTableColumn, StatusTone } from '@gestschool/ui';
import type {
  UserAdminListView,
  UserAdminRecord,
  UserAdminRoleView,
} from '@gestschool/contracts';
import {
  Download,
  KeyRound,
  Plus,
  RefreshCcw,
  SearchX,
  ShieldCheck,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { auditRecords } from '../../mocks/data';
import type { AuditRecord } from '../../mocks/data';
import { getInitials } from '../shared/format';
import { useMockAction } from '../shared/mock-action';
import { useAuth } from '../auth/auth-provider';
import { PeopleError, peopleRequest } from './people-client';
import { useDebounced, usePeopleData } from './people-hooks';
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

const roleTone = (role: string | undefined): StatusTone => {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'danger';
    case 'SCHOOL_ADMIN':
      return 'violet';
    case 'DIRECTOR':
      return 'info';
    case 'ACCOUNTANT':
      return 'success';
    case 'ACADEMIC_STAFF':
      return 'warning';
    default:
      return 'neutral';
  }
};

function hasGrant(
  grants: readonly { permission: string; scope: string }[],
  permission: string,
): boolean {
  return grants.some(
    (grant) =>
      grant.permission === permission &&
      ['TENANT', 'PLATFORM'].includes(grant.scope),
  );
}

function UserStatus({ record }: { record: UserAdminRecord }) {
  const translate = useTranslations('Users');
  if (!record.activated)
    return <StatusBadge tone="warning">{translate('statusInvited')}</StatusBadge>;
  if (record.membershipStatus === 'SUSPENDED')
    return <StatusBadge tone="danger">{translate('statusSuspended')}</StatusBadge>;
  return <StatusBadge tone="success">{translate('statusActive')}</StatusBadge>;
}

export function UsersPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Users');
  const { session } = useAuth();
  const grants = session?.session.grants ?? [];
  const canRead = hasGrant(grants, 'users.read');
  const canInvite = hasGrant(grants, 'users.invite');
  const canAssign = hasGrant(grants, 'roles.assign');
  const canStatus = hasGrant(grants, 'users.status');
  const canCredentials = hasGrant(grants, 'users.credentials');

  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ displayName: '', email: '', roleId: '' });

  const path = canRead
    ? `iam/users?q=${encodeURIComponent(debounced)}&page=${page}&pageSize=25`
    : null;
  const result = usePeopleData<UserAdminListView>(path, revision);
  const roles = usePeopleData<UserAdminRoleView[]>(canRead ? 'iam/roles' : null, revision);
  const pages = Math.max(1, Math.ceil((result.data?.total ?? 0) / 25));

  function refresh() {
    setRevision((value) => value + 1);
  }

  async function action(
    key: string,
    run: () => Promise<unknown>,
    success: string,
  ) {
    if (busy) return;
    setBusy(key);
    try {
      await run();
      toast.success(success);
      refresh();
    } catch (error) {
      toast.error(
        error instanceof PeopleError
          ? translate('actionErrorWithCode', { code: error.code })
          : translate('actionError'),
      );
    } finally {
      setBusy(null);
    }
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invite.displayName.trim() || !invite.email.trim() || !invite.roleId) return;
    await action(
      'invite',
      () =>
        peopleRequest(
          'iam/invitations',
          {
            displayName: invite.displayName,
            email: invite.email,
            roleId: invite.roleId,
          },
          'POST',
        ),
      translate('inviteSent'),
    );
    setInvite({ displayName: '', email: '', roleId: '' });
    setInviteOpen(false);
  }

  const columns: readonly DataTableColumn<UserAdminRecord>[] = [
    {
      cell: (user) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="whitespace-nowrap font-semibold">{user.displayName}</p>
            <p className="text-[11px] text-muted-foreground">{user.email}</p>
          </div>
        </div>
      ),
      header: translate('user'),
      id: 'user',
    },
    {
      cell: (user) =>
        canAssign && roles.data?.length ? (
          <Select
            aria-label={translate('roleFor', { name: user.displayName })}
            disabled={busy === `role-${user.membershipId}`}
            value={user.role?.id ?? ''}
            onChange={(event) =>
              void action(
                `role-${user.membershipId}`,
                () =>
                  peopleRequest(
                    `iam/memberships/${user.membershipId}/role`,
                    { roleId: event.target.value },
                    'PUT',
                  ),
                translate('roleUpdated'),
              )
            }
          >
            <SelectItem value="">{translate('noRole')}</SelectItem>
            {roles.data.map((role) => (
              <SelectItem key={role.id} value={role.id}>
                {role.name}
              </SelectItem>
            ))}
          </Select>
        ) : (
          <StatusBadge tone={roleTone(user.role?.code)}>
            <ShieldCheck className="size-3" />
            {user.role?.name ?? translate('noRole')}
          </StatusBadge>
        ),
      header: common('role'),
      id: 'role',
    },
    {
      cell: (user) => (
        <div className="space-y-1 text-xs">
          <UserStatus record={user} />
          <p className="text-muted-foreground">
            {user.mfaEnabled ? translate('mfaEnabled') : translate('mfaDisabled')}
          </p>
        </div>
      ),
      header: common('status'),
      id: 'status',
    },
    {
      cell: (user) => (
        <span className="text-xs text-muted-foreground">
          {user.lastLoginAt
            ? new Intl.DateTimeFormat(undefined, {
                dateStyle: 'short',
                timeStyle: 'short',
              }).format(new Date(user.lastLoginAt))
            : translate('never')}
        </span>
      ),
      header: translate('lastLogin'),
      id: 'login',
    },
    {
      cell: (user) => {
        const self = user.membershipId === session?.session.membershipId;
        return (
          <div className="flex flex-wrap justify-end gap-1">
            {canCredentials && !user.activated ? (
              <Button
                aria-label={translate('resendActivationFor', { name: user.displayName })}
                disabled={busy !== null}
                size="sm"
                variant="ghost"
                onClick={() =>
                  void action(
                    `activation-${user.membershipId}`,
                    () =>
                      peopleRequest(
                        `iam/memberships/${user.membershipId}/credentials`,
                        { purpose: 'ACTIVATION' },
                        'POST',
                      ),
                    translate('activationSent'),
                  )
                }
              >
                <RefreshCcw />
                {translate('activation')}
              </Button>
            ) : null}
            {canCredentials && user.activated && user.membershipStatus === 'ACTIVE' ? (
              <Button
                aria-label={translate('resetFor', { name: user.displayName })}
                disabled={busy !== null}
                size="sm"
                variant="ghost"
                onClick={() =>
                  void action(
                    `reset-${user.membershipId}`,
                    () =>
                      peopleRequest(
                        `iam/memberships/${user.membershipId}/credentials`,
                        { purpose: 'PASSWORD_RESET' },
                        'POST',
                      ),
                    translate('resetSent'),
                  )
                }
              >
                <KeyRound />
                {translate('reset')}
              </Button>
            ) : null}
            {canStatus && user.membershipStatus !== 'INVITED' ? (
              <Button
                aria-label={
                  user.membershipStatus === 'SUSPENDED'
                    ? translate('reactivateFor', { name: user.displayName })
                    : translate('suspendFor', { name: user.displayName })
                }
                disabled={busy !== null || self}
                size="sm"
                variant={user.membershipStatus === 'SUSPENDED' ? 'outline' : 'ghost'}
                onClick={() =>
                  void action(
                    `status-${user.membershipId}`,
                    () =>
                      peopleRequest(
                        `iam/memberships/${user.membershipId}/status`,
                        {
                          status:
                            user.membershipStatus === 'SUSPENDED'
                              ? 'ACTIVE'
                              : 'SUSPENDED',
                        },
                        'PUT',
                      ),
                    user.membershipStatus === 'SUSPENDED'
                      ? translate('reactivated')
                      : translate('suspended'),
                  )
                }
              >
                {user.membershipStatus === 'SUSPENDED' ? <UserCheck /> : <UserX />}
                {user.membershipStatus === 'SUSPENDED'
                  ? translate('reactivate')
                  : translate('suspend')}
              </Button>
            ) : null}
          </div>
        );
      },
      header: common('actions'),
      id: 'actions',
    },
  ];

  if (!canRead) {
    return (
      <div className="page-shell">
        <PageHeader
          description={translate('description', { count: 0 })}
          eyebrow={nav('system')}
          title={translate('title')}
        />
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm font-medium text-foreground"
        >
          {translate('forbidden')}
        </p>
      </div>
    );
  }

  return (
    <div className="contents" data-users-ready={!result.loading}>
      <DirectoryLayout
        actions={
          canInvite ? (
            <Button onClick={() => setInviteOpen(true)} size="sm">
              <Plus />
              {translate('invite')}
            </Button>
          ) : null
        }
        description={translate('description', { count: result.data?.total ?? 0 })}
        eyebrow={nav('system')}
        query={query}
        searchPlaceholder={translate('search')}
        setQuery={(value) => {
          setQuery(value);
          setPage(1);
        }}
        title={translate('title')}
      >
        {result.error ? (
          <p role="alert" className="p-5 text-sm text-destructive">
            {translate('loadError')}
          </p>
        ) : null}
        {result.loading ? (
          <p role="status" className="p-5 text-sm text-muted-foreground">
            {common('loading')}
          </p>
        ) : (
          <DataTable
            caption={translate('caption')}
            columns={columns}
            emptyState={<EmptySearch title={common('noResults')} />}
            getRowId={(user) => user.membershipId}
            minWidth={980}
            rows={result.data?.items ?? []}
          />
        )}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {translate('page', { page, pages })}
          </p>
          <div className="flex gap-2">
            <Button
              disabled={page <= 1 || result.loading}
              size="sm"
              variant="outline"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              {common('previous')}
            </Button>
            <Button
              disabled={page >= pages || result.loading}
              size="sm"
              variant="outline"
              onClick={() => setPage((value) => Math.min(pages, value + 1))}
            >
              {common('next')}
            </Button>
          </div>
        </div>
      </DirectoryLayout>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent closeLabel={common('close')}>
          <form className="space-y-5" onSubmit={(event) => void submitInvite(event)}>
            <DialogHeader>
              <DialogTitle>{translate('invite')}</DialogTitle>
              <DialogDescription>{translate('inviteDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-name">{translate('displayName')}</Label>
                <Input
                  id="invite-name"
                  autoComplete="name"
                  maxLength={160}
                  required
                  value={invite.displayName}
                  onChange={(event) =>
                    setInvite((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-email">{common('email')}</Label>
                <Input
                  id="invite-email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  type="email"
                  value={invite.email}
                  onChange={(event) =>
                    setInvite((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">{common('role')}</Label>
                <Select
                  id="invite-role"
                  required
                  value={invite.roleId}
                  onChange={(event) =>
                    setInvite((current) => ({ ...current, roleId: event.target.value }))
                  }
                >
                  <SelectItem value="">{translate('chooseRole')}</SelectItem>
                  {(roles.data ?? []).map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteOpen(false)}
              >
                {common('cancel')}
              </Button>
              <Button disabled={busy !== null} type="submit">
                <Plus />
                {translate('sendInvite')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
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
