'use client';

import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  KpiCard,
} from '@gestschool/ui';
import type { DataTableColumn } from '@gestschool/ui';
import { CalendarCheck, Clock3, Download, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { students, weeklyAttendance } from '../../mocks/data';
import type { Student } from '../../mocks/data';
import { getInitials } from '../shared/format';
import { useMockAction } from '../shared/mock-action';
import { PageHeader } from '../shared/page-header';
import { RowActions } from '../shared/row-actions';
import { StatusPill } from '../shared/status-pill';

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
