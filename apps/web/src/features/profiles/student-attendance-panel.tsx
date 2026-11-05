'use client';

import { CardContent, EmptyState } from '@gestschool/ui';
import type { AttendanceHistoryView, AttendanceStatus } from '@gestschool/contracts';
import { CalendarCheck, CircleAlert, Clock3 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

type StudentAttendancePanelProps = {
  data: AttendanceHistoryView | undefined;
  loading: boolean;
  error: unknown;
  allowed: boolean;
};

const statusClass: Record<AttendanceStatus, string> = {
  PRESENT: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  ABSENT: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  LATE: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  EXCUSED: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
};

export function attendanceRate(data: AttendanceHistoryView | undefined): number | null {
  if (!data) return null;
  const total =
    data.summary.present + data.summary.absent + data.summary.late + data.summary.excused;
  if (!total) return null;
  return Math.round(((data.summary.present + data.summary.late) / total) * 100);
}

export function StudentAttendancePanel({
  data,
  loading,
  error,
  allowed,
}: StudentAttendancePanelProps) {
  const t = useTranslations('StudentProfile');
  const common = useTranslations('Common');
  const locale = useLocale();

  if (!allowed) {
    return (
      <CardContent className="p-5">
        <EmptyState
          icon={CalendarCheck}
          title={t('attendance')}
          description={t('attendanceUnavailable')}
        />
      </CardContent>
    );
  }

  if (loading) {
    return (
      <CardContent className="p-5">
        <p role="status" className="text-sm text-muted-foreground">
          {common('loading')}
        </p>
      </CardContent>
    );
  }

  if (error) {
    return (
      <CardContent className="p-5">
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{t('attendanceError')}</span>
        </div>
      </CardContent>
    );
  }

  if (!data || data.total === 0) {
    return (
      <CardContent className="p-5">
        <EmptyState icon={Clock3} title={t('attendance')} description={t('attendanceEmpty')} />
      </CardContent>
    );
  }

  const summary = [
    [t('present'), data.summary.present],
    [t('absent'), data.summary.absent],
    [t('late'), data.summary.late],
    [t('excused'), data.summary.excused],
  ] as const;

  return (
    <CardContent className="p-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{t('attendanceDate')}</th>
              <th className="px-4 py-3 font-medium">{t('attendanceClass')}</th>
              <th className="px-4 py-3 font-medium">{t('attendanceStatus')}</th>
              <th className="px-4 py-3 font-medium">{t('attendanceNote')}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((record) => (
              <tr key={record.id} className="border-t border-border">
                <td className="px-4 py-3">
                  {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                    new Date(`${record.date}T12:00:00`),
                  )}
                </td>
                <td className="px-4 py-3 font-medium">{record.className}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass[record.status]}`}
                  >
                    {t(`attendanceStatus${record.status}`)}
                  </span>
                </td>
                <td className="max-w-[360px] whitespace-normal px-4 py-3 text-muted-foreground">
                  {record.note || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardContent>
  );
}
