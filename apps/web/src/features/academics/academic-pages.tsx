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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  KpiCard,
  Select,
  SelectItem,
} from '@gestschool/ui';
import type {
  AttendanceHistoryView,
  AttendanceRecordView,
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
  Download,
  Save,
  UsersRound,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../auth/auth-provider';
import { AcademicPicker } from './academic-components';
import { peopleRequest, PeopleError } from '../directory/people-client';
import { downloadAttendance } from '../attendance/attendance-client';
import {
  attendanceDraftFromSheet,
  attendancePendingEntries,
  attendanceSheetAfterCommittedBatch,
  type AttendanceDraft,
} from '../attendance/attendance-state';
import { usePeopleData } from '../directory/people-hooks';
import { getInitials } from '../shared/format';
import { PageHeader } from '../shared/page-header';

type AttendanceDiscardAction =
  | { kind: 'class'; value: string }
  | { kind: 'date'; value: string }
  | { kind: 'navigation'; value: string }
  | { kind: 'history'; value: number };

function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function canAttendance(session: SessionView | undefined, action: 'read' | 'write' | 'export') {
  return Boolean(
    session?.grants.some(
      (grant) =>
        grant.permission === `attendance.${action}` &&
        grant.scope !== 'NONE' &&
        (grant.scope !== 'PLATFORM' || session.roles.includes('SUPER_ADMIN')),
    ),
  );
}

function canAttendanceSheet(session: SessionView | undefined) {
  return Boolean(
    session?.grants.some(
      (grant) =>
        grant.permission === 'attendance.read' && ['TENANT', 'ASSIGNED'].includes(grant.scope),
    ) ||
    (session?.roles.includes('SUPER_ADMIN') &&
      session.grants.some(
        (grant) => grant.permission === 'attendance.read' && grant.scope === 'PLATFORM',
      )),
  );
}

export function AttendancePage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Attendance');
  const locale = useLocale() as 'fr' | 'en' | 'ar';
  const { session } = useAuth();
  const canRead = canAttendance(session?.session, 'read');
  const canUseSheet = canAttendanceSheet(session?.session);
  const canWrite = canAttendance(session?.session, 'write');
  const canExport = canAttendance(session?.session, 'export');
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(localToday);
  const [saving, setSaving] = useState(false);
  const [pendingDiscard, setPendingDiscard] = useState<AttendanceDiscardAction | null>(null);
  const bypassBeforeUnload = useRef(false);
  const path =
    canUseSheet && classId
      ? `attendance/sheet?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}`
      : null;
  const result = usePeopleData<AttendanceSheetView>(path);
  const [sheet, setSheet] = useState<AttendanceSheetView>();
  const [draft, setDraft] = useState<AttendanceDraft>({});

  useEffect(() => {
    if (result.data) {
      setSheet(result.data);
      setDraft(attendanceDraftFromSheet(result.data));
    } else if (!result.loading) {
      setSheet(undefined);
      setDraft({});
    }
  }, [result.data, result.loading]);

  useEffect(() => {
    setSheet(undefined);
    setDraft({});
  }, [path]);

  const pendingEntries = useMemo(
    () => (sheet ? attendancePendingEntries(sheet, draft) : []),
    [draft, sheet],
  );
  const dirty = pendingEntries.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const marker = `attendance-${Date.now()}-${Math.random()}`;
    const guardState = {
      ...window.history.state,
      gestschoolAttendanceGuard: marker,
    };
    window.history.pushState(guardState, '', window.location.href);

    const guardHistory = () => {
      if (bypassBeforeUnload.current) return;
      window.history.pushState(guardState, '', window.location.href);
      setPendingDiscard({ kind: 'history', value: -2 });
    };

    window.addEventListener('popstate', guardHistory);
    return () => {
      window.removeEventListener('popstate', guardHistory);
      if (
        !bypassBeforeUnload.current &&
        window.history.state?.gestschoolAttendanceGuard === marker
      ) {
        bypassBeforeUnload.current = true;
        window.history.back();
        window.setTimeout(() => {
          bypassBeforeUnload.current = false;
        }, 0);
      }
    };
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (bypassBeforeUnload.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const guardLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!target || target.hasAttribute('download') || target.getAttribute('target') === '_blank')
        return;
      const href = target.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      const destination = new URL((target as HTMLAnchorElement).href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (
        `${destination.pathname}${destination.search}` ===
        `${window.location.pathname}${window.location.search}`
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setPendingDiscard({ kind: 'navigation', value: destination.href });
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', guardLink, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', guardLink, true);
    };
  }, [dirty, translate]);

  const summary = useMemo(() => {
    const rows = sheet?.students ?? [];
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
  }, [draft, sheet]);

  const columns: readonly DataTableColumn<AttendanceSheetStudent>[] = [
    {
      id: 'student',
      header: common('student'),
      cell: (student) => (
        <div className="flex items-center gap-2">
          <Avatar className="size-8">
            <AvatarFallback className="text-[10px]">
              {getInitials(student.studentName)}
            </AvatarFallback>
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
          disabled={!canWrite || saving || (draft[student.studentId]?.status ?? '') === ''}
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

  function applyDiscardAction(action: AttendanceDiscardAction) {
    if (action.kind === 'class') {
      setClassId(action.value);
      return;
    }
    if (action.kind === 'date') {
      setDate(action.value);
      return;
    }
    bypassBeforeUnload.current = true;
    if (action.kind === 'history') {
      if (window.history.length <= 2) {
        bypassBeforeUnload.current = false;
        return;
      }
      window.history.go(action.value);
      window.setTimeout(() => {
        bypassBeforeUnload.current = false;
      }, 1_000);
      return;
    }
    window.location.assign(action.value);
  }

  function requestDiscard(action: AttendanceDiscardAction) {
    if (!dirty) {
      applyDiscardAction(action);
      return;
    }
    setPendingDiscard(action);
  }

  function confirmDiscardChanges() {
    if (!pendingDiscard) return;
    const action = pendingDiscard;
    setPendingDiscard(null);
    applyDiscardAction(action);
  }

  function changeClass(value: string) {
    if (saving || value === classId) return;
    requestDiscard({ kind: 'class', value });
  }

  function changeDate(value: string) {
    if (saving || value === date) return;
    requestDiscard({ kind: 'date', value });
  }

  async function save() {
    if (!sheet || !canWrite || !pendingEntries.length) return;
    setSaving(true);
    try {
      let saved = sheet;
      for (let index = 0; index < pendingEntries.length; index += 500) {
        const batch = pendingEntries.slice(index, index + 500);
        const response = await peopleRequest<AttendanceSheetView>(
          'attendance/sheet',
          { classId, date, entries: batch },
          'PUT',
        );
        saved = attendanceSheetAfterCommittedBatch(
          saved,
          response,
          batch.map((entry) => entry.studentId),
        );
        setSheet(saved);
      }
      setDraft(attendanceDraftFromSheet(saved));
      toast.success(translate('saved'));
    } catch (error) {
      toast.error(
        error instanceof PeopleError && error.code === 'ATTENDANCE_CONCURRENT_UPDATE'
          ? translate('concurrentUpdate')
          : translate('saveError'),
      );
    } finally {
      setSaving(false);
    }
  }

  const actions =
    sheet && (canWrite || canExport) ? (
      <div className="flex flex-wrap gap-2">
        {canWrite ? (
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() =>
              setDraft((current) =>
                Object.fromEntries(
                  sheet.students.map((student) => [
                    student.studentId,
                    {
                      status: 'PRESENT',
                      note: current[student.studentId]?.note ?? '',
                    },
                  ]),
                ),
              )
            }
          >
            <CheckCircle2 />
            {translate('markAllPresent')}
          </Button>
        ) : null}
        {canExport ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={saving || !classId || dirty}
              onClick={() =>
                void downloadAttendance(classId, date, 'csv', locale).catch(() =>
                  toast.error(translate('exportError')),
                )
              }
            >
              <Download />
              {translate('exportCsv')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={saving || !classId || dirty}
              onClick={() =>
                void downloadAttendance(classId, date, 'pdf', locale).catch(() =>
                  toast.error(translate('exportError')),
                )
              }
            >
              <Download />
              {translate('exportPdf')}
            </Button>
          </>
        ) : null}
        {canWrite ? (
          <Button size="sm" disabled={saving || !dirty} onClick={() => void save()}>
            <Save />
            {saving ? translate('saving') : translate('saveSheet')}
          </Button>
        ) : null}
      </div>
    ) : undefined;

  return (
    <div
      className="page-shell"
      data-attendance-ready={!result.loading}
      data-attendance-dirty={dirty}
    >
      <PageHeader
        actions={actions}
        description={translate('description')}
        eyebrow={nav('academic')}
        title={translate('title')}
      />

      <Dialog
        open={pendingDiscard !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDiscard(null);
        }}
      >
        <DialogContent closeLabel={common('close')}>
          <DialogHeader>
            <DialogTitle>{translate('discardChangesTitle')}</DialogTitle>
            <DialogDescription>{translate('discardChangesDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDiscard(null)}>
              {common('cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDiscardChanges}>
              {translate('discardChangesAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!canRead ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
        >
          {translate('forbidden')}
        </p>
      ) : !canUseSheet ? (
        <ScopedAttendanceHistory />
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-4 p-4 md:grid-cols-2">
              <AcademicPicker
                label={common('class')}
                path="classes?status=ACTIVE"
                value={classId}
                onChange={changeClass}
                disabled={saving}
                required
              />
              <label className="space-y-1 text-sm">
                <span className="font-medium">{common('date')}</span>
                <Input
                  type="date"
                  value={date}
                  disabled={saving}
                  onChange={(event) => changeDate(event.target.value)}
                />
              </label>
            </CardContent>
          </Card>

          {canWrite && sheet ? (
            <p
              role="status"
              className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                dirty
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100'
                  : 'border-border bg-muted/30 text-muted-foreground'
              }`}
            >
              {dirty ? translate('unsavedChanges') : translate('allSaved')}
            </p>
          ) : null}

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard icon={UsersRound} label={translate('total')} value={String(summary.total)} />
            <KpiCard
              icon={CheckCircle2}
              label={translate('presentToday')}
              value={String(summary.present)}
            />
            <KpiCard
              icon={CircleAlert}
              label={translate('absentToday')}
              value={String(summary.absent)}
            />
            <KpiCard icon={Clock3} label={translate('lateToday')} value={String(summary.late)} />
            <KpiCard
              icon={CalendarCheck}
              label={translate('unmarked')}
              value={String(summary.unmarked)}
            />
          </div>

          {result.loading ? (
            <p role="status" className="mt-5 text-sm text-muted-foreground">
              {common('loading')}
            </p>
          ) : null}
          {result.error ? (
            <p
              role="alert"
              className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
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

          {sheet ? (
            <Card className="mt-5 overflow-hidden">
              <CardHeader>
                <CardTitle>
                  {translate('sheetFor', {
                    class: sheet.className,
                    date: sheet.date,
                  })}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <DataTable
                  caption={translate('caption')}
                  columns={columns}
                  getRowId={(row) => row.studentId}
                  minWidth={860}
                  rows={sheet.students}
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

function ScopedAttendanceHistory() {
  const common = useTranslations('Common');
  const translate = useTranslations('Attendance');
  const [studentId, setStudentId] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const history = usePeopleData<AttendanceHistoryView>(
    studentId
      ? `attendance/history?studentId=${encodeURIComponent(studentId)}&page=${page}&pageSize=${pageSize}`
      : null,
  );
  const pages = history.data ? Math.max(1, Math.ceil(history.data.total / pageSize)) : 1;
  const columns: readonly DataTableColumn<AttendanceRecordView>[] = [
    { id: 'date', header: common('date'), cell: (row) => row.date },
    { id: 'class', header: common('class'), cell: (row) => row.className },
    {
      id: 'status',
      header: common('status'),
      cell: (row) => translate(row.status),
    },
    {
      id: 'note',
      header: translate('note'),
      cell: (row) => row.note || '—',
    },
  ];
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-4">
          <AcademicPicker
            label={common('student')}
            path="students?status=ALL"
            value={studentId}
            onChange={(value) => {
              setStudentId(value);
              setPage(1);
            }}
            required
          />
        </CardContent>
      </Card>
      {!studentId ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {translate('chooseStudent')}
        </p>
      ) : null}
      {history.loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          {common('loading')}
        </p>
      ) : null}
      {history.error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {translate('historyError')}
        </p>
      ) : null}
      {history.data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={CheckCircle2}
              label={translate('presentToday')}
              value={String(history.data.summary.present)}
            />
            <KpiCard
              icon={CircleAlert}
              label={translate('absentToday')}
              value={String(history.data.summary.absent)}
            />
            <KpiCard
              icon={Clock3}
              label={translate('lateToday')}
              value={String(history.data.summary.late)}
            />
            <KpiCard
              icon={CalendarCheck}
              label={translate('excused')}
              value={String(history.data.summary.excused)}
            />
          </div>
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>{translate('history')}</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <DataTable
                caption={translate('history')}
                columns={columns}
                getRowId={(row) => row.id}
                minWidth={720}
                rows={history.data.items}
                emptyState={
                  <p className="p-8 text-center text-muted-foreground">
                    {translate('historyEmpty')}
                  </p>
                }
              />
              <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  {common('previous')}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {translate('historyPage', { page, pages })}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= pages}
                  onClick={() => setPage((value) => Math.min(pages, value + 1))}
                >
                  {common('next')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
