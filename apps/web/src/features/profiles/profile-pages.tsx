'use client';

import type {
  LoginResult,
  ProfileNotificationPreferences,
  ProfileSessionView,
  ProfileView,
} from '@gestschool/contracts';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
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
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@gestschool/ui';
import {
  Building2,
  Camera,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  Mail,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { authRequest, AuthClientError } from '../auth/auth-client';
import { useAuth } from '../auth/auth-provider';
import { deletePrivateAvatar, uploadPrivateAvatar, usePrivateAvatar } from '../shared/avatar-client';
import { getInitials } from '../shared/format';
import { PageHeader } from '../shared/page-header';

type Authenticated = Extract<LoginResult, { kind: 'session' }>;

interface MfaEnrollment {
  challenge: string;
  secret: string;
  qrCodeDataUrl: string;
}

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

function PasswordInput({
  autoComplete,
  disabled,
  id,
  minLength,
  name,
  onChange,
  value,
}: {
  autoComplete: string;
  disabled?: boolean;
  id: string;
  minLength?: number;
  name: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const translate = useTranslations('Profile');
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        autoComplete={autoComplete}
        className="pe-10"
        disabled={disabled}
        id={id}
        minLength={minLength}
        name={name}
        required
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <Button
        aria-label={visible ? translate('hidePassword') : translate('showPassword')}
        className="absolute end-1 top-1/2 -translate-y-1/2"
        disabled={disabled}
        onClick={() => setVisible((current) => !current)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  );
}

function PreferenceRow({
  checked,
  description,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-4 last:border-0">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function deviceIcon(userAgent: string | null): LucideIcon {
  return userAgent && /iphone|android|mobile/i.test(userAgent) ? Smartphone : Laptop;
}

function sessionClientLabel(userAgent: string | null): string {
  if (!userAgent) return '—';

  const edge = /Edg\/(\d+)/.exec(userAgent);
  const opera = /OPR\/(\d+)/.exec(userAgent);
  const chrome = /(?:Chrome|CriOS)\/(\d+)/.exec(userAgent);
  const firefox = /(?:Firefox|FxiOS)\/(\d+)/.exec(userAgent);
  const safari = /Version\/(\d+).+Safari\//.exec(userAgent);
  const browser = edge
    ? `Microsoft Edge ${edge[1]}`
    : opera
      ? `Opera ${opera[1]}`
      : chrome
        ? `Google Chrome ${chrome[1]}`
        : firefox
          ? `Firefox ${firefox[1]}`
          : safari
            ? `Safari ${safari[1]}`
            : 'Navigateur';

  const os = /Windows NT/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;

  return os ? `${browser} · ${os}` : browser;
}

export function UserProfilePage() {
  const common = useTranslations('Common');
  const translate = useTranslations('Profile');
  const locale = useLocale();
  const { session, accept } = useAuth();
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [sessions, setSessions] = useState<ProfileSessionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [preferredLocale, setPreferredLocale] = useState<'fr' | 'en' | 'ar'>('fr');
  const [preferences, setPreferences] = useState<ProfileNotificationPreferences>({
    EMAIL: true,
    WHATSAPP: false,
  });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityBusy, setSecurityBusy] = useState(false);
  const [mfaPassword, setMfaPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarUrl = usePrivateAvatar('/api/v1/auth/profile/avatar');

  useEffect(() => {
    let active = true;
    void Promise.all([
      authRequest<ProfileView>('profile', undefined, 'GET'),
      authRequest<ProfileSessionView[]>('sessions', undefined, 'GET'),
    ])
      .then(([nextProfile, nextSessions]) => {
        if (!active) return;
        setProfile(nextProfile);
        setSessions(nextSessions);
        setDisplayName(nextProfile.user.displayName);
        setPreferredLocale(nextProfile.user.preferredLocale);
        setPreferences(nextProfile.notifications);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function changeAvatar(file: File | undefined) {
    if (!file) return;
    setAvatarBusy(true);
    try {
      await uploadPrivateAvatar('/api/v1/auth/profile/avatar', file);
      toast.success(translate('photoSaved'));
    } catch {
      toast.error(translate('photoError'));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    try {
      await deletePrivateAvatar('/api/v1/auth/profile/avatar');
      toast.success(translate('photoDeleted'));
    } catch {
      toast.error(translate('photoError'));
    } finally {
      setAvatarBusy(false);
    }
  }

  const currentSessionId = session?.session.sessionId ?? '';
  const privilegedMfa = useMemo(
    () =>
      profile?.membership.roles.some((role) =>
        ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'DIRECTOR', 'ACCOUNTANT'].includes(role),
      ) ?? false,
    [profile],
  );

  async function reloadProfile() {
    const next = await authRequest<ProfileView>('profile', undefined, 'GET');
    setProfile(next);
    setDisplayName(next.user.displayName);
    setPreferredLocale(next.user.preferredLocale);
    setPreferences(next.notifications);
  }

  async function reloadSessions() {
    setSessions(await authRequest<ProfileSessionView[]>('sessions', undefined, 'GET'));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const requestedLocale = form.get('preferredLocale');
    const selectedLocale =
      requestedLocale === 'en' || requestedLocale === 'ar' ? requestedLocale : 'fr';
    const submittedDisplayName = displayName.trim();
    setSaving(true);
    try {
      await authRequest(
        'profile',
        { displayName: submittedDisplayName, preferredLocale: selectedLocale },
        'PUT',
      );
      setDisplayName(submittedDisplayName);
      setPreferredLocale(selectedLocale);
      setProfile((current) =>
        current
          ? {
              ...current,
              user: {
                ...current.user,
                displayName: submittedDisplayName,
                preferredLocale: selectedLocale,
              },
            }
          : current,
      );
      if (selectedLocale !== locale) {
        const localizedPath = window.location.pathname.replace(
          /^\/(fr|en|ar)(?=\/|$)/,
          `/${selectedLocale}`,
        );
        window.location.assign(`${localizedPath}${window.location.search}${window.location.hash}`);
        return;
      }
      toast.success(translate('saved'));
    } catch {
      toast.error(translate('saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function savePreferences() {
    setSaving(true);
    try {
      await authRequest('preferences', preferences, 'PUT');
      await reloadProfile();
      toast.success(translate('preferencesSaved'));
    } catch {
      toast.error(translate('saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error(translate('passwordMismatch'));
      return;
    }
    setSecurityBusy(true);
    try {
      await authRequest('change-password', {
        currentPassword,
        newPassword,
        confirmPassword,
      });
      toast.success(translate('passwordSaved'));
      window.location.assign(`/${locale}/login`);
    } catch (error) {
      toast.error(
        error instanceof AuthClientError && error.code === 'AUTH_INVALID_CREDENTIALS'
          ? translate('invalidPassword')
          : translate('passwordError'),
      );
    } finally {
      setSecurityBusy(false);
    }
  }

  async function beginMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSecurityBusy(true);
    try {
      const setup = await authRequest<{ challenge: string }>('mfa/setup', {
        password: mfaPassword,
      });
      const next = await authRequest<MfaEnrollment>('mfa/enroll', {
        challenge: setup.challenge,
      });
      setEnrollment(next);
      setMfaCode('');
    } catch (error) {
      toast.error(
        error instanceof AuthClientError && error.code === 'AUTH_INVALID_CREDENTIALS'
          ? translate('invalidPassword')
          : translate('mfaError'),
      );
    } finally {
      setSecurityBusy(false);
    }
  }

  async function confirmMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment) return;
    setSecurityBusy(true);
    try {
      const authenticated = await authRequest<Authenticated>('mfa/confirm', {
        challenge: enrollment.challenge,
        code: mfaCode,
      });
      accept(authenticated);
      setEnrollment(null);
      setMfaPassword('');
      setMfaCode('');
      await reloadProfile();
      await reloadSessions();
      toast.success(translate('mfaEnabled'));
    } catch {
      toast.error(translate('mfaCodeError'));
    } finally {
      setSecurityBusy(false);
    }
  }

  async function disableMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSecurityBusy(true);
    try {
      await authRequest('mfa/disable', { password: mfaPassword, code: mfaCode });
      toast.success(translate('mfaDisabled'));
      window.location.assign(`/${locale}/login`);
    } catch (error) {
      toast.error(
        error instanceof AuthClientError && error.code === 'AUTH_MFA_REQUIRED'
          ? translate('mfaRequiredByRole')
          : translate('mfaError'),
      );
    } finally {
      setSecurityBusy(false);
    }
  }

  async function revokeSession(id: string) {
    setSecurityBusy(true);
    try {
      await authRequest(`sessions/${id}`, undefined, 'DELETE');
      if (id === currentSessionId) {
        window.location.assign(`/${locale}/login`);
        return;
      }
      await reloadSessions();
      toast.success(translate('sessionRevoked'));
    } catch {
      toast.error(translate('sessionError'));
    } finally {
      setSecurityBusy(false);
    }
  }

  async function logoutAll() {
    setSecurityBusy(true);
    try {
      await authRequest('logout-all');
      window.location.assign(`/${locale}/login`);
    } catch {
      toast.error(translate('sessionError'));
      setSecurityBusy(false);
    }
  }

  if (loading)
    return (
      <div className="page-shell">
        <PageHeader description={translate('description')} title={translate('title')} />
        <p role="status" className="text-sm text-muted-foreground">
          {common('loading')}
        </p>
      </div>
    );

  if (loadError || !profile)
    return (
      <div className="page-shell">
        <PageHeader description={translate('description')} title={translate('title')} />
        <p role="alert" className="text-sm text-destructive">
          {translate('loadError')}
        </p>
      </div>
    );

  return (
    <div className="page-shell" data-profile-ready="true">
      <PageHeader description={translate('description')} title={translate('title')} />
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit min-w-0">
          <CardContent className="flex flex-col items-center p-6 text-center">
            <Avatar className="size-24 ring-4 ring-primary/10">
              {avatarUrl ? (
                <AvatarImage alt={translate('photoAlt')} src={avatarUrl} />
              ) : null}
              <AvatarFallback className="bg-blue-600 text-2xl text-white">
                {getInitials(profile.user.displayName)}
              </AvatarFallback>
            </Avatar>
            <input
              accept="image/jpeg,image/png"
              aria-label={translate('photoInput')}
              className="sr-only"
              disabled={avatarBusy}
              id="profile-avatar-input"
              onChange={(event) => {
                void changeAvatar(event.currentTarget.files?.[0]);
                event.currentTarget.value = '';
              }}
              type="file"
            />
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button
                disabled={avatarBusy}
                onClick={() => document.getElementById('profile-avatar-input')?.click()}
                size="sm"
                type="button"
                variant="outline"
              >
                <Camera />
                {avatarUrl ? translate('changePhoto') : translate('addPhoto')}
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
                  {translate('removePhoto')}
                </Button>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{translate('photoHint')}</p>
            <h2 className="mt-4 text-lg font-bold">{profile.user.displayName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {profile.membership.roles.join(' · ')}
            </p>
            <Badge className="mt-3" variant="secondary">
              {profile.user.id.slice(0, 8)}
            </Badge>
            <div className="mt-6 w-full space-y-4 border-t border-border pt-5 text-start">
              <ProfileFact icon={Mail} label={common('email')} value={profile.user.email} />
              <ProfileFact
                icon={Building2}
                label={translate('school')}
                value={profile.membership.tenantName}
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
                <form className="grid gap-5 sm:grid-cols-2" onSubmit={saveProfile}>
                  <FormField htmlFor="profile-display-name" label={translate('displayName')}>
                    <Input
                      disabled={saving}
                      id="profile-display-name"
                      maxLength={160}
                      required
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                    />
                  </FormField>
                  <FormField htmlFor="profile-email" label={common('email')}>
                    <Input disabled id="profile-email" type="email" value={profile.user.email} />
                  </FormField>
                  <FormField htmlFor="profile-locale" label={translate('preferredLocale')}>
                    <Select
                      disabled={saving}
                      id="profile-locale"
                      name="preferredLocale"
                      value={preferredLocale}
                      onChange={(event) =>
                        setPreferredLocale(event.target.value as 'fr' | 'en' | 'ar')
                      }
                    >
                      <SelectItem value="fr">Français</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ar">العربية</SelectItem>
                    </Select>
                  </FormField>
                  <div className="sm:col-span-2">
                    <Button disabled={saving} type="submit">
                      <Save />
                      {saving ? common('loading') : common('save')}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>{translate('password')}</CardTitle>
                  <CardDescription>
                    {translate('passwordChangedAt', {
                      date: formatDate(profile.security.passwordChangedAt, locale),
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-4 sm:grid-cols-2" onSubmit={changePassword}>
                    <Input
                      aria-hidden="true"
                      autoComplete="username"
                      className="sr-only"
                      name="username"
                      readOnly
                      tabIndex={-1}
                      type="email"
                      value={profile.user.email}
                    />
                    <FormField
                      htmlFor="profile-current-password"
                      label={translate('currentPassword')}
                    >
                      <PasswordInput
                        autoComplete="current-password"
                        disabled={securityBusy}
                        id="profile-current-password"
                        name="currentPassword"
                        value={currentPassword}
                        onChange={setCurrentPassword}
                      />
                    </FormField>
                    <div />
                    <FormField htmlFor="profile-new-password" label={translate('newPassword')}>
                      <PasswordInput
                        autoComplete="new-password"
                        disabled={securityBusy}
                        id="profile-new-password"
                        minLength={12}
                        name="newPassword"
                        value={newPassword}
                        onChange={setNewPassword}
                      />
                    </FormField>
                    <FormField
                      htmlFor="profile-confirm-password"
                      label={translate('confirmPassword')}
                    >
                      <PasswordInput
                        autoComplete="new-password"
                        disabled={securityBusy}
                        id="profile-confirm-password"
                        minLength={12}
                        name="confirmPassword"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                      />
                    </FormField>
                    <div className="sm:col-span-2">
                      <Button disabled={securityBusy} type="submit" variant="outline">
                        <KeyRound />
                        {translate('changePassword')}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{translate('twoFactor')}</CardTitle>
                  <CardDescription>{translate('twoFactorDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="size-5 text-primary" />
                    <Badge variant={profile.security.mfaEnabled ? 'default' : 'secondary'}>
                      {profile.security.mfaEnabled
                        ? translate('mfaActive')
                        : translate('mfaInactive')}
                    </Badge>
                    {profile.security.mfaEnabledAt ? (
                      <span className="text-xs text-muted-foreground">
                        {formatDate(profile.security.mfaEnabledAt, locale)}
                      </span>
                    ) : null}
                  </div>

                  {!profile.security.mfaEnabled && !enrollment ? (
                    <form className="max-w-md space-y-4" onSubmit={beginMfa}>
                      <FormField htmlFor="mfa-password" label={translate('currentPassword')}>
                        <PasswordInput
                          autoComplete="current-password"
                          disabled={securityBusy}
                          id="mfa-password"
                          name="mfaPassword"
                          value={mfaPassword}
                          onChange={setMfaPassword}
                        />
                      </FormField>
                      <Button disabled={securityBusy} type="submit" variant="outline">
                        {translate('enableMfa')}
                      </Button>
                    </form>
                  ) : null}

                  {!profile.security.mfaEnabled && enrollment ? (
                    <form className="max-w-xl space-y-4" onSubmit={confirmMfa}>
                      <div className="rounded-lg border border-border bg-muted/40 p-4">
                        <div className="text-center">
                          <p className="text-sm font-semibold">{translate('mfaScan')}</p>
                          <img
                            alt={translate('mfaQrAlt')}
                            className="mx-auto mt-3 size-52 rounded-lg bg-white p-2"
                            data-testid="profile-mfa-qr"
                            height={208}
                            src={enrollment.qrCodeDataUrl}
                            width={208}
                          />
                        </div>
                        <div className="mt-4 border-t border-border pt-4">
                          <p className="text-sm font-semibold">{translate('mfaManual')}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {translate('mfaSetupKey')}
                          </p>
                          <code className="mt-2 block break-all text-xs">{enrollment.secret}</code>
                          <p className="mt-3 text-xs text-muted-foreground">
                            {translate('mfaSecretNotice')}
                          </p>
                        </div>
                      </div>
                      <FormField htmlFor="mfa-code" label={translate('mfaCode')}>
                        <Input
                          autoComplete="one-time-code"
                          id="mfa-code"
                          inputMode="numeric"
                          maxLength={6}
                          pattern="[0-9]{6}"
                          required
                          value={mfaCode}
                          onChange={(event) => setMfaCode(event.target.value)}
                        />
                      </FormField>
                      <Button disabled={securityBusy} type="submit">
                        {translate('confirmMfa')}
                      </Button>
                    </form>
                  ) : null}

                  {profile.security.mfaEnabled && privilegedMfa ? (
                    <p className="text-sm text-muted-foreground">
                      {translate('mfaRequiredByRole')}
                    </p>
                  ) : null}

                  {profile.security.mfaEnabled && !privilegedMfa ? (
                    <form className="grid max-w-xl gap-4 sm:grid-cols-2" onSubmit={disableMfa}>
                      <FormField
                        htmlFor="mfa-disable-password"
                        label={translate('currentPassword')}
                      >
                        <PasswordInput
                          autoComplete="current-password"
                          disabled={securityBusy}
                          id="mfa-disable-password"
                          name="mfaDisablePassword"
                          value={mfaPassword}
                          onChange={setMfaPassword}
                        />
                      </FormField>
                      <FormField htmlFor="mfa-disable-code" label={translate('mfaCode')}>
                        <Input
                          autoComplete="one-time-code"
                          id="mfa-disable-code"
                          inputMode="numeric"
                          maxLength={6}
                          pattern="[0-9]{6}"
                          required
                          value={mfaCode}
                          onChange={(event) => setMfaCode(event.target.value)}
                        />
                      </FormField>
                      <div className="sm:col-span-2">
                        <Button disabled={securityBusy} type="submit" variant="outline">
                          {translate('disableMfa')}
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>{translate('notifications')}</CardTitle>
                <CardDescription>{translate('notificationsDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="pt-1">
                <PreferenceRow
                  checked={preferences.EMAIL}
                  description={translate('emailDescription')}
                  label={translate('emailNotifications')}
                  onCheckedChange={(checked) =>
                    setPreferences((current) => ({ ...current, EMAIL: checked }))
                  }
                />
                <PreferenceRow
                  checked={preferences.WHATSAPP}
                  description={translate('whatsappDescription')}
                  label={translate('whatsappNotifications')}
                  onCheckedChange={(checked) =>
                    setPreferences((current) => ({ ...current, WHATSAPP: checked }))
                  }
                />
                <div className="border-b border-border py-4">
                  <p className="text-sm font-semibold">{translate('inAppNotifications')}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {translate('inAppRequiredDescription')}
                  </p>
                </div>
                <div className="pt-4">
                  <Button disabled={saving} onClick={savePreferences}>
                    <Save />
                    {common('save')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>{translate('sessions')}</CardTitle>
                    <CardDescription>{translate('sessionsDescription')}</CardDescription>
                  </div>
                  <Button disabled={securityBusy} onClick={logoutAll} variant="outline">
                    {translate('logoutAll')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {sessions.length ? (
                  sessions.map((row) => (
                    <SessionRow
                      current={row.id === currentSessionId}
                      key={row.id}
                      locale={locale}
                      row={row}
                      revoke={() => void revokeSession(row.id)}
                      revokeLabel={translate('revokeSession')}
                      currentLabel={translate('currentSession')}
                      busy={securityBusy}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">{translate('noSessions')}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SessionRow({
  busy,
  current,
  currentLabel,
  locale,
  revoke,
  revokeLabel,
  row,
}: {
  busy: boolean;
  current: boolean;
  currentLabel: string;
  locale: string;
  revoke: () => void;
  revokeLabel: string;
  row: ProfileSessionView;
}) {
  const Icon = deviceIcon(row.userAgent);
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center"
      data-current={current}
      data-profile-session
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{sessionClientLabel(row.userAgent)}</p>
        <p className="text-xs text-muted-foreground">
          {new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(row.lastUsedAt))}
        </p>
      </div>
      {current ? <Badge variant="secondary">{currentLabel}</Badge> : null}
      <Button aria-label={revokeLabel} disabled={busy} onClick={revoke} size="sm" variant="outline">
        <Trash2 />
        {revokeLabel}
      </Button>
    </div>
  );
}
