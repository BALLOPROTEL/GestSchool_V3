import { Card, CardContent, CardDescription, CardHeader, CardTitle, KpiCard } from '@gestschool/ui';
import { AlertCircle, CircleDollarSign, TrendingUp, UsersRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import type { AppLocale } from '../../i18n/routing';
import { monthlyExpenses, monthlyIncome, weeklyAttendance } from '../../mocks/data';
import { formatCurrency, formatNumber } from '../shared/format';
import { MiniChart } from '../shared/mini-chart';
import { PageHeader } from '../shared/page-header';

function dateLabels(locale: AppLocale, type: 'month' | 'weekday'): string[] {
  const options: Intl.DateTimeFormatOptions =
    type === 'month' ? { month: 'short' } : { weekday: 'short' };
  const formatter = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-CI' : `${locale}-CI`, options);
  if (type === 'month') {
    return Array.from({ length: 6 }, (_, index) => formatter.format(new Date(2026, index, 1)));
  }
  return Array.from({ length: 5 }, (_, index) => formatter.format(new Date(2026, 8, 7 + index)));
}

export function DashboardPage() {
  const locale = useLocale() as AppLocale;
  const translate = useTranslations('Dashboard');
  const months = dateLabels(locale, 'month');
  const weekdays = dateLabels(locale, 'weekday');
  const activity = [
    {
      body: translate('activityEnrollment', { className: 'Terminale C', name: 'Kadiatou Sylla' }),
      tone: 'bg-blue-500',
    },
    {
      body: translate('activityPayment', {
        amount: formatCurrency(150_000, locale),
        name: 'Ibrahim Koné',
      }),
      tone: 'bg-emerald-500',
    },
    {
      body: translate('activityGrade', { name: 'Aminata Diallo' }),
      tone: 'bg-violet-500',
    },
  ] as const;

  return (
    <div className="page-shell">
      <PageHeader description={translate('description')} title={translate('title')} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          change="+12,5 %"
          changeDirection="up"
          helper={translate('versusMonth')}
          icon={UsersRound}
          label={translate('students')}
          value={formatNumber(1247, locale)}
        />
        <KpiCard
          change="+8,2 %"
          changeDirection="up"
          helper={translate('versusMonth')}
          icon={CircleDollarSign}
          label={translate('revenue')}
          value={formatCurrency(42_750_000, locale)}
        />
        <KpiCard
          change="−2,1 %"
          changeDirection="down"
          helper={translate('versusWeek')}
          icon={TrendingUp}
          label={translate('attendance')}
          value="90,8 %"
        />
        <KpiCard
          helper={translate('issuesHelper')}
          icon={AlertCircle}
          label={translate('issues')}
          value="24"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{translate('financeChart')}</CardTitle>
            <CardDescription>{translate('financeChartDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <MiniChart
              ariaLabel={translate('financeChart')}
              labels={months}
              primary={monthlyIncome}
              secondary={monthlyExpenses}
            />
            <div className="mt-4 flex justify-center gap-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary" /> {translate('income')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-slate-400" /> {translate('expenses')}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{translate('attendanceChart')}</CardTitle>
            <CardDescription>{translate('attendanceChartDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <figure>
              <div
                aria-label={translate('attendanceChart')}
                className="flex h-56 items-end justify-around gap-3 border-b border-border px-2 pt-4"
                role="img"
              >
                {weeklyAttendance.map((value, index) => (
                  <div
                    className="flex h-full flex-1 items-end justify-center"
                    key={weekdays[index]}
                  >
                    <div
                      className="w-full max-w-14 rounded-t-md bg-primary transition-opacity hover:opacity-80"
                      style={{ height: `${value}%` }}
                      title={`${weekdays[index]} · ${value}%`}
                    />
                  </div>
                ))}
              </div>
              <figcaption className="mt-2 flex justify-around text-[11px] text-muted-foreground">
                {weekdays.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </figcaption>
            </figure>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{translate('recent')}</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ul className="divide-y divide-border">
              {activity.map((item) => (
                <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0" key={item.body}>
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.tone}`} />
                  <span className="text-sm text-foreground">{item.body}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{translate('alerts')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/35 dark:text-red-300">
              {translate('alertPayments')}
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-300">
              {translate('alertAttendance')}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
