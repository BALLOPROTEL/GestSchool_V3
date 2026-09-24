'use client';
import { Card, CardContent, CardHeader, CardTitle, KpiCard } from '@gestschool/ui';
import { BookOpen, CircleDollarSign, FileCheck2, UsersRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { AcademicView, DashboardSummary } from '@gestschool/contracts';
import { useAuth } from '../auth/auth-provider';
import { usePeopleData } from '../directory/people-hooks';
import { moneyMinor } from '../finance/finance-client';
import { MiniChart } from '../shared/mini-chart';
import { PageHeader } from '../shared/page-header';
import { canReport } from '../reports/reporting-client';
type AcademicList = { items: AcademicView[]; total: number };
export function DashboardPage() {
  const t = useTranslations('Dashboard'),
    locale = useLocale(),
    { session } = useAuth(),
    allowed = canReport(session?.session, 'dashboards.read'),
    canYears = Boolean(
      session?.session.grants.some(
        (grant) => grant.permission === 'academic-years.read' && grant.scope !== 'NONE',
      ),
    ),
    [year, setYear] = useState(''),
    [period, setPeriod] = useState('');
  const years = usePeopleData<AcademicList>(
      allowed && canYears
        ? 'academic-years?page=1&pageSize=100&search=&status=ALL&sort=-createdAt'
        : null,
    ),
    periods = usePeopleData<AcademicList>(
      allowed && canYears && year
        ? `academic-years/${year}/periods?page=1&pageSize=100&search=&status=ALL&sort=name`
        : null,
    ),
    summary = usePeopleData<DashboardSummary>(
      allowed
        ? `dashboard/summary${year || period ? `?${new URLSearchParams({ ...(year ? { academicYearId: year } : {}), ...(period ? { periodId: period } : {}) }).toString()}` : ''}`
        : null,
    );
  if (!allowed)
    return (
      <div className="page-shell">
        <PageHeader description={t('description')} title={t('title')} />
        <p role="alert">{t('forbidden')}</p>
      </div>
    );
  const data = summary.data,
    primaryMoney = data?.money[0];
  const cards = [
    { label: t('students'), value: String(data?.counts['activeStudents'] ?? 0), icon: UsersRound },
    {
      label: t('enrollments'),
      value: String(data?.counts['activeEnrollments'] ?? 0),
      icon: BookOpen,
    },
    {
      label: t('collected'),
      value: primaryMoney
        ? moneyMinor(primaryMoney.netCollectedMinor, primaryMoney.currency, locale)
        : '—',
      icon: CircleDollarSign,
    },
    {
      label: t('documentsReady'),
      value: String(data?.counts['readyDocuments'] ?? 0),
      icon: FileCheck2,
    },
  ];
  return (
    <div className="page-shell" data-dashboard-ready={!summary.loading}>
      <PageHeader
        actions={
          canYears ? (
            <div className="flex flex-wrap gap-3">
              <label className="grid gap-1 text-sm">
                <span>{t('academicYear')}</span>
                <select
                  aria-label={t('academicYear')}
                  className="h-10 min-w-48 rounded-md border bg-background px-3"
                  value={year}
                  onChange={(event) => {
                    setYear(event.target.value);
                    setPeriod('');
                  }}
                >
                  <option value="">{t('activeYear')}</option>
                  {years.data?.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {year ? (
                <label className="grid gap-1 text-sm">
                  <span>{t('academicPeriod')}</span>
                  <select
                    aria-label={t('academicPeriod')}
                    className="h-10 min-w-48 rounded-md border bg-background px-3"
                    value={period}
                    onChange={(event) => setPeriod(event.target.value)}
                  >
                    <option value="">{t('allPeriods')}</option>
                    {periods.data?.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null
        }
        description={t('description')}
        title={t('title')}
      />
      {summary.loading ? <p role="status">{t('loading')}</p> : null}
      {summary.error ? <p role="alert">{t('error')}</p> : null}
      {data ? (
        <>
          <p className="mb-4 text-sm text-muted-foreground">{t('roleView', { role: data.role })}</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <KpiCard
                helper={t('liveData')}
                icon={card.icon}
                key={card.label}
                label={card.label}
                value={card.value}
              />
            ))}
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('classEnrollment')}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.classEnrollment.length ? (
                  <>
                    <MiniChart
                      ariaLabel={t('classEnrollment')}
                      labels={data.classEnrollment.map((item) => item.label)}
                      primary={data.classEnrollment.map((item) => item.value)}
                    />
                    <table className="mt-4 w-full text-sm">
                      <caption className="sr-only">{t('classEnrollment')}</caption>
                      <tbody>
                        {data.classEnrollment.map((item) => (
                          <tr key={item.label}>
                            <th className="border-b p-2 text-start font-normal">{item.label}</th>
                            <td className="border-b p-2 text-end">{item.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <p>{t('empty')}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('delivery')}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.messageDelivery.length ? (
                  <>
                    <MiniChart
                      ariaLabel={t('delivery')}
                      labels={data.messageDelivery.map((item) => item.label)}
                      primary={data.messageDelivery.map((item) => item.value)}
                    />
                    <table className="mt-4 w-full text-sm">
                      <caption className="sr-only">{t('delivery')}</caption>
                      <tbody>
                        {data.messageDelivery.map((item) => (
                          <tr key={item.label}>
                            <th className="border-b p-2 text-start font-normal">{item.label}</th>
                            <td className="border-b p-2 text-end">{item.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <p>{t('empty')}</p>
                )}
              </CardContent>
            </Card>
          </div>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>{t('finance')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {data.money.map((item) => (
                  <div className="rounded-lg border p-3" key={item.currency}>
                    <p className="text-xs text-muted-foreground">{item.currency}</p>
                    <dl className="mt-2 grid gap-1 text-sm">
                      <div className="flex justify-between">
                        <dt>{t('invoiced')}</dt>
                        <dd>{moneyMinor(item.invoicedMinor, item.currency, locale)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>{t('collected')}</dt>
                        <dd>{moneyMinor(item.netCollectedMinor, item.currency, locale)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>{t('reversed')}</dt>
                        <dd>{moneyMinor(item.reversedMinor, item.currency, locale)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>{t('outstanding')}</dt>
                        <dd>{moneyMinor(item.outstandingMinor, item.currency, locale)}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
              {data.money.length === 0 ? <p>{t('empty')}</p> : null}
            </CardContent>
          </Card>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('scopeStudents')}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.students.length ? (
                  <table className="w-full text-sm">
                    <caption className="sr-only">{t('scopeStudents')}</caption>
                    <tbody>
                      {data.students.map((student) => (
                        <tr key={student.id}>
                          <th className="border-b p-2 text-start font-normal">
                            <span className="font-medium">{student.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {student.matricule}
                            </span>
                          </th>
                          <td className="border-b p-2 text-end">
                            {student.className ?? '—'}
                            <span className="block text-xs text-muted-foreground">
                              {student.academicYear ?? '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>{t('empty')}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('academicAverages')}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.academicAverages.length ? (
                  <table className="w-full text-sm">
                    <caption className="sr-only">{t('academicAverages')}</caption>
                    <tbody>
                      {data.academicAverages.map((item) => (
                        <tr key={item.label}>
                          <th className="border-b p-2 text-start font-normal">{item.label}</th>
                          <td className="border-b p-2 text-end">{item.average}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>{t('empty')}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
