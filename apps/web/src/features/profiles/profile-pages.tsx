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
  Input,
  KpiCard,
  Label,
  StatusBadge,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@gestschool/ui';
import type { DataTableColumn } from '@gestschool/ui';
import {
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  GraduationCap,
  KeyRound,
  Laptop,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Save,
  Smartphone,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Link } from '../../i18n/navigation';
import type { AppLocale } from '../../i18n/routing';
import { gradeRecords, invoices } from '../../mocks/data';
import type { GradeRecord, Invoice } from '../../mocks/data';
import { formatCurrency } from '../shared/format';
import { useMockAction } from '../shared/mock-action';
import { PageHeader } from '../shared/page-header';
import { ProgressBar } from '../shared/progress-bar';
import { StatusPill } from '../shared/status-pill';

function ProfileFact({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="mt-0.5 block break-words text-sm font-medium">{value}</span>
      </span>
    </div>
  );
}

export function StudentProfilePage() {
  const common = useTranslations('Common');
  const translate = useTranslations('StudentProfile');
  const grades = useTranslations('Grades');
  const statusText = useTranslations('Status');
  const locale = useLocale() as AppLocale;
  const mockAction = useMockAction();
  const gradeColumns: readonly DataTableColumn<GradeRecord>[] = [
    {
      cell: (row) => <span className="font-semibold">{row.name}</span>,
      header: common('student'),
      id: 'student',
    },
    {
      cell: (row) => <span className="font-mono">{row.mathematics.toFixed(1)}/20</span>,
      header: grades('mathematics'),
      id: 'mathematics',
    },
    {
      cell: (row) => <span className="font-mono">{row.physics.toFixed(1)}/20</span>,
      header: grades('physics'),
      id: 'physics',
    },
    {
      cell: (row) => <span className="font-mono font-bold">#{row.rank}</span>,
      header: grades('rank'),
      id: 'rank',
    },
  ];
  const invoiceColumns: readonly DataTableColumn<Invoice>[] = [
    {
      cell: (row) => <span className="font-mono text-xs font-semibold">{row.id}</span>,
      header: translate('invoice'),
      id: 'invoice',
    },
    {
      cell: (row) => (
        <span className="font-mono font-semibold">{formatCurrency(row.amount, locale)}</span>
      ),
      header: common('amount'),
      id: 'amount',
    },
    { cell: (row) => <span>{row.dueDate}</span>, header: translate('dueDate'), id: 'date' },
    { cell: (row) => <StatusPill status={row.status} />, header: common('status'), id: 'status' },
  ];

  return (
    <div className="page-shell">
      <Link
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
        href="/students"
      >
        <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
        {translate('back')}
      </Link>
      <Card className="overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500" />
        <CardContent className="relative p-5 pt-0 sm:p-6 sm:pt-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
              <Avatar className="-mt-10 size-20 border-4 border-card shadow-sm sm:size-24">
                <AvatarFallback className="bg-blue-100 text-xl text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  AD
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 sm:pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-bold tracking-tight">
                    {translate('title')}
                  </h1>
                  <StatusBadge dot tone="success">
                    {statusText('active')}
                  </StatusBadge>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {translate('description')}
                </p>
              </div>
            </div>
            <Button onClick={() => mockAction(common('edit'))} size="sm" variant="outline">
              <Pencil />
              {common('edit')}
            </Button>
          </div>
          <div className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2 xl:grid-cols-4">
            <ProfileFact icon={Mail} label={common('email')} value="aminata.diallo@eleve.ci" />
            <ProfileFact icon={Phone} label={common('phone')} value="+225 07 08 09 10 11" />
            <ProfileFact
              icon={CalendarCheck}
              label={translate('birthLabel')}
              value={translate('birth')}
            />
            <ProfileFact
              icon={MapPin}
              label={translate('address')}
              value="Cocody Riviera, Abidjan"
            />
          </div>
        </CardContent>
      </Card>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={GraduationCap} label={translate('class')} value="Terminale C" />
        <KpiCard
          change="+0,8"
          changeDirection="up"
          icon={CheckCircle2}
          label={grades('average')}
          value="16,5 / 20"
        />
        <KpiCard icon={CalendarCheck} label={translate('attendance')} value="96 %" />
        <KpiCard
          helper={translate('upToDate')}
          icon={CircleDollarSign}
          label={translate('payment')}
          value={formatCurrency(0, locale)}
        />
      </div>

      <Tabs className="mt-5" defaultValue="academic">
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList>
            <TabsTrigger value="academic">{translate('academic')}</TabsTrigger>
            <TabsTrigger value="enrollment">{translate('enrollment')}</TabsTrigger>
            <TabsTrigger value="finance">{translate('finance')}</TabsTrigger>
            <TabsTrigger value="attendance">{translate('attendance')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="academic">
          <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>{translate('grades')}</CardTitle>
                <CardDescription>{translate('gradesDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <DataTable
                  caption={translate('grades')}
                  columns={gradeColumns}
                  getRowId={(row) => row.id}
                  minWidth={560}
                  rows={gradeRecords.filter((record) => record.id === 'EL-2024-001')}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{translate('summary')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {[
                  [grades('mathematics'), 88],
                  [grades('physics'), 90],
                  [grades('science'), 83],
                  [grades('history'), 80],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <div className="mb-2 flex justify-between gap-3 text-xs">
                      <span>{label}</span>
                      <span className="font-mono font-bold">{value}%</span>
                    </div>
                    <ProgressBar label={String(label)} value={Number(value)} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="enrollment">
          <Card>
            <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <ProfileFact icon={GraduationCap} label={translate('schoolYear')} value="2026–2027" />
              <ProfileFact icon={UserRound} label={translate('guardian')} value="Mamadou Diallo" />
              <ProfileFact
                icon={CheckCircle2}
                label={common('status')}
                value={translate('recordComplete')}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="finance">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <DataTable
                caption={translate('finance')}
                columns={invoiceColumns}
                getRowId={(row) => row.id}
                minWidth={620}
                rows={invoices.slice(0, 2)}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="attendance">
          <Card>
            <CardHeader>
              <CardTitle>{translate('attendance')}</CardTitle>
              <CardDescription>{translate('attendanceDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <KpiCard icon={CheckCircle2} label={translate('present')} value="107" />
              <KpiCard icon={Clock3} label={translate('late')} value="3" />
              <KpiCard icon={CalendarCheck} label={translate('absent')} value="2" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FormField({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function PreferenceRow({ description, label }: { description: string; label: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-4 last:border-0">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <Switch aria-label={label} defaultChecked />
    </div>
  );
}

export function UserProfilePage() {
  const common = useTranslations('Common');
  const translate = useTranslations('Profile');
  const usersText = useTranslations('Users');
  const mockAction = useMockAction();

  return (
    <div className="page-shell">
      <PageHeader description={translate('description')} title={translate('title')} />
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit min-w-0">
          <CardContent className="flex flex-col items-center p-6 text-center">
            <Avatar className="size-24 ring-4 ring-primary/10">
              <AvatarFallback className="bg-blue-600 text-2xl text-white">AK</AvatarFallback>
            </Avatar>
            <h2 className="mt-4 text-lg font-bold">Amadou Kouyaté</h2>
            <p className="mt-1 text-sm text-muted-foreground">{usersText('admin')}</p>
            <Badge className="mt-3" variant="secondary">
              USR-001
            </Badge>
            <div className="mt-6 w-full space-y-4 border-t border-border pt-5 text-start">
              <ProfileFact
                icon={Mail}
                label={common('email')}
                value="amadou.kouyate@lyceevictor.ci"
              />
              <ProfileFact icon={Phone} label={common('phone')} value="+225 07 12 34 56 78" />
              <ProfileFact
                icon={MapPin}
                label={translate('location')}
                value="Abidjan, Côte d’Ivoire"
              />
            </div>
          </CardContent>
        </Card>

        <Tabs className="min-w-0" defaultValue="personal">
          <div className="max-w-full overflow-x-auto pb-1">
            <TabsList>
              <TabsTrigger value="personal">{translate('personal')}</TabsTrigger>
              <TabsTrigger value="security">{translate('security')}</TabsTrigger>
              <TabsTrigger value="notifications">{translate('notifications')}</TabsTrigger>
              <TabsTrigger value="activity">{translate('activity')}</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="personal">
            <Card>
              <CardHeader>
                <CardTitle>{translate('personal')}</CardTitle>
                <CardDescription>{translate('personalDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-5 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    mockAction(common('save'));
                  }}
                >
                  <FormField htmlFor="profile-first-name" label={translate('firstName')}>
                    <Input defaultValue="Amadou" id="profile-first-name" />
                  </FormField>
                  <FormField htmlFor="profile-last-name" label={translate('lastName')}>
                    <Input defaultValue="Kouyaté" id="profile-last-name" />
                  </FormField>
                  <FormField htmlFor="profile-email" label={common('email')}>
                    <Input
                      defaultValue="amadou.kouyate@lyceevictor.ci"
                      id="profile-email"
                      type="email"
                    />
                  </FormField>
                  <FormField htmlFor="profile-phone" label={common('phone')}>
                    <Input defaultValue="+225 07 12 34 56 78" id="profile-phone" type="tel" />
                  </FormField>
                  <div className="sm:col-span-2">
                    <Button type="submit">
                      <Save />
                      {common('save')}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>{translate('security')}</CardTitle>
                <CardDescription>{translate('securityDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                      <KeyRound className="size-4 text-primary" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{translate('password')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {translate('passwordChanged')}
                      </p>
                    </div>
                  </div>
                  <Button onClick={() => mockAction(translate('password'))} variant="outline">
                    {translate('changePassword')}
                  </Button>
                </div>
                <PreferenceRow
                  description={translate('twoFactorDescription')}
                  label={translate('twoFactor')}
                />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>{translate('notifications')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <PreferenceRow
                  description={translate('emailDescription')}
                  label={translate('emailNotifications')}
                />
                <PreferenceRow
                  description={translate('securityAlertDescription')}
                  label={translate('securityAlerts')}
                />
                <PreferenceRow
                  description={translate('digestDescription')}
                  label={translate('weeklyDigest')}
                />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>{translate('sessions')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Session
                  icon={Laptop}
                  location="Abidjan, Côte d’Ivoire"
                  name="Chrome · Linux"
                  status={translate('currentSession')}
                />
                <Session
                  icon={Smartphone}
                  location="Dakar, Sénégal"
                  name="Safari · iPhone"
                  status="02/09/2026 · 18:42"
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Session({
  icon: Icon,
  location,
  name,
  status,
}: {
  icon: LucideIcon;
  location: string;
  name: string;
  status: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">{location}</p>
      </div>
      <span className="text-end text-xs text-muted-foreground">{status}</span>
    </div>
  );
}
