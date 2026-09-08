'use client';

import { Button, Card, CardContent, Input, Label } from '@gestschool/ui';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FormEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { LoginResult } from '@gestschool/contracts';
import { authRequest, AuthClientError } from './auth-client';
import { useAuth } from './auth-provider';

import { AppLogo } from '../../components/app-logo';
import { LocaleSelect, ThemeToggle } from '../../components/portal-shell';
import { Link, useRouter } from '../../i18n/navigation';

function AuthShell({ children }: { children: ReactNode }) {
  const { ready } = useAuth();
  const translate = useTranslations('Auth');
  const features = ['feature1', 'feature2', 'feature3', 'feature4'] as const;

  return (
    <main
      aria-busy={!ready}
      className="grid min-h-screen bg-background lg:grid-cols-[minmax(380px,0.9fr)_minmax(480px,1.1fr)]"
    >
      <section className="relative hidden overflow-hidden bg-sidebar p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div
          aria-hidden="true"
          className="absolute -start-24 top-1/3 size-80 rounded-full bg-blue-600/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -end-24 bottom-0 size-72 rounded-full bg-cyan-500/15 blur-3xl"
        />
        <div className="relative">
          <AppLogo />
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
            {translate.rich('promise', {
              highlight: (chunks) => <span className="text-blue-400">{chunks}</span>,
              highlightText: translate('promiseHighlight'),
            })}
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-300">{translate('promiseText')}</p>
          <ul className="mt-8 grid gap-4">
            {features.map((feature) => (
              <li className="flex items-start gap-3 text-sm text-slate-200" key={feature}>
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20">
                  <Check className="size-3 text-blue-300" />
                </span>
                {translate(feature)}
              </li>
            ))}
          </ul>
        </div>
        <blockquote className="relative rounded-xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm italic leading-relaxed text-slate-200">
            {translate('testimonial')}
          </p>
          <footer className="mt-3">
            <p className="text-sm font-semibold">{translate('testimonialAuthor')}</p>
            <p className="text-xs text-slate-400">{translate('testimonialRole')}</p>
          </footer>
        </blockquote>
      </section>
      <section className="relative flex min-w-0 items-center justify-center px-4 py-20 sm:px-8">
        <div className="absolute end-4 top-4 flex items-center gap-1">
          <LocaleSelect />
          <ThemeToggle />
        </div>
        <div className="absolute start-4 top-4 rounded-xl bg-sidebar p-2 lg:hidden">
          <AppLogo compact />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}

function PasswordInput({
  id,
  label,
  minLength,
}: {
  id: string;
  label: string;
  minLength?: number;
}) {
  const translate = useTranslations('Auth');
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <LockKeyhole className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="px-9"
          id={id}
          minLength={minLength}
          name={id}
          maxLength={128}
          autoComplete={id === 'login-password' ? 'current-password' : 'new-password'}
          required
          type={visible ? 'text' : 'password'}
        />
        <Button
          aria-label={visible ? translate('hidePassword') : translate('showPassword')}
          className="absolute end-1 top-1/2 -translate-y-1/2"
          onClick={() => setVisible((current) => !current)}
          size="icon-sm"
          variant="ghost"
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      </div>
    </div>
  );
}

function ErrorNotice({ error }: { error: string }) {
  const translate = useTranslations('Iam');
  if (!error) return null;
  return (
    <p role="alert" className="text-sm font-medium text-destructive">
      {translate(translate.has(error) ? error : 'AUTH_UNAVAILABLE')}
    </p>
  );
}

export function LoginPage() {
  const common = useTranslations('Common');
  const translate = useTranslations('Auth');
  const iam = useTranslations('Iam');
  const router = useRouter();
  const { accept, ready, expired } = useAuth();
  const [challenge, setChallenge] = useState('');
  const [enrollment, setEnrollment] = useState(false);
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
    try {
      const result = challenge
        ? await authRequest<LoginResult>(enrollment ? 'mfa/confirm' : 'mfa/verify', {
            challenge,
            code: String(data.get('totp')),
          })
        : await authRequest<LoginResult>('login', {
            email: String(data.get('email')),
            password: String(data.get('login-password')),
          });
      if (result.kind === 'session') {
        accept(result);
        setSecret('');
        setChallenge('');
        router.push('/');
      } else {
        setEnrollment(result.enrollmentRequired);
        if (result.enrollmentRequired) {
          const setup = await authRequest<{ challenge: string; secret: string }>('mfa/enroll', {
            challenge: result.challenge,
          });
          setChallenge(setup.challenge);
          setSecret(setup.secret);
        } else setChallenge(result.challenge);
      }
    } catch (failure) {
      setError(failure instanceof AuthClientError ? failure.code : 'AUTH_UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthShell>
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">GestSchool</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">
          {challenge ? iam('mfaTitle') : translate('loginTitle')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {challenge
            ? iam(enrollment ? 'mfaEnroll' : 'mfaChallenge')
            : translate('loginDescription')}
        </p>
      </div>
      <Card>
        <CardContent className="p-6 sm:p-7">
          {expired ? (
            <p role="status" className="mb-4 text-sm text-muted-foreground">
              {iam('expired')}
            </p>
          ) : null}
          <form className="space-y-5" onSubmit={submit}>
            {challenge ? (
              <>
                {secret ? (
                  <p className="rounded-lg bg-muted p-3 text-sm">
                    <span className="block">{iam('mfaSecret')}</span>
                    <code
                      data-testid="mfa-secret"
                      className="mt-2 block break-all font-mono"
                      dir="ltr"
                    >
                      {secret}
                    </code>
                  </p>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="totp">{iam('mfaCode')}</Label>
                  <Input
                    id="totp"
                    name="totp"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    minLength={6}
                    required
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="login-email">{common('email')}</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      autoComplete="username"
                      className="ps-9"
                      id="login-email"
                      name="email"
                      required
                      type="email"
                    />
                  </div>
                </div>
                <PasswordInput id="login-password" label={translate('password')} />
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <Link
                    className="text-sm font-semibold text-primary hover:underline"
                    href="/forgot-password"
                  >
                    {translate('forgot')}
                  </Link>
                </div>
              </>
            )}
            <ErrorNotice error={error} />
            <Button className="w-full" disabled={loading || !ready} size="lg" type="submit">
              {loading || !ready ? iam('loading') : challenge ? iam('verify') : translate('login')}
              <ArrowRight className="rtl:rotate-180" />
            </Button>
            {challenge ? (
              <Button
                className="w-full"
                variant="ghost"
                onClick={() => {
                  setChallenge('');
                  setSecret('');
                  setError('');
                }}
              >
                {translate('backToLogin')}
              </Button>
            ) : null}
            <p className="rounded-lg bg-muted p-3 text-center text-xs leading-relaxed text-muted-foreground">
              {iam('sessionNotice')}
            </p>
          </form>
        </CardContent>
      </Card>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        <Link className="font-semibold text-primary hover:underline" href="/activation">
          {translate('activateAccount')}
        </Link>
      </p>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const common = useTranslations('Common');
  const translate = useTranslations('Auth');
  const iam = useTranslations('Iam');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
    try {
      await authRequest('forgot-password', { email: String(data.get('email')) });
      setSent(true);
    } catch (failure) {
      setError(failure instanceof AuthClientError ? failure.code : 'AUTH_UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthShell>
      <Link
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        href="/login"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {translate('backToLogin')}
      </Link>
      <div className="mb-7">
        <h2 className="text-3xl font-bold tracking-tight">
          {sent ? translate('emailSent') : translate('forgotTitle')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {sent ? iam('forgotGeneric') : translate('forgotDescription')}
        </p>
      </div>
      <Card>
        <CardContent className="p-7">
          {sent ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto size-12 text-success" />
              <Button className="mt-6" onClick={() => setSent(false)} variant="outline">
                {translate('resend')}
              </Button>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={submit}>
              <div className="space-y-2">
                <Label htmlFor="forgot-email">{common('email')}</Label>
                <Input id="forgot-email" name="email" autoComplete="email" required type="email" />
              </div>
              <ErrorNotice error={error} />
              <Button className="w-full" disabled={loading} size="lg" type="submit">
                {loading ? iam('loading') : translate('sendLink')}
                <ArrowRight className="rtl:rotate-180" />
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}

function SetPasswordPage({ activation }: { activation: boolean }) {
  const translate = useTranslations('Auth');
  const iam = useTranslations('Iam');
  const router = useRouter();
  const [token, setToken] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (value) {
      setToken(value);
      setStep(2);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get('activation-password') !== data.get('activation-confirm')) {
      setError('AUTH_PASSWORD_MISMATCH');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await authRequest(activation ? 'activation' : 'reset-password', {
        token,
        password: String(data.get('activation-password')),
      });
      setToken('');
      setStep(3);
    } catch (failure) {
      setError(failure instanceof AuthClientError ? failure.code : 'AUTH_UNAVAILABLE');
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthShell>
      <Link
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        href="/login"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {translate('backToLogin')}
      </Link>
      <div className="mb-7">
        <h2 className="text-3xl font-bold tracking-tight">
          {activation ? translate('activateAccount') : iam('resetTitle')}
        </h2>
        <div className="mt-5 flex items-center gap-2">
          {[iam('token'), translate('activationStep2'), translate('activationStep3')].map(
            (label, index) => (
              <div className="flex min-w-0 flex-1 items-center gap-2" key={label}>
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step >= index + 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                >
                  {step > index + 1 ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span className="hidden truncate text-xs font-semibold sm:inline">{label}</span>
              </div>
            ),
          )}
        </div>
      </div>
      <Card>
        <CardContent className="p-7">
          {step === 1 ? (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                setStep(2);
              }}
            >
              <ShieldCheck className="mx-auto size-9 text-primary" />
              <div className="space-y-2">
                <Label htmlFor="activation-code">{iam('token')}</Label>
                <Input
                  id="activation-code"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  minLength={43}
                  maxLength={43}
                  pattern="[A-Za-z0-9_\-]{43}"
                  required
                  autoComplete="off"
                />
              </div>
              <Button className="w-full" type="submit">
                {translate('activationStep2')}
                <ArrowRight className="rtl:rotate-180" />
              </Button>
            </form>
          ) : null}
          {step === 2 ? (
            <form className="space-y-5" onSubmit={submit}>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {iam('passwordPolicy')}
              </p>
              <PasswordInput
                id="activation-password"
                label={translate('newPassword')}
                minLength={12}
              />
              <PasswordInput
                id="activation-confirm"
                label={translate('confirmPassword')}
                minLength={12}
              />
              <ErrorNotice error={error} />
              <Button className="w-full" disabled={loading} size="lg" type="submit">
                {loading ? iam('loading') : activation ? translate('activate') : iam('resetSubmit')}
                <ArrowRight className="rtl:rotate-180" />
              </Button>
            </form>
          ) : null}
          {step === 3 ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto size-14 text-success" />
              <h3 className="mt-5 text-2xl font-bold">
                {activation ? translate('activationDone') : iam('resetDone')}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{iam('signInNow')}</p>
              <Button className="mt-6 w-full" onClick={() => router.push('/login')} size="lg">
                {translate('login')}
                <ArrowRight className="rtl:rotate-180" />
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
export function ActivationPage() {
  return <SetPasswordPage activation />;
}
export function ResetPasswordPage() {
  return <SetPasswordPage activation={false} />;
}
