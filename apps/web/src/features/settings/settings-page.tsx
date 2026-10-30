'use client';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectItem,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@gestschool/ui';
import type { SessionView, TenantSettingsUpdate, TenantSettingsView } from '@gestschool/contracts';
import { Building2, CalendarDays, Save } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { useAuth } from '../auth/auth-provider';
import { PeopleError, peopleRequest } from '../directory/people-client';
import { usePeopleData } from '../directory/people-hooks';
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

function canSettings(
  session: SessionView | undefined,
  permission: 'settings.read' | 'settings.write',
) {
  return Boolean(
    session?.grants.some(
      (grant) =>
        grant.permission === permission &&
        (grant.scope === 'TENANT' ||
          (grant.scope === 'PLATFORM' && session.roles.includes('SUPER_ADMIN'))),
    ),
  );
}

function editableFromView(value: TenantSettingsView): TenantSettingsUpdate {
  return {
    schoolName: value.schoolName,
    schoolCode: value.schoolCode,
    email: value.email,
    phone: value.phone,
    address: value.address,
    primaryColor: value.primaryColor,
    timezone: value.timezone,
  };
}

export function SettingsPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Settings');
  const { session } = useAuth();
  const canRead = canSettings(session?.session, 'settings.read');
  const canWrite = canSettings(session?.session, 'settings.write');
  const result = usePeopleData<TenantSettingsView>(canRead ? 'settings' : null);
  const [form, setForm] = useState<TenantSettingsUpdate | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (result.data) setForm(editableFromView(result.data));
  }, [result.data]);

  function patch<K extends keyof TenantSettingsUpdate>(key: K, value: TenantSettingsUpdate[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function save() {
    if (!form || !canWrite || saving) return;
    setSaving(true);
    try {
      const updated = await peopleRequest<TenantSettingsView>('settings', form, 'PATCH');
      setForm(editableFromView(updated));
      toast.success(translate('saved'));
    } catch {
      toast.error(translate('saveError'));
    } finally {
      setSaving(false);
    }
  }

  if (!canRead) {
    return (
      <div className="page-shell">
        <PageHeader
          description={translate('description')}
          eyebrow={nav('system')}
          title={translate('title')}
        />
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {translate('forbidden')}
        </p>
      </div>
    );
  }

  const activeYear = result.data?.activeAcademicYear ?? null;

  return (
    <div className="page-shell" data-settings-ready={!result.loading}>
      <PageHeader
        actions={
          canWrite && form ? (
            <Button disabled={saving} onClick={() => void save()} type="button">
              <Save />
              {saving ? translate('saving') : translate('save')}
            </Button>
          ) : undefined
        }
        description={translate('description')}
        eyebrow={nav('system')}
        title={translate('title')}
      />

      {result.loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          {common('loading')}
        </p>
      ) : null}

      {result.error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {translate('loadError')}
          {result.error instanceof PeopleError && result.error.requestId ? (
            <span className="mt-1 block break-all font-mono text-[11px]">
              {result.error.requestId}
            </span>
          ) : null}
        </p>
      ) : null}

      {form ? (
        <Tabs defaultValue="school">
          <div className="max-w-full overflow-x-auto pb-1">
            <TabsList>
              <TabsTrigger value="school">{translate('school')}</TabsTrigger>
              <TabsTrigger value="academic">{translate('academic')}</TabsTrigger>
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
                  <Input
                    id="school-name"
                    value={form.schoolName}
                    disabled={!canWrite}
                    maxLength={160}
                    onChange={(event) => patch('schoolName', event.target.value)}
                  />
                </Field>
                <Field htmlFor="school-code" label={translate('code')}>
                  <Input
                    id="school-code"
                    value={form.schoolCode}
                    disabled={!canWrite}
                    maxLength={40}
                    onChange={(event) => patch('schoolCode', event.target.value)}
                  />
                </Field>
                <Field htmlFor="school-email" label={common('email')}>
                  <Input
                    id="school-email"
                    type="email"
                    value={form.email ?? ''}
                    disabled={!canWrite}
                    onChange={(event) => patch('email', event.target.value || null)}
                  />
                </Field>
                <Field htmlFor="school-phone" label={common('phone')}>
                  <Input
                    id="school-phone"
                    type="tel"
                    value={form.phone ?? ''}
                    disabled={!canWrite}
                    onChange={(event) => patch('phone', event.target.value || null)}
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field htmlFor="school-address" label={translate('address')}>
                    <Textarea
                      id="school-address"
                      value={form.address ?? ''}
                      disabled={!canWrite}
                      maxLength={500}
                      onChange={(event) => patch('address', event.target.value || null)}
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
              <Field htmlFor="primary-color" label={translate('primaryColor')}>
                <div className="flex max-w-md gap-3">
                  <Input
                    aria-label={translate('primaryColorPicker')}
                    className="w-14 px-1"
                    id="primary-color-picker"
                    type="color"
                    value={form.primaryColor}
                    disabled={!canWrite}
                    onChange={(event) => patch('primaryColor', event.target.value.toUpperCase())}
                  />
                  <Input
                    className="font-mono"
                    id="primary-color"
                    value={form.primaryColor}
                    disabled={!canWrite}
                    maxLength={7}
                    onChange={(event) => patch('primaryColor', event.target.value)}
                  />
                </div>
              </Field>
            </SettingsCard>
          </TabsContent>

          <TabsContent value="academic">
            <SettingsCard
              description={translate('academicDescription')}
              icon={CalendarDays}
              title={translate('academic')}
            >
              <div className="grid gap-5 md:grid-cols-2">
                <Field htmlFor="active-academic-year" label={translate('activeAcademicYear')}>
                  <Input
                    id="active-academic-year"
                    value={
                      activeYear
                        ? `${activeYear.name} · ${activeYear.startsOn} → ${activeYear.endsOn}`
                        : translate('noActiveAcademicYear')
                    }
                    disabled
                  />
                  <p className="text-xs text-muted-foreground">
                    {translate('activeAcademicYearHint')}
                  </p>
                </Field>
                <Field htmlFor="timezone" label={translate('timezone')}>
                  <Input
                    id="timezone"
                    value={form.timezone}
                    disabled={!canWrite}
                    maxLength={80}
                    onChange={(event) => patch('timezone', event.target.value)}
                  />
                </Field>
              </div>
            </SettingsCard>
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}
