'use client';

import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  KpiCard,
  Select,
  SelectItem,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@gestschool/ui';
import type { DataTableColumn } from '@gestschool/ui';
import {
  CalendarCheck,
  CheckCircle2,
  CircleX,
  Clock3,
  Download,
  FileText,
  Plus,
  SearchX,
  UsersRound,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import type { AppLocale } from '../../i18n/routing';
import {
  enrollments,
  gradeRecords,
  schoolClasses,
  students,
  weeklyAttendance,
} from '../../mocks/data';
import type { Enrollment, GradeRecord, Student } from '../../mocks/data';
import { formatCurrency, formatNumber, getInitials } from '../shared/format';
import { useMockAction } from '../shared/mock-action';
import { PageHeader } from '../shared/page-header';
import { ProgressBar } from '../shared/progress-bar';
import { RowActions } from '../shared/row-actions';
import { SearchField } from '../shared/search-field';
import { StatusPill } from '../shared/status-pill';

export function EnrollmentsPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const statusText = useTranslations('Status');
  const translate = useTranslations('Enrollments');
  const locale = useLocale() as AppLocale;
  const mockAction = useMockAction();
  const [query, setQuery] = useState('');
  const filtered = enrollments.filter((enrollment) =>
    `${enrollment.studentName} ${enrollment.studentId} ${enrollment.id}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const columns: readonly DataTableColumn<Enrollment>[] = [
    {
      cell: (row) => <span className="font-mono text-xs font-semibold">{row.id}</span>,
      header: translate('identifier'),
      id: 'id',
    },
    {
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Avatar className="size-7">
            <AvatarFallback className="text-[10px]">{getInitials(row.studentName)}</AvatarFallback>
          </Avatar>
          <span className="whitespace-nowrap font-semibold">{row.studentName}</span>
        </div>
      ),
      header: common('student'),
      id: 'student',
    },
    {
      cell: (row) => (
        <span className="font-mono text-xs text-muted-foreground">{row.studentId}</span>
      ),
      header: 'ID',
      id: 'studentId',
    },
    {
      cell: (row) => <Badge variant="outline">{row.className}</Badge>,
      header: common('class'),
      id: 'class',
    },
    { cell: () => <span>2026–2027</span>, header: common('year'), id: 'year' },
    {
      cell: (row) => <span className="whitespace-nowrap text-muted-foreground">{row.date}</span>,
      header: translate('date'),
      id: 'date',
    },
    {
      cell: (row) => (
        <span className="whitespace-nowrap font-mono font-semibold">
          {formatCurrency(row.annualTuition, locale)}
        </span>
      ),
      header: translate('annualTuition'),
      id: 'tuition',
    },
    { cell: (row) => <StatusPill status={row.status} />, header: common('status'), id: 'status' },
  ];
  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <Button onClick={() => mockAction(translate('new'))} size="sm">
            <Plus />
            {translate('new')}
          </Button>
        }
        description={translate('description')}
        eyebrow={nav('schoolLife')}
        title={translate('title')}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={FileText} label={translate('total')} value={formatNumber(1247, locale)} />
        <KpiCard
          change="+4,2 %"
          changeDirection="up"
          icon={CheckCircle2}
          label={translate('active')}
          value={formatNumber(1198, locale)}
        />
        <KpiCard icon={Clock3} label={translate('pending')} value="32" />
        <KpiCard icon={CircleX} label={translate('withdrawn')} value="17" />
      </div>
      <Card className="mt-5">
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(220px,1fr)_170px_170px_auto]">
          <SearchField
            label={common('search')}
            onChange={setQuery}
            placeholder={common('search')}
            value={query}
          />
          <Select aria-label={common('year')}>
            <SelectItem>2026–2027</SelectItem>
            <SelectItem>2025–2026</SelectItem>
          </Select>
          <Select aria-label={common('status')}>
            <SelectItem>{common('all')}</SelectItem>
            <SelectItem>{statusText('active')}</SelectItem>
            <SelectItem>{statusText('pending')}</SelectItem>
          </Select>
          <Button onClick={() => mockAction(common('export'))} variant="outline">
            <Download />
            {common('export')}
          </Button>
        </CardContent>
      </Card>
      <Card className="mt-5 overflow-hidden">
        <CardHeader>
          <CardTitle>{translate('caption')}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <DataTable
            caption={translate('caption')}
            columns={columns}
            emptyState={
              <div className="p-8 text-center text-muted-foreground">
                <SearchX className="mx-auto mb-2 size-6" />
                {common('noResults')}
              </div>
            }
            getRowId={(row) => row.id}
            minWidth={1080}
            rows={filtered}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export function ClassesPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Classes');
  const mockAction = useMockAction();
  const [query, setQuery] = useState('');
  const filtered = schoolClasses.filter((schoolClass) =>
    `${schoolClass.name} ${schoolClass.teacher}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="page-shell">
      <PageHeader
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
        description={translate('description', {
          classes: schoolClasses.length,
          students: schoolClasses.reduce((sum, item) => sum + item.count, 0),
        })}
        eyebrow={nav('academic')}
        title={translate('title')}
      />
      <SearchField
        label={common('search')}
        onChange={setQuery}
        placeholder={translate('search')}
        value={query}
      />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {filtered.map((schoolClass) => {
          const percentage = Math.round((schoolClass.count / schoolClass.capacity) * 100);
          return (
            <Card className="transition-shadow hover:shadow-sm" key={schoolClass.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-bold">{schoolClass.name}</h2>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {schoolClass.level} · {translate('room', { room: schoolClass.room })}
                    </p>
                  </div>
                  <Badge className="font-mono text-[10px]" variant="secondary">
                    {schoolClass.id}
                  </Badge>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  {translate('teacher', { name: schoolClass.teacher })}
                </p>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{translate('capacity')}</span>
                  <span className="font-mono font-bold">
                    {schoolClass.count}/{schoolClass.capacity}
                  </span>
                </div>
                <ProgressBar
                  className="mt-2"
                  label={`${translate('capacity')} ${schoolClass.name}`}
                  value={percentage}
                />
                <Button
                  className="mt-4 w-full"
                  onClick={() => mockAction(common('view'))}
                  size="sm"
                  variant="outline"
                >
                  {common('view')}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function gradeTone(value: number): string {
  if (value >= 16)
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300';
  if (value >= 12) return 'bg-blue-100 text-blue-700 dark:bg-blue-950/45 dark:text-blue-300';
  return 'bg-amber-100 text-amber-700 dark:bg-amber-950/45 dark:text-amber-300';
}

function Grade({ value }: { value: number }) {
  return (
    <span
      className={`inline-flex rounded px-2 py-0.5 font-mono text-xs font-semibold ${gradeTone(value)}`}
    >
      {value.toFixed(1)}/20
    </span>
  );
}

export function GradesPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Grades');
  const mockAction = useMockAction();
  const columns: readonly DataTableColumn<GradeRecord>[] = [
    {
      cell: (row) => <span className="font-mono font-bold">#{row.rank}</span>,
      header: translate('rank'),
      id: 'rank',
    },
    {
      cell: (row) => (
        <div>
          <p className="whitespace-nowrap font-semibold">{row.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{row.id}</p>
        </div>
      ),
      header: common('student'),
      id: 'student',
    },
    {
      cell: (row) => <Grade value={row.mathematics} />,
      header: translate('mathematics'),
      id: 'math',
    },
    { cell: (row) => <Grade value={row.physics} />, header: translate('physics'), id: 'physics' },
    { cell: (row) => <Grade value={row.science} />, header: translate('science'), id: 'science' },
    { cell: (row) => <Grade value={row.history} />, header: translate('history'), id: 'history' },
    {
      cell: (row) => (
        <span className="font-mono text-lg font-bold">
          {((row.mathematics + row.physics + row.science + row.history) / 4).toFixed(1)}
        </span>
      ),
      header: translate('average'),
      id: 'average',
    },
  ];
  const summary = [
    [translate('mathematics'), '16,8'],
    [translate('physics'), '16,2'],
    [translate('science'), '15,9'],
    [translate('history'), '15,4'],
  ] as const;
  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <>
            <Button onClick={() => mockAction(common('export'))} size="sm" variant="outline">
              <Download />
              {common('export')}
            </Button>
            <Button onClick={() => mockAction(translate('generate'))} size="sm" variant="outline">
              <FileText />
              {translate('generate')}
            </Button>
            <Button onClick={() => mockAction(translate('add'))} size="sm">
              <Plus />
              {translate('add')}
            </Button>
          </>
        }
        description={translate('description')}
        eyebrow={nav('academic')}
        title={translate('title')}
      />
      <div className="flex flex-wrap gap-3">
        <Select aria-label={common('class')} className="w-48">
          <SelectItem>Terminale C</SelectItem>
          <SelectItem>Terminale D</SelectItem>
        </Select>
        <Select aria-label={common('year')} className="w-40">
          <SelectItem>2026–2027</SelectItem>
        </Select>
      </div>
      <Tabs className="mt-5" defaultValue="q2">
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList>
            <TabsTrigger value="q1">{translate('quarter1')}</TabsTrigger>
            <TabsTrigger value="q2">{translate('quarter2')}</TabsTrigger>
            <TabsTrigger value="q3">{translate('quarter3')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="q2">
          <Card>
            <CardHeader>
              <CardTitle>{translate('performance')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {summary.map(([label, value]) => (
                <div className="rounded-lg bg-muted p-4" key={label}>
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-bold">
                    {value}
                    <span className="text-sm font-normal text-muted-foreground">/20</span>
                  </p>
                  <p className="mt-1 text-xs text-success">↑ 0,8</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="mt-4 overflow-hidden">
            <CardHeader>
              <CardTitle>{translate('caption')}</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <DataTable
                caption={translate('caption')}
                columns={columns}
                getRowId={(row) => row.id}
                minWidth={900}
                rows={gradeRecords}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="q1">
          <Card>
            <CardContent className="text-sm text-muted-foreground">
              {common('mockAction')}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="q3">
          <Card>
            <CardContent className="text-sm text-muted-foreground">
              {common('mockAction')}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function AttendancePage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Attendance');
  const mockAction = useMockAction();
  const columns: readonly DataTableColumn<Student>[] = [
    {
      cell: (student) => (
        <div className="flex items-center gap-2">
          <Avatar className="size-7">
            <AvatarFallback className="text-[10px]">{getInitials(student.name)}</AvatarFallback>
          </Avatar>
          <span className="whitespace-nowrap font-semibold">{student.name}</span>
        </div>
      ),
      header: common('student'),
      id: 'student',
    },
    {
      cell: (student) => (
        <span className="font-mono text-xs text-muted-foreground">{student.id}</span>
      ),
      header: 'ID',
      id: 'id',
    },
    {
      cell: (student) => (
        <StatusPill
          status={
            student.attendance >= 90 ? 'present' : student.attendance >= 87 ? 'late' : 'absent'
          }
        />
      ),
      header: common('status'),
      id: 'status',
    },
    {
      cell: (student) => <span className="font-mono">{student.attendance}%</span>,
      header: nav('attendance'),
      id: 'rate',
    },
    { cell: () => <RowActions />, header: common('actions'), id: 'actions' },
  ];
  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <Button onClick={() => mockAction(translate('export'))} size="sm" variant="outline">
            <Download />
            {translate('export')}
          </Button>
        }
        description={translate('description')}
        eyebrow={nav('academic')}
        title={translate('title')}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard icon={UsersRound} label={translate('presentToday')} value="39 / 42" />
        <KpiCard icon={Clock3} label={translate('lateToday')} value="2" />
        <KpiCard icon={CalendarCheck} label={translate('weekly')} value="91,2 %" />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>{translate('weekly')}</CardTitle>
            <CardDescription>2026–2027</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-56 items-end gap-3 border-b border-border">
              {weeklyAttendance.map((value, index) => (
                <div className="flex h-full flex-1 items-end" key={value}>
                  <div
                    className="w-full rounded-t bg-primary"
                    style={{ height: `${value}%` }}
                    title={`${index + 1}: ${value}%`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{translate('sheet')}</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <DataTable
              caption={translate('caption')}
              columns={columns}
              getRowId={(row) => row.id}
              minWidth={700}
              rows={students.slice(0, 6)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
