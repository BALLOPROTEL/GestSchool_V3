'use client';
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  EmptyState,
  KpiCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@gestschool/ui';
import {
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  CircleDollarSign,
  GraduationCap,
  Pencil,
  Clock3,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { personId, type PersonView } from '@gestschool/contracts';
import { Link } from '../../i18n/navigation';
import { useAuth } from '../auth/auth-provider';
import { getInitials } from '../shared/format';
import { canRead, canWrite, PeopleError } from '../directory/people-client';
import { usePeopleData } from '../directory/people-hooks';
import { ErrorNotice, PersonEditor } from '../directory/person-editor';
import { PersonStatus } from '../directory/people-pages';
import { GuardianLinks } from '../directory/guardian-links';

export function StudentProfilePage() {
  const common = useTranslations('Common');
  const t = useTranslations('People');
  const profile = useTranslations('StudentProfile');
  const grades = useTranslations('Grades');
  const { session } = useAuth();
  const parameters = useParams<{ studentId: string }>();
  const valid = personId.safeParse(parameters.studentId);
  const allowed = canRead(session?.session, 'students');
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const result = usePeopleData<PersonView>(
    allowed && valid.success ? `students/${valid.data}` : null,
    revision,
  );
  const person = result.data;
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
                  <Button
                    data-person-focus
                    onClick={() => setEditing(true)}
                    size="sm"
                    variant="outline"
                  >
                    <Pencil />
                    {common('edit')}
                  </Button>
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
              value="—"
              helper={t('laterLot')}
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
              </TabsList>
            </div>
            {(['academic', 'enrollment', 'finance', 'attendance'] as const).map((tab) => (
              <TabsContent key={tab} value={tab}>
                <Card>
                  <EmptyState icon={Clock3} title={profile(tab)} description={t('laterLot')} />
                </Card>
              </TabsContent>
            ))}
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
