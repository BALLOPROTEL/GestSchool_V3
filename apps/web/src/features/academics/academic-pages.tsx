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
  Input,
  KpiCard,
  Select,
  SelectItem,
} from '@gestschool/ui';
import type {
  AttendanceSheetStudent,
  AttendanceSheetView,
  AttendanceStatus,
  SessionView,
} from '@gestschool/contracts';
import type { DataTableColumn } from '@gestschool/ui';
import {
  CalendarCheck,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Save,
  UsersRound,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../auth/auth-provider';
import { AcademicPicker } from './academic-components';
import { peopleRequest, PeopleError } from '../directory/people-client';
import { usePeopleData } from '../directory/people-hooks';
import { getInitials } from '../shared/format';
import { PageHeader } from '../shared/page-header';

type DraftRow = { status: AttendanceStatus | ''; note: string };

function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function canAttendance(session: SessionView | undefined, action: 'read' | 'write') {
  return Boolean(
    session?.grants.some(
      (grant) =>
        grant.permission === `attendance.${action}` &&
        grant.scope !== 'NONE' &&
        (grant.scope !== 'PLATFORM' || session.roles.includes('SUPER_ADMIN')),
    ),
  );
}

export function AttendancePage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Attendance');
  const { session } = useAuth();
  const canRead = canAttendance(session?.session, 'read');
  const canWrite = canAttendance(session?.session, 'write');
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(localToday);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const path =
    canRead && classId
      ? `attendance/sheet?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}`
      : null;
  const result = usePeopleData<AttendanceSheetView>(path, revision);
  const [draft, setDraft] = useState<Record<string, DraftRow>>({});

  useEffect(() => {
    if (!result.data) {
      setDraft({});
      return;
    }
    setDraft(
      Object.fromEntries(
        result.data.students.map((student) => [
          student.studentId,
          { status: student.status ?? '', note: student.note ?? '' },
        ]),
      ),
    );
  }, [result.data]);

  const summary = useMemo(() => {
    const rows = result.data?.students ?? [];
    const statuses = rows.map((row) => draft[row.studentId]?.status ?? row.status ?? '');
    const count = (status: AttendanceStatus) => statuses.filter((value) => value === status).length;
    return {
      total: rows.length,
      unmarked: statuses.filter((value) => !value).length,
      present: count('PRESENT'),
      absent: count('ABSENT'),
      late: count('LATE'),
      excused: count('EXCUSED'),
    };
  }, [draft, result.data]);

  const columns: readonly DataTableColumn<AttendanceSheetStudent>[] = [
    {
      id: 'student',
      header: common('student'),
      cell: (student) => (
        <div className="flex items-center gap-2">
          <Avatar className="size-8">
            <AvatarFallback className="text-[10px]">{getInitials(student.studentName)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="whitespace-nowrap font-semibold">{student.studentName}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{student.matricule}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'status',
      header: common('status'),
      cell: (student) => (
        <Select
          aria-label={translate('statusFor', { student: student.studentName })}
          value={draft[student.studentId]?.status ?? ''}
          disabled={!canWrite || saving}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              [student.studentId]: {
                status: event.target.value as AttendanceStatus | '',
                note: current[student.studentId]?.note ?? '',
              },
            }))
          }
        >
          <SelectItem value="">{translate('UNMARKED')}</SelectItem>
          <SelectItem value="PRESENT">{translate('PRESENT')}</SelectItem>
          <SelectItem value="ABSENT">{translate('ABSENT')}</SelectItem>
          <SelectItem value="LATE">{translate('LATE')}</SelectItem>
          <SelectItem value="EXCUSED">{translate('EXCUSED')}</SelectItem>
        </Select>
      ),
    },
    {
      id: 'note',
      header: translate('note'),
      cell: (student) => (
        <Input
          aria-label={translate('noteFor', { student: student.studentName })}
          value={draft[student.studentId]?.note ?? ''}
          disabled={!canWrite || saving}
          maxLength={500}
          placeholder={translate('notePlaceholder')}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              [student.studentId]: {
                status: current[student.studentId]?.status ?? '',
                note: event.target.value,
              },
            }))
          }
        />
      ),
    },
  ];

  async function save() {
    if (!result.data || !canWrite) return;
    const entries = result.data.students
      .map((student) => ({
        studentId: student.studentId,
        status: draft[student.studentId]?.status ?? '',
        note: draft[student.studentId]?.note.trim() || null,
      }))
      .filter(
        (entry): entry is { studentId: string; status: AttendanceStatus; note: string | null } =>
          entry.status !== '',
      );
    if (!entries.length) {
      toast.error(translate('nothingToSave'));
      return;
    }
    setSaving(true);
    try {
      await peopleRequest<AttendanceSheetView>(
        'attendance/sheet',
        { classId, date, entries },
        'PUT',
      );
      setRevision((value) => value + 1);
      toast.success(translate('saved'));
    } catch (error: unknown) {
      toast.error(error instanceof PeopleError ? translate('saveError') : translate('saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-shell" data-attendance-ready={!result.loading}>
      <PageHeader
        actions={
          canWrite && result.data ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() =>
                  setDraft((current) =>
                    Object.fromEntries(
                      result.data?.students.map((student) => [
                        student.studentId,
                        {
                          status: 'PRESENT',
                          note: current[student.studentId]?.note ?? '',
                        },
                      ]) ?? [],
                    ),
                  )
                }
              >
                <CheckCircle2 />
                {translate('markAllPresent')}
              </Button>
              <Button size="sm" disabled={saving} onClick={() => void save()}>
                <Save />
                {saving ? translate('saving') : common('save')}
              </Button>
            </div>
          ) : undefined
        }
        description={translate('description')}
        eyebrow={nav('academic')}
        title={translate('title')}
      />

      {!canRead ? (
        <p role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
          {translate('forbidden')}
        </p>
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-4 p-4 md:grid-cols-2">
              <AcademicPicker
                label={common('class')}
                path="classes?status=ACTIVE"
                value={classId}
                onChange={setClassId}
                required
              />
              <label className="space-y-1 text-sm">
                <span className="font-medium">{common('date')}</span>
                <Input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
            </CardContent>
          </Card>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard icon={UsersRound} label={translate('total')} value={String(summary.total)} />
            <KpiCard icon={CheckCircle2} label={translate('presentToday')} value={String(summary.present)} />
            <KpiCard icon={CircleAlert} label={translate('absentToday')} value={String(summary.absent)} />
            <KpiCard icon={Clock3} label={translate('lateToday')} value={String(summary.late)} />
            <KpiCard icon={CalendarCheck} label={translate('unmarked')} value={String(summary.unmarked)} />
          </div>

          {result.loading ? (
            <p role="status" className="mt-5 text-sm text-muted-foreground">
              {common('loading')}
            </p>
          ) : null}
          {result.error ? (
            <p role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {translate('loadError')}
              {result.error instanceof PeopleError && result.error.requestId ? (
                <span className="mt-1 block break-all font-mono text-[11px]">
                  {result.error.requestId}
                </span>
              ) : null}
            </p>
          ) : null}
          {!classId ? (
            <p className="mt-5 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {translate('chooseClass')}
            </p>
          ) : null}

          {result.data ? (
            <Card className="mt-5 overflow-hidden">
              <CardHeader>
                <CardTitle>
                  {translate('sheetFor', {
                    class: result.data.className,
                    date: result.data.date,
                  })}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <DataTable
                  caption={translate('caption')}
                  columns={columns}
                  getRowId={(row) => row.studentId}
                  minWidth={860}
                  rows={result.data.students}
                  emptyState={
                    <p className="p-8 text-center text-muted-foreground">{translate('empty')}</p>
                  }
                />
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
