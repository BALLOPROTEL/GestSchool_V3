'use client';

import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  DataTable,
  EmptyState,
  Pagination,
  Select,
  SelectItem,
  StatusBadge,
} from '@gestschool/ui';
import type { DataTableColumn, StatusTone } from '@gestschool/ui';
import { BookOpenCheck, Download, Mail, Phone, Plus, SearchX, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { Link } from '../../i18n/navigation';
import { auditRecords, parents, students, subjects, teachers, users } from '../../mocks/data';
import type { AuditRecord, Parent, Student, Subject, Teacher, UserRecord } from '../../mocks/data';
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

export function StudentsPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const statusText = useTranslations('Status');
  const translate = useTranslations('Students');
  const mockAction = useMockAction();
  const [query, setQuery] = useState('');
  const [className, setClassName] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<readonly string[]>([]);

  const filtered = useMemo(
    () =>
      students.filter((student) => {
        const matchesQuery = `${student.name} ${student.id} ${student.email}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase());
        const matchesClass = className === 'all' || student.className === className;
        const matchesStatus = status === 'all' || student.status === status;
        return matchesQuery && matchesClass && matchesStatus;
      }),
    [className, query, status],
  );

  const columns: readonly DataTableColumn<Student>[] = [
    {
      cell: (student) => (
        <Checkbox
          aria-label={`${translate('name')} ${student.name}`}
          checked={selected.includes(student.id)}
          onCheckedChange={() =>
            setSelected((current) =>
              current.includes(student.id)
                ? current.filter((identifier) => identifier !== student.id)
                : [...current, student.id],
            )
          }
        />
      ),
      header: (
        <Checkbox
          aria-label={translate('selected', { count: filtered.length })}
          checked={
            filtered.length > 0 && filtered.every((student) => selected.includes(student.id))
          }
          onCheckedChange={() =>
            setSelected((current) =>
              filtered.every((student) => current.includes(student.id))
                ? current.filter(
                    (identifier) => !filtered.some((student) => student.id === identifier),
                  )
                : [...new Set([...current, ...filtered.map((student) => student.id)])],
            )
          }
        />
      ),
      id: 'select',
    },
    {
      cell: (student) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarFallback className="text-[11px]">{getInitials(student.name)}</AvatarFallback>
          </Avatar>
          <Link
            className="whitespace-nowrap font-semibold text-foreground outline-none hover:text-primary focus-visible:underline"
            href={`/students/${student.id}`}
          >
            {student.name}
          </Link>
        </div>
      ),
      header: translate('name'),
      id: 'name',
    },
    {
      cell: (student) => <span className="font-mono text-xs">{student.id}</span>,
      header: translate('identifier'),
      id: 'id',
    },
    {
      cell: (student) => <span className="text-muted-foreground">{student.email}</span>,
      header: translate('email'),
      id: 'email',
    },
    {
      cell: (student) => <Badge variant="outline">{student.className}</Badge>,
      header: translate('class'),
      id: 'class',
    },
    {
      cell: (student) => <span className="font-mono">{student.attendance}%</span>,
      header: translate('attendance'),
      id: 'attendance',
    },
    {
      cell: (student) => <StatusPill status={student.status} />,
      header: common('status'),
      id: 'status',
    },
    {
      cell: (student) => (
        <span className="text-xs text-muted-foreground">{student.lastActivity}</span>
      ),
      header: translate('lastActivity'),
      id: 'activity',
    },
    { cell: () => <RowActions destructive />, header: common('actions'), id: 'actions' },
  ];

  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <>
            <Button onClick={() => mockAction(common('export'))} size="sm" variant="outline">
              <Download /> {common('export')}
            </Button>
            <Button onClick={() => mockAction(translate('add'))} size="sm">
              <Plus /> {translate('add')}
            </Button>
          </>
        }
        description={translate('description')}
        eyebrow={nav('schoolLife')}
        title={translate('title')}
      />
      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
          <SearchField
            label={common('search')}
            onChange={setQuery}
            placeholder={translate('search')}
            value={query}
          />
          <Select
            aria-label={translate('allClasses')}
            onChange={(event) => setClassName(event.target.value)}
            value={className}
          >
            <SelectItem value="all">{translate('allClasses')}</SelectItem>
            {['Terminale C', 'Terminale D', '3ème A', '2nde B'].map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </Select>
          <Select
            aria-label={translate('allStatuses')}
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <SelectItem value="all">{translate('allStatuses')}</SelectItem>
            <SelectItem value="active">{statusText('active')}</SelectItem>
            <SelectItem value="pending">{statusText('pending')}</SelectItem>
            <SelectItem value="inactive">{statusText('inactive')}</SelectItem>
          </Select>
          <Button onClick={() => mockAction(common('filters'))} variant="outline">
            {common('filters')}
          </Button>
        </CardContent>
      </Card>

      {selected.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold">
            {translate('selected', { count: selected.length })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => mockAction(common('send'))} size="sm" variant="outline">
              {common('send')}
            </Button>
            <Button onClick={() => setSelected([])} size="sm" variant="ghost">
              {common('clear')}
            </Button>
          </div>
        </div>
      ) : null}

      <Card className="mt-4 overflow-hidden">
        <DataTable
          caption={translate('caption')}
          columns={columns}
          emptyState={<EmptySearch title={common('noResults')} />}
          getRowId={(student) => student.id}
          minWidth={1040}
          rows={filtered}
        />
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {common('results', { count: filtered.length })}
          </span>
          <Pagination
            currentPage={1}
            labels={{ next: common('next'), previous: common('previous') }}
            totalPages={3}
          />
        </div>
      </Card>
    </div>
  );
}

export function ParentsPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Parents');
  const mockAction = useMockAction();
  const [query, setQuery] = useState('');
  const filtered = parents.filter((parent) =>
    `${parent.name} ${parent.children.join(' ')}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const columns: readonly DataTableColumn<Parent>[] = [
    {
      cell: (parent) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarFallback>{getInitials(parent.name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="whitespace-nowrap font-semibold">{parent.name}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{parent.id}</p>
          </div>
        </div>
      ),
      header: translate('name'),
      id: 'parent',
    },
    {
      cell: (parent) => (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {parent.children.map((child) => (
            <p key={child}>{child}</p>
          ))}
        </div>
      ),
      header: translate('children'),
      id: 'children',
    },
    {
      cell: (parent) => (
        <div className="space-y-1 text-xs">
          <p className="flex items-center gap-1.5">
            <Phone className="size-3 text-muted-foreground" />
            {parent.phone}
          </p>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Mail className="size-3" />
            {parent.email}
          </p>
        </div>
      ),
      header: common('contact'),
      id: 'contact',
    },
    {
      cell: (parent) => <StatusPill status={parent.status} />,
      header: common('status'),
      id: 'status',
    },
    { cell: () => <RowActions />, header: common('actions'), id: 'actions' },
  ];
  return (
    <DirectoryLayout
      actions={
        <>
          <Button onClick={() => mockAction(common('export'))} size="sm" variant="outline">
            <Download />
            {common('export')}
          </Button>
          <Button onClick={() => mockAction(translate('add'))} size="sm">
            <Plus />
            {translate('add')}
          </Button>
        </>
      }
      description={translate('description', { count: parents.length })}
      eyebrow={nav('schoolLife')}
      query={query}
      searchPlaceholder={translate('search')}
      setQuery={setQuery}
      title={translate('title')}
    >
      <DataTable
        caption={translate('caption')}
        columns={columns}
        emptyState={<EmptySearch title={common('noResults')} />}
        getRowId={(parent) => parent.id}
        minWidth={850}
        rows={filtered}
      />
    </DirectoryLayout>
  );
}

export function TeachersPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Teachers');
  const mockAction = useMockAction();
  const [query, setQuery] = useState('');
  const filtered = teachers.filter((teacher) =>
    `${teacher.name} ${teacher.subjects.join(' ')}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const columns: readonly DataTableColumn<Teacher>[] = [
    {
      cell: (teacher) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarFallback>{getInitials(teacher.name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="whitespace-nowrap font-semibold">{teacher.name}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{teacher.id}</p>
          </div>
        </div>
      ),
      header: translate('name'),
      id: 'teacher',
    },
    {
      cell: (teacher) => (
        <div className="flex flex-wrap gap-1">
          {teacher.subjects.map((subject) => (
            <Badge
              className="gap-1 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
              key={subject}
            >
              <BookOpenCheck className="size-3" />
              {subject}
            </Badge>
          ))}
        </div>
      ),
      header: translate('subjects'),
      id: 'subjects',
    },
    {
      cell: (teacher) => (
        <span className="text-xs text-muted-foreground">{teacher.classes.join(', ')}</span>
      ),
      header: translate('classes'),
      id: 'classes',
    },
    {
      cell: (teacher) => <span className="font-mono">{teacher.hours} h</span>,
      header: translate('hours'),
      id: 'hours',
    },
    {
      cell: (teacher) => <StatusPill status={teacher.status} />,
      header: common('status'),
      id: 'status',
    },
    { cell: () => <RowActions />, header: common('actions'), id: 'actions' },
  ];
  return (
    <DirectoryLayout
      actions={
        <>
          <Button onClick={() => mockAction(common('export'))} size="sm" variant="outline">
            <Download />
            {common('export')}
          </Button>
          <Button onClick={() => mockAction(translate('add'))} size="sm">
            <Plus />
            {translate('add')}
          </Button>
        </>
      }
      description={translate('description', { count: teachers.length })}
      eyebrow={nav('schoolLife')}
      query={query}
      searchPlaceholder={translate('search')}
      setQuery={setQuery}
      title={translate('title')}
    >
      <DataTable
        caption={translate('caption')}
        columns={columns}
        emptyState={<EmptySearch title={common('noResults')} />}
        getRowId={(teacher) => teacher.id}
        minWidth={900}
        rows={filtered}
      />
    </DirectoryLayout>
  );
}

export function SubjectsPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Subjects');
  const mockAction = useMockAction();
  const [query, setQuery] = useState('');
  const filtered = subjects.filter((subject) =>
    `${subject.code} ${subject.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const columns: readonly DataTableColumn<Subject>[] = [
    {
      cell: (subject) => (
        <Badge className="font-mono" variant="outline">
          {subject.code}
        </Badge>
      ),
      header: translate('code'),
      id: 'code',
    },
    {
      cell: (subject) => <span className="font-semibold">{subject.name}</span>,
      header: translate('name'),
      id: 'name',
    },
    {
      cell: (subject) => <span className="font-mono font-bold">{subject.coefficient}</span>,
      header: translate('coefficient'),
      id: 'coefficient',
    },
    {
      cell: (subject) => (
        <div className="flex gap-1">
          {subject.levels.map((level) => (
            <Badge key={level} variant="secondary">
              {level}
            </Badge>
          ))}
        </div>
      ),
      header: translate('levels'),
      id: 'levels',
    },
    {
      cell: (subject) => <span className="font-mono">{subject.teachers}</span>,
      header: translate('teachers'),
      id: 'teachers',
    },
    { cell: () => <RowActions destructive />, header: common('actions'), id: 'actions' },
  ];
  return (
    <DirectoryLayout
      actions={
        <Button onClick={() => mockAction(translate('add'))} size="sm">
          <Plus />
          {translate('add')}
        </Button>
      }
      description={translate('description', { count: subjects.length })}
      eyebrow={nav('academic')}
      query={query}
      searchPlaceholder={translate('search')}
      setQuery={setQuery}
      title={translate('title')}
    >
      <DataTable
        caption={translate('caption')}
        columns={columns}
        emptyState={<EmptySearch title={common('noResults')} />}
        getRowId={(subject) => subject.code}
        minWidth={760}
        rows={filtered}
      />
    </DirectoryLayout>
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
