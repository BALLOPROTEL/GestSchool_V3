'use client';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  KpiCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@gestschool/ui';
import {
  ArrowLeft,
  CalendarCheck,
  Camera,
  CheckCircle2,
  CircleDollarSign,
  GraduationCap,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { StudentFinance } from '../finance/finance-page';
import { StudentResults } from '../grades/grades-page';
import { DocumentsPanel } from '../documents/documents-page';
import { useDocumentCopy } from '../documents/document-copy';
import { personId, type AttendanceHistoryView, type PersonView } from '@gestschool/contracts';
import { Link } from '../../i18n/navigation';
import { useAuth } from '../auth/auth-provider';
import {
  deletePrivateAvatar,
  uploadPrivateAvatar,
  usePrivateAvatar,
} from '../shared/avatar-client';
import { getInitials } from '../shared/format';
import { canRead, canWrite, PeopleError } from '../directory/people-client';
import { usePeopleData } from '../directory/people-hooks';
import { ErrorNotice, PersonEditor } from '../directory/person-editor';
import { PersonStatus } from '../directory/people-pages';
import { GuardianLinks } from '../directory/guardian-links';
import { StudentEnrollmentHistory } from '../enrollments/enrollment-page';
import { StudentAttendancePanel, attendanceRate } from './student-attendance-panel';

export function StudentProfilePage() {
  const common = useTranslations('Common');
  const documents = useDocumentCopy();
  const t = useTranslations('People');
  const profile = useTranslations('StudentProfile');
  const grades = useTranslations('Grades');
  const { session } = useAuth();
  const parameters = useParams<{ studentId: string }>();
  const valid = personId.safeParse(parameters.studentId);
  const allowed = canRead(session?.session, 'students');
  const attendanceAllowed = Boolean(
    session?.session.grants.some(
      (grant) =>
        grant.permission === 'attendance.read' &&
        grant.scope !== 'NONE' &&
        (grant.scope !== 'PLATFORM' || session.session.roles.includes('SUPER_ADMIN')),
    ),
  );
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarPath = allowed && valid.success ? `/api/v1/students/${valid.data}/avatar` : null;
  const avatarUrl = usePrivateAvatar(avatarPath, valid.success ? valid.data : null);
  const result = usePeopleData<PersonView>(
    allowed && valid.success ? `students/${valid.data}` : null,
    revision,
  );
  const attendance = usePeopleData<AttendanceHistoryView>(
    allowed && attendanceAllowed && valid.success
      ? `attendance/history?studentId=${encodeURIComponent(valid.data)}&pageSize=100`
      : null,
    revision,
  );
  const person = result.data;
  const attendancePercentage = attendanceRate(attendance.data);
  async function changeAvatar(file: File | undefined) {
    if (!file || !avatarPath) return;
    setAvatarBusy(true);
    try {
      await uploadPrivateAvatar(avatarPath, file);
      toast.success(profile('photoSaved'));
    } catch {
      toast.error(profile('photoError'));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    if (!avatarPath) return;
    setAvatarBusy(true);
    try {
      await deletePrivateAvatar(avatarPath);
      toast.success(profile('photoDeleted'));
    } catch {
      toast.error(profile('photoError'));
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <div className="page-shell" data-people-ready={!result.loading}>
      <Link
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
        href="/students"
      >
        <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
        {profile('back')}
      </Link>
      {!person ? (
        <>
          <h1 className="mb-4 text-2xl font-bold">{t('studentProfile')}</h1>
          {!allowed ? (
            <p role="status">{t('forbidden')}</p>
          ) : !valid.success ? (
            <ErrorNotice error={new PeopleError('PERSON_NOT_FOUND')} />
          ) : result.error ? (
            <ErrorNotice error={result.error} />
          ) : (
            <p role="status">{t('loading')}</p>
          )}
        </>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500" />
            <CardContent className="relative p-5 pt-0 sm:p-6 sm:pt-0">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
                  <Avatar className="-mt-10 size-20 border-4 border-card shadow-sm sm:size-24">
                    {avatarUrl ? (
                      <AvatarImage
                        alt={profile('photoAlt', {
                          name: `${person.firstName} ${person.lastName}`,
                        })}
                        src={avatarUrl}
                      />
                    ) : null}
                    <AvatarFallback className="bg-blue-100 text-xl text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      {getInitials(`${person.firstName} ${person.lastName}`)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 sm:pb-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="break-words text-2xl font-bold tracking-tight">
                        {person.firstName} {person.lastName}
                      </h1>
                      <PersonStatus person={person} />
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {person.matricule}
                    </p>
                  </div>
                </div>
                {canWrite(session?.session, 'students', 'update') &&
                person.status !== 'ARCHIVED' ? (
                  <div className="flex flex-wrap gap-2">
                    <input
                      accept="image/jpeg,image/png"
                      aria-label={profile('photoInput')}
                      className="sr-only"
                      disabled={avatarBusy}
                      id="student-avatar-input"
                      onChange={(event) => {
                        void changeAvatar(event.currentTarget.files?.[0]);
                        event.currentTarget.value = '';
                      }}
                      type="file"
                    />
                    <Button
                      disabled={avatarBusy}
                      onClick={() => document.getElementById('student-avatar-input')?.click()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Camera />
                      {avatarUrl ? profile('changePhoto') : profile('addPhoto')}
                    </Button>
                    {avatarUrl ? (
                      <Button
                        disabled={avatarBusy}
                        onClick={() => void removeAvatar()}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 />
                        {profile('removePhoto')}
                      </Button>
                    ) : null}
                    <Button
                      data-person-focus
                      onClick={() => setEditing(true)}
                      size="sm"
                      variant="outline"
                    >
                      <Pencil />
                      {common('edit')}
                    </Button>
                  </div>
                ) : null}
              </div>
              <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  [t('firstName'), person.firstName],
                  [t('lastName'), person.lastName],
                  [t('birthDate'), person.birthDate ?? '—'],
                  [common('status'), t(person.status)],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-0.5 break-words text-sm font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <div className="mt-5">
            <GuardianLinks person={person} side="student" />
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={GraduationCap}
              label={profile('class')}
              value="—"
              helper={t('laterLot')}
            />
            <KpiCard
              icon={CheckCircle2}
              label={grades('average')}
              value="—"
              helper={t('laterLot')}
            />
            <KpiCard
              icon={CalendarCheck}
              label={profile('attendance')}
              value={
                attendance.loading
                  ? '…'
                  : attendancePercentage == null
                    ? '—'
                    : `${attendancePercentage}%`
              }
              helper={
                attendance.data
                  ? profile('attendanceBreakdown', {
                      present: attendance.data.summary.present,
                      absent: attendance.data.summary.absent,
                      late: attendance.data.summary.late,
                      excused: attendance.data.summary.excused,
                    })
                  : profile('attendanceDescription')
              }
            />
            <KpiCard
              icon={CircleDollarSign}
              label={profile('payment')}
              value="—"
              helper={t('laterLot')}
            />
          </div>
          <Tabs className="mt-5" defaultValue="academic">
            <div className="max-w-full overflow-x-auto pb-1">
              <TabsList>
                {(['academic', 'enrollment', 'finance', 'attendance'] as const).map((tab) => (
                  <TabsTrigger key={tab} value={tab}>
                    {profile(tab)}
                  </TabsTrigger>
                ))}
                <TabsTrigger value="documents">{documents.title}</TabsTrigger>
              </TabsList>
            </div>
            {(['academic', 'enrollment', 'finance', 'attendance'] as const).map((tab) => (
              <TabsContent key={tab} value={tab}>
                <Card>
                  {tab === 'academic' ? (
                    <StudentResults studentId={person.id} />
                  ) : tab === 'enrollment' ? (
                    <StudentEnrollmentHistory studentId={person.id} />
                  ) : tab === 'finance' ? (
                    <StudentFinance studentId={person.id} />
                  ) : (
                    <StudentAttendancePanel
                      data={attendance.data}
                      loading={attendance.loading}
                      error={attendance.error}
                      allowed={attendanceAllowed}
                    />
                  )}
                </Card>
              </TabsContent>
            ))}
            <TabsContent value="documents">
              <DocumentsPanel studentId={person.id} />
            </TabsContent>
          </Tabs>
          {editing ? (
            <PersonEditor
              kind="students"
              person={person}
              close={() => setEditing(false)}
              saved={() => {
                setEditing(false);
                setRevision((value) => value + 1);
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
