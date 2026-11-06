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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@gestschool/ui';
import type { SessionView, TenantSettingsUpdate, TenantSettingsView } from '@gestschool/contracts';
import { Building2, CalendarDays, Save } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { useAuth } from '../auth/auth-provider';
import { PeopleError, peopleRequest } from '../directory/people-client';
import { usePeopleData } from '../directory/people-hooks';
import { PageHeader } from '../shared/page-header';
import { notifyShellContextRefresh } from '../shell/shell-events';

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
    schoolLogoDataUrl: value.schoolLogoDataUrl ?? null,
    primaryColor: value.primaryColor,
    timezone: value.timezone,
  };
}

async function logoDataUrl(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size === 0 || file.size > 250_000)
    throw new Error('SETTINGS_LOGO_INVALID');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  return `data:${file.type};base64,${btoa(binary)}`;
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
      notifyShellContextRefresh();
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
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm font-medium text-foreground"
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
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm font-medium text-foreground"
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
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
                <div className="space-y-5">
                  <Field htmlFor="primary-color" label={translate('primaryColor')}>
                    <div className="flex max-w-md gap-3">
                      <Input
                        aria-label={translate('primaryColorPicker')}
                        className="w-14 px-1"
                        id="primary-color-picker"
                        type="color"
                        value={form.primaryColor}
                        disabled={!canWrite}
                        onChange={(event) =>
                          patch('primaryColor', event.target.value.toUpperCase())
                        }
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
                  <Field htmlFor="school-logo" label={translate('logo')}>
                    <Input
                      accept="image/png,image/jpeg"
                      disabled={!canWrite}
                      id="school-logo"
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.item(0);
                        event.currentTarget.value = '';
                        if (!file) return;
                        void logoDataUrl(file)
                          .then((value) => patch('schoolLogoDataUrl', value))
                          .catch(() => toast.error(translate('logoInvalid')));
                      }}
                    />
                    <p className="text-xs text-muted-foreground">{translate('logoHint')}</p>
                    {form.schoolLogoDataUrl ? (
                      <div className="flex items-center gap-3 rounded-lg border p-3">
                        <Image
                          alt={translate('logo')}
                          className="size-14 rounded-md object-contain"
                          height={56}
                          src={form.schoolLogoDataUrl}
                          unoptimized
                          width={56}
                        />
                        {canWrite ? (
                          <Button
                            onClick={() => patch('schoolLogoDataUrl', null)}
                            type="button"
                            variant="outline"
                          >
                            {translate('removeLogo')}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </Field>
                </div>
                <div
                  aria-label={translate('documentPreview')}
                  className="rounded-xl border bg-card p-4 shadow-sm"
                >
                  <div
                    className="mb-4 h-1 rounded-full"
                    style={{
                      backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(form.primaryColor)
                        ? form.primaryColor
                        : '#1D4ED8',
                    }}
                  />
                  <div className="flex items-start gap-3">
                    {form.schoolLogoDataUrl ? (
                      <Image
                        alt=""
                        className="size-12 rounded object-contain"
                        height={48}
                        src={form.schoolLogoDataUrl}
                        unoptimized
                        width={48}
                      />
                    ) : null}
                    <div className="min-w-0">
                      <p className="font-semibold">{form.schoolName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[form.schoolCode, form.address, form.email, form.phone]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>
                  <p className="mt-6 text-lg font-semibold">{translate('previewDocumentTitle')}</p>
                  <div className="mt-4 space-y-2">
                    <div className="h-2 w-4/5 rounded bg-muted" />
                    <div className="h-2 w-3/5 rounded bg-muted" />
                    <div className="h-2 w-2/3 rounded bg-muted" />
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
