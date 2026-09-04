'use client';

import { Button, Card, CardContent, Checkbox, Input, Label } from '@gestschool/ui';
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
import { useState } from 'react';

import { AppLogo } from '../../components/app-logo';
import { LocaleSelect, ThemeToggle } from '../../components/portal-shell';
import { Link, useRouter } from '../../i18n/navigation';

function AuthShell({ children }: { children: ReactNode }) {
  const translate = useTranslations('Auth');
  const features = ['feature1', 'feature2', 'feature3', 'feature4'] as const;

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(380px,0.9fr)_minmax(480px,1.1fr)]">
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

export function LoginPage() {
  const common = useTranslations('Common');
  const translate = useTranslations('Auth');
  const router = useRouter();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.push('/');
  };

  return (
    <AuthShell>
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">GestSchool</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">{translate('loginTitle')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {translate('loginDescription')}
        </p>
      </div>
      <Card>
        <CardContent className="p-6 sm:p-7">
          <form className="space-y-5" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="login-email">{common('email')}</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoComplete="email"
                  className="ps-9"
                  defaultValue="admin@gestschool.ci"
                  id="login-email"
                  name="email"
                  required
                  type="email"
                />
              </div>
            </div>
            <PasswordInput id="login-password" label={translate('password')} minLength={8} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox id="remember" />
                <span>{translate('remember')}</span>
              </label>
              <Link
                className="text-sm font-semibold text-primary hover:underline"
                href="/forgot-password"
              >
                {translate('forgot')}
              </Link>
            </div>
            <Button className="w-full" size="lg" type="submit">
              {translate('login')}
              <ArrowRight className="rtl:rotate-180" />
            </Button>
            <p className="rounded-lg bg-muted p-3 text-center text-xs leading-relaxed text-muted-foreground">
              {translate('demoHint')}
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
  const [email, setEmail] = useState('direction@lyceevictor.ci');
  const [sent, setSent] = useState(false);

  return (
    <AuthShell>
      <Link
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        href="/login"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {translate('backToLogin')}
      </Link>
      {sent ? (
        <Card>
          <CardContent className="p-7 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950/40">
              <CheckCircle2 className="size-7 text-success" />
            </span>
            <h2 className="mt-5 text-2xl font-bold">{translate('emailSent')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {translate('emailSentDescription', { email })}
            </p>
            <Button className="mt-6" onClick={() => setSent(false)} variant="outline">
              {translate('resend')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-7">
            <h2 className="text-3xl font-bold tracking-tight">{translate('forgotTitle')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {translate('forgotDescription')}
            </p>
          </div>
          <Card>
            <CardContent className="p-7">
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSent(true);
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">{common('email')}</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="ps-9"
                      id="forgot-email"
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      type="email"
                      value={email}
                    />
                  </div>
                </div>
                <Button className="w-full" size="lg" type="submit">
                  {translate('sendLink')}
                  <ArrowRight className="rtl:rotate-180" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </AuthShell>
  );
}

export function ActivationPage() {
  const translate = useTranslations('Auth');
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const steps = [
    translate('activationStep1'),
    translate('activationStep2'),
    translate('activationStep3'),
  ];

  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get('activation-password') !== data.get('activation-confirm')) {
      setError(translate('passwordMismatch'));
      return;
    }
    setError('');
    setStep(3);
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
        <h2 className="text-3xl font-bold tracking-tight">{translate('activateAccount')}</h2>
        <div className="mt-5 flex items-center gap-2" aria-label={translate('activateAccount')}>
          {steps.map((label, index) => (
            <div className="flex min-w-0 flex-1 items-center gap-2" key={label}>
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step >= index + 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              >
                {step > index + 1 ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="hidden truncate text-xs font-semibold sm:inline">{label}</span>
            </div>
          ))}
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
              <div className="text-center">
                <ShieldCheck className="mx-auto size-9 text-primary" />
                <h3 className="mt-3 text-lg font-semibold">{translate('otp')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{translate('otpDescription')}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="activation-code">{translate('otp')}</Label>
                <Input
                  autoComplete="one-time-code"
                  className="h-12 text-center font-mono text-xl tracking-[0.35em]"
                  id="activation-code"
                  inputMode="numeric"
                  maxLength={6}
                  minLength={6}
                  pattern="[0-9]{6}"
                  placeholder="000000"
                  required
                />
              </div>
              <Button className="w-full" size="lg" type="submit">
                {translate('activationStep2')}
                <ArrowRight className="rtl:rotate-180" />
              </Button>
            </form>
          ) : null}
          {step === 2 ? (
            <form className="space-y-5" onSubmit={submitPassword}>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {translate('newPasswordDescription')}
              </p>
              <PasswordInput
                id="activation-password"
                label={translate('newPassword')}
                minLength={8}
              />
              <PasswordInput
                id="activation-confirm"
                label={translate('confirmPassword')}
                minLength={8}
              />
              {error ? (
                <p aria-live="polite" className="text-sm font-medium text-destructive">
                  {error}
                </p>
              ) : null}
              <Button className="w-full" size="lg" type="submit">
                {translate('activate')}
                <ArrowRight className="rtl:rotate-180" />
              </Button>
            </form>
          ) : null}
          {step === 3 ? (
            <div className="text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-950/40">
                <CheckCircle2 className="size-7 text-success" />
              </span>
              <h3 className="mt-5 text-2xl font-bold">{translate('activationDone')}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {translate('activationDoneDescription')}
              </p>
              <Button className="mt-6 w-full" onClick={() => router.push('/')} size="lg">
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
