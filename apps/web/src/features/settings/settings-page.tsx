'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FileUpload,
  Input,
  Label,
  Select,
  SelectItem,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@gestschool/ui';
import { Bell, Building2, CalendarDays, CreditCard, Save, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FormEvent, ReactNode } from 'react';

import { useMockAction } from '../shared/mock-action';
import { PageHeader } from '../shared/page-header';

function Field({
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

function SettingsCard({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="size-4 text-primary" />
          </span>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ToggleSetting({
  description,
  label,
  on = true,
}: {
  description: string;
  label: string;
  on?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-4 last:border-0">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch aria-label={label} defaultChecked={on} />
    </div>
  );
}

export function SettingsPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Settings');
  const design = useTranslations('DesignSystem');
  const usersText = useTranslations('Users');
  const mockAction = useMockAction();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mockAction(translate('save'));
  };

  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <Button form="settings-form" type="submit">
            <Save />
            {translate('save')}
          </Button>
        }
        description={translate('description')}
        eyebrow={nav('system')}
        title={translate('title')}
      />
      <form id="settings-form" onSubmit={submit}>
        <Tabs defaultValue="school">
          <div className="max-w-full overflow-x-auto pb-1">
            <TabsList>
              <TabsTrigger value="school">{translate('school')}</TabsTrigger>
              <TabsTrigger value="academic">{translate('academic')}</TabsTrigger>
              <TabsTrigger value="users">{translate('users')}</TabsTrigger>
              <TabsTrigger value="notifications">{translate('notifications')}</TabsTrigger>
              <TabsTrigger value="billing">{translate('billing')}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent className="space-y-5" value="school">
            <SettingsCard
              description={translate('informationDescription')}
              icon={Building2}
              title={translate('information')}
            >
              <div className="grid gap-5 md:grid-cols-2">
                <Field htmlFor="school-name" label={translate('name')}>
                  <Input defaultValue="Lycée Moderne Victor Hugo" id="school-name" />
                </Field>
                <Field htmlFor="school-code" label={translate('code')}>
                  <Input defaultValue="LMVH-CI-0042" id="school-code" />
                </Field>
                <Field htmlFor="school-email" label={common('email')}>
                  <Input defaultValue="direction@lyceevictor.ci" id="school-email" type="email" />
                </Field>
                <Field htmlFor="school-phone" label={common('phone')}>
                  <Input defaultValue="+225 27 22 44 00 11" id="school-phone" type="tel" />
                </Field>
                <div className="md:col-span-2">
                  <Field htmlFor="school-address" label={translate('address')}>
                    <Textarea
                      defaultValue="Boulevard Latrille, Cocody — Abidjan, Côte d’Ivoire"
                      id="school-address"
                    />
                  </Field>
                </div>
              </div>
            </SettingsCard>
            <SettingsCard
              description={translate('brandingDescription')}
              icon={Building2}
              title={translate('branding')}
            >
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
                <FileUpload
                  labels={{
                    browse: common('browse'),
                    clear: common('clear'),
                    drop: design('uploadDrop'),
                    hint: design('uploadHint'),
                  }}
                />
                <div className="rounded-xl border border-border bg-muted/40 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {translate('primaryColor')}
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="size-10 rounded-lg bg-blue-700 shadow-sm" />
                    <Input
                      aria-label={translate('primaryColor')}
                      className="font-mono"
                      defaultValue="#1D4ED8"
                    />
                  </div>
                </div>
              </div>
            </SettingsCard>
          </TabsContent>

          <TabsContent value="academic">
            <SettingsCard
              description={translate('academicDescription')}
              icon={CalendarDays}
              title={translate('academic')}
            >
              <div className="grid gap-5 md:grid-cols-2">
                <Field htmlFor="academic-year" label={common('year')}>
                  <Select id="academic-year" defaultValue="2026-2027">
                    <SelectItem value="2026-2027">2026–2027</SelectItem>
                    <SelectItem value="2025-2026">2025–2026</SelectItem>
                  </Select>
                </Field>
                <Field htmlFor="grading-system" label={translate('gradingSystem')}>
                  <Select id="grading-system" defaultValue="20">
                    <SelectItem value="20">{translate('scale20')}</SelectItem>
                    <SelectItem value="100">{translate('scale100')}</SelectItem>
                  </Select>
                </Field>
                <Field htmlFor="year-start" label={translate('yearStart')}>
                  <Input defaultValue="2026-09-01" id="year-start" type="date" />
                </Field>
                <Field htmlFor="year-end" label={translate('yearEnd')}>
                  <Input defaultValue="2027-07-09" id="year-end" type="date" />
                </Field>
              </div>
              <div className="mt-6 border-t border-border pt-2">
                <ToggleSetting
                  description={translate('automaticReportsDescription')}
                  label={translate('automaticReports')}
                />
                <ToggleSetting
                  description={translate('parentPortalDescription')}
                  label={translate('parentPortal')}
                />
              </div>
            </SettingsCard>
          </TabsContent>

          <TabsContent value="users">
            <SettingsCard
              description={translate('usersDescription')}
              icon={ShieldCheck}
              title={translate('users')}
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  [usersText('admin'), '2'],
                  [usersText('director'), '3'],
                  [usersText('teacher'), '28'],
                  [usersText('registrar'), '4'],
                ].map(([role, count]) => (
                  <div className="rounded-lg border border-border p-4" key={role}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{role}</p>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                    <Button
                      className="mt-4 w-full"
                      onClick={() => mockAction(common('edit'))}
                      type="button"
                      variant="outline"
                    >
                      {common('edit')}
                    </Button>
                  </div>
                ))}
              </div>
            </SettingsCard>
          </TabsContent>

          <TabsContent value="notifications">
            <SettingsCard
              description={translate('notificationDescription')}
              icon={Bell}
              title={translate('notifications')}
            >
              <ToggleSetting
                description={translate('emailNotificationsDescription')}
                label={translate('emailNotifications')}
              />
              <ToggleSetting
                description={translate('smsNotificationsDescription')}
                label={translate('smsNotifications')}
              />
              <ToggleSetting
                description={translate('paymentReminderDescription')}
                label={translate('paymentReminders')}
              />
              <ToggleSetting
                description={translate('absenceAlertDescription')}
                label={translate('absenceAlerts')}
              />
            </SettingsCard>
          </TabsContent>

          <TabsContent value="billing">
            <SettingsCard
              description={translate('billingDescription')}
              icon={CreditCard}
              title={translate('billing')}
            >
              <div className="flex flex-col gap-5 rounded-xl border border-border bg-muted/35 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Badge>{translate('professional')}</Badge>
                  <p className="mt-3 text-2xl font-bold">
                    75 000 XOF{' '}
                    <span className="text-sm font-normal text-muted-foreground">
                      / {translate('month')}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{translate('nextBilling')}</p>
                </div>
                <Button
                  onClick={() => mockAction(translate('manageSubscription'))}
                  type="button"
                  variant="outline"
                >
                  {translate('manageSubscription')}
                </Button>
              </div>
            </SettingsCard>
          </TabsContent>
        </Tabs>
      </form>
    </div>
  );
}
