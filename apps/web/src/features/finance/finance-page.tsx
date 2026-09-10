'use client';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  KpiCard,
  Pagination,
  Select,
  SelectItem,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type DataTableColumn,
} from '@gestschool/ui';
import type {
  FeeItemView,
  FinanceList,
  FinanceResource,
  FinanceSummary,
  FinanceView,
} from '@gestschool/contracts';
import { AlertCircle, CircleDollarSign, FileText, Plus, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '../auth/auth-provider';
import { useDebounced, usePeopleData } from '../directory/people-hooks';
import { AcademicPicker } from '../academics/academic-components';
import { PageHeader } from '../shared/page-header';
import { SearchField } from '../shared/search-field';
import { Link } from '../../i18n/navigation';
import { canFinance, moneyMinor } from './finance-client';
import { FinanceError, FinanceField, FinanceStatus, Money } from './finance-components';
import { FinanceEditor, type FinanceAction } from './finance-editor';
import { FinanceDetail, financeReference } from './finance-detail';
const resources: FinanceResource[] = [
  'invoices',
  'payments',
  'receipts',
  'fee-types',
  'fee-schedules',
  'cash-sessions',
];
const resourcePermission: Record<FinanceResource, string> = {
  invoices: 'invoices.read',
  payments: 'payments.read',
  receipts: 'receipts.read',
  'fee-types': 'finance.read',
  'fee-schedules': 'finance.read',
  'cash-sessions': 'cash-sessions.read',
};
const statuses: Record<FinanceResource, string[]> = {
  invoices: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'],
  payments: ['PENDING', 'COMPLETED', 'REVERSED', 'FAILED'],
  receipts: [],
  'fee-types': ['ACTIVE', 'ARCHIVED'],
  'fee-schedules': [],
  'cash-sessions': ['OPEN', 'CLOSED'],
};
export function FinancePage() {
  const { session } = useAuth();
  return (
    <FinanceWorkspace key={`${session?.session.tenant.id}:${session?.session.membershipId}`} />
  );
}
export function StudentFinance({ studentId }: { studentId: string }) {
  const { session } = useAuth();
  return (
    <FinanceWorkspace
      key={`${session?.session.tenant.id}:${session?.session.membershipId}:${studentId}`}
      studentId={studentId}
    />
  );
}
function FinanceWorkspace({ studentId }: { studentId?: string }) {
  const t = useTranslations('FinanceFlow'),
    common = useTranslations('Common'),
    nav = useTranslations('Nav'),
    locale = useLocale(),
    { session } = useAuth();
  const can = (permission: string, scoped = true) =>
    canFinance(session?.session, permission, scoped);
  const allowed = can('finance.read'),
    administrative = can('finance.read', false);
  const [resource, setResource] = useState<FinanceResource>('invoices'),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [status, setStatus] = useState('ALL'),
    [sort, setSort] = useState('newest'),
    [year, setYear] = useState(''),
    [classId, setClass] = useState(''),
    [dateFrom, setDateFrom] = useState(''),
    [dateTo, setDateTo] = useState(''),
    [overdue, setOverdue] = useState(false),
    [method, setMethod] = useState('');
  const [revision, setRevision] = useState(0),
    [selection, setSelection] = useState<{ resource: FinanceResource; id: string }>(),
    [editor, setEditor] = useState<{
      action: FinanceAction;
      row?: FinanceView;
      item?: FeeItemView;
    }>();
  const search = useDebounced(query);
  const scope = `${studentId ? `&studentId=${studentId}` : ''}${year ? `&academicYearId=${year}` : ''}${classId ? `&classId=${classId}` : ''}`;
  const path = `finance/${resource}?page=${page}&pageSize=20&search=${encodeURIComponent(search)}&status=${status}&sort=${sort}${scope}${dateFrom ? `&dateFrom=${dateFrom}` : ''}${dateTo ? `&dateTo=${dateTo}` : ''}${resource === 'invoices' && overdue ? '&overdue=true' : ''}${resource === 'payments' && method ? `&paymentMethod=${method}` : ''}`;
  const result = usePeopleData<FinanceList>(
    allowed &&
      can(
        resourcePermission[resource],
        !['fee-types', 'fee-schedules', 'cash-sessions'].includes(resource),
      )
      ? path
      : null,
    revision,
  );
  const summary = usePeopleData<FinanceSummary>(
    allowed ? `finance/summary?${scope.slice(1)}` : null,
    revision,
  );
  const detail = usePeopleData<FinanceView>(
    allowed && selection ? `finance/${selection.resource}/${selection.id}` : null,
    revision,
  );
  function select(next: FinanceResource, id: string) {
    setSelection({ resource: next, id });
  }
  function act(action: FinanceAction, row?: FinanceView, item?: FeeItemView) {
    setEditor({ action, ...(row ? { row } : {}), ...(item ? { item } : {}) });
  }
  const columns: DataTableColumn<FinanceView>[] = [
    {
      id: 'reference',
      header: t('reference'),
      cell: (row) => (
        <span className="font-mono text-xs font-semibold">{financeReference(row)}</span>
      ),
    },
    ...(resource === 'invoices'
      ? [
          {
            id: 'student',
            header: t('student'),
            cell: (row: FinanceView) =>
              row.kind === 'invoices' ? (
                <div>
                  <Link
                    className="font-semibold hover:text-primary"
                    href={`/students/${row.studentId}`}
                  >
                    {row.studentName}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{row.className}</span>
                </div>
              ) : null,
          },
        ]
      : []),
    ...(['invoices', 'payments', 'receipts', 'cash-sessions'].includes(resource)
      ? [
          {
            id: 'amount',
            header: t(resource === 'cash-sessions' ? 'expected' : 'total'),
            cell: (row: FinanceView) =>
              'currency' in row ? (
                <Money
                  amount={
                    row.kind === 'invoices'
                      ? row.totalAmountMinor
                      : row.kind === 'cash-sessions'
                        ? row.expectedClosingAmountMinor
                        : 'amountMinor' in row
                          ? row.amountMinor
                          : '0'
                  }
                  currency={row.currency}
                />
              ) : null,
          },
        ]
      : []),
    ...(resource === 'invoices'
      ? [
          {
            id: 'paid',
            header: t('paid'),
            cell: (row: FinanceView) =>
              row.kind === 'invoices' ? (
                <Money amount={row.paidMinor} currency={row.currency} />
              ) : null,
          },
          {
            id: 'balance',
            header: t('balance'),
            cell: (row: FinanceView) =>
              row.kind === 'invoices' ? (
                <Money amount={row.balanceMinor} currency={row.currency} />
              ) : null,
          },
          {
            id: 'due',
            header: t('dueOn'),
            cell: (row: FinanceView) => (row.kind === 'invoices' ? row.dueOn : null),
          },
        ]
      : []),
    ...(resource === 'payments'
      ? [
          {
            id: 'method',
            header: t('method'),
            cell: (row: FinanceView) => (row.kind === 'payments' ? t(row.method) : null),
          },
        ]
      : []),
    {
      id: 'status',
      header: t('status'),
      cell: (row) =>
        row.kind === 'fee-types' ? (
          <FinanceStatus status={row.archivedAt ? 'ARCHIVED' : 'ACTIVE'} />
        ) : row.kind === 'receipts' ? (
          <FinanceStatus status={row.paymentStatus} />
        ) : 'status' in row ? (
          <div>
            <FinanceStatus status={row.status} />
            {row.kind === 'payments' && row.cancellationRequestedAt ? (
              <span className="block text-xs">{t('cancellationRequested')}</span>
            ) : null}
          </div>
        ) : row.kind === 'fee-schedules' ? (
          row.yearName
        ) : null,
    },
    {
      id: 'actions',
      header: common('actions'),
      cell: (row) => (
        <Button size="sm" variant="ghost" onClick={() => select(row.kind, row.id)}>
          {t('details')}
        </Button>
      ),
    },
  ];
  const available = resources.filter(
    (r) =>
      (!studentId || ['invoices', 'payments', 'receipts'].includes(r)) &&
      can(resourcePermission[r], !['fee-types', 'fee-schedules', 'cash-sessions'].includes(r)),
  );
  const busy = result.loading || summary.loading;
  return (
    <section
      className={studentId ? 'min-w-0 p-4' : 'page-shell'}
      data-finance-ready={String(!busy)}
      aria-busy={busy}
    >
      {!studentId ? (
        <PageHeader
          title={t('title')}
          description={t('description')}
          eyebrow={nav('administration')}
          actions={
            allowed ? (
              <>
                {can('fee-types.create', false) ? (
                  <Button size="sm" variant="outline" onClick={() => act('createFee')}>
                    {t('createFee')}
                  </Button>
                ) : null}
                {can('fee-schedules.create', false) ? (
                  <Button size="sm" variant="outline" onClick={() => act('createSchedule')}>
                    {t('createSchedule')}
                  </Button>
                ) : null}
                {can('invoices.create', false) ? (
                  <Button size="sm" onClick={() => act('createInvoice')}>
                    <Plus />
                    {t('createInvoice')}
                  </Button>
                ) : null}
                {can('cash-sessions.open', false) ? (
                  <Button size="sm" variant="outline" onClick={() => act('openCash')}>
                    {t('openCash')}
                  </Button>
                ) : null}
              </>
            ) : null
          }
        />
      ) : null}
      {!allowed ? (
        <p className="rounded-lg border p-5 text-sm" data-finance-denied>
          {t('forbidden')}
        </p>
      ) : (
        <>
          {summary.error ? <FinanceError error={summary.error} /> : null}
          {summary.data?.currencies.map((group) => (
            <div key={group.currency} className="mb-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&_p]:[overflow-wrap:anywhere]">
                <KpiCard
                  icon={FileText}
                  label={`${t('invoiced')} · ${group.currency}`}
                  value={moneyMinor(group.invoicedMinor, group.currency, locale)}
                />
                <KpiCard
                  icon={CircleDollarSign}
                  label={t('collected')}
                  value={moneyMinor(group.collectedMinor, group.currency, locale)}
                />
                <KpiCard
                  icon={TrendingUp}
                  label={t('balance')}
                  value={moneyMinor(group.outstandingMinor, group.currency, locale)}
                />
                <KpiCard
                  icon={AlertCircle}
                  label={t('overdue')}
                  value={moneyMinor(group.overdueMinor, group.currency, locale)}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t('todayPayments')}:{' '}
                <Money amount={group.todayPaymentsMinor} currency={group.currency} /> ·{' '}
                {t('unpaid')}: {group.unpaidInvoices}
              </p>
            </div>
          ))}
          <Tabs
            value={resource}
            onValueChange={(value) => {
              if (available.includes(value as FinanceResource)) {
                setResource(value as FinanceResource);
                setPage(1);
                setStatus('ALL');
                setSelection(undefined);
              }
            }}
          >
            <div className="max-w-full overflow-x-auto pb-1">
              <TabsList>
                {available.map((r) => (
                  <TabsTrigger key={r} value={r}>
                    {t(r)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <TabsContent value={resource}>
              <Card className="mt-4">
                <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  <SearchField
                    label={t('search')}
                    placeholder={t('search')}
                    value={query}
                    onChange={(value) => {
                      setQuery(value);
                      setPage(1);
                    }}
                  />
                  <Select
                    aria-label={t('status')}
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(1);
                    }}
                  >
                    <SelectItem value="ALL">{t('all')}</SelectItem>
                    {statuses[resource].map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(s)}
                      </SelectItem>
                    ))}
                  </Select>
                  <Select
                    aria-label={t('sort')}
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value);
                      setPage(1);
                    }}
                  >
                    <SelectItem value="newest">{t('newest')}</SelectItem>
                    <SelectItem value="oldest">{t('oldest')}</SelectItem>
                  </Select>
                  {administrative &&
                  can('academic-years.read', false) &&
                  !['fee-types', 'cash-sessions'].includes(resource) ? (
                    <AcademicPicker
                      label={t('year')}
                      path="academic-years"
                      value={year}
                      onChange={(value) => {
                        setYear(value);
                        setClass('');
                        setPage(1);
                      }}
                    />
                  ) : null}
                  {administrative &&
                  can('classes.read', false) &&
                  ['invoices', 'fee-schedules', 'payments', 'receipts'].includes(resource) ? (
                    <AcademicPicker
                      label={t('class')}
                      path={year ? `classes?academicYearId=${year}` : null}
                      value={classId}
                      onChange={(value) => {
                        setClass(value);
                        setPage(1);
                      }}
                    />
                  ) : null}
                  {['invoices', 'payments', 'receipts', 'cash-sessions'].includes(resource) ? (
                    <>
                      <FinanceField
                        label={t('dateFrom')}
                        type="date"
                        value={dateFrom}
                        onChange={(e) => {
                          setDateFrom(e.target.value);
                          setPage(1);
                        }}
                      />
                      <FinanceField
                        label={t('dateTo')}
                        type="date"
                        value={dateTo}
                        onChange={(e) => {
                          setDateTo(e.target.value);
                          setPage(1);
                        }}
                      />
                    </>
                  ) : null}
                  {resource === 'invoices' ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={overdue}
                        onChange={(e) => {
                          setOverdue(e.target.checked);
                          setPage(1);
                        }}
                      />
                      {t('overdueOnly')}
                    </label>
                  ) : null}
                  {resource === 'payments' ? (
                    <Select
                      aria-label={t('method')}
                      value={method}
                      onChange={(e) => {
                        setMethod(e.target.value);
                        setPage(1);
                      }}
                    >
                      <SelectItem value="">{t('all')}</SelectItem>
                      {['CASH', 'BANK_TRANSFER', 'CHECK', 'OTHER'].map((m) => (
                        <SelectItem key={m} value={m}>
                          {t(m)}
                        </SelectItem>
                      ))}
                    </Select>
                  ) : null}
                </CardContent>
              </Card>
              {result.error ? <FinanceError error={result.error} /> : null}
              <Card className="mt-5 overflow-hidden">
                <CardHeader>
                  <CardTitle>{t(resource)}</CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <DataTable
                    caption={t(resource)}
                    columns={columns}
                    getRowId={(row) => row.id}
                    minWidth={resource === 'invoices' ? 980 : 680}
                    rows={result.data?.items ?? []}
                    emptyState={
                      <p role="status" className="p-5 text-sm text-muted-foreground">
                        {t(result.loading ? 'loading' : 'empty')}
                      </p>
                    }
                  />
                </CardContent>
              </Card>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {t('results', { count: result.data?.total ?? 0 })}
                </p>
                <Pagination
                  currentPage={page}
                  totalPages={Math.max(1, Math.ceil((result.data?.total ?? 0) / 20))}
                  onPageChange={setPage}
                  labels={{ next: common('next'), previous: common('previous') }}
                />
              </div>
              {detail.loading ? (
                <p role="status" className="p-3 text-sm">
                  {t('loading')}
                </p>
              ) : null}
              {detail.error ? <FinanceError error={detail.error} /> : null}
              {detail.data ? (
                <FinanceDetail
                  row={detail.data}
                  act={act}
                  select={select}
                  close={() => setSelection(undefined)}
                />
              ) : null}
            </TabsContent>
          </Tabs>
          {editor ? (
            <FinanceEditor
              {...editor}
              close={() => setEditor(undefined)}
              saved={(row) => {
                setEditor(undefined);
                setRevision((value) => value + 1);
                select(row.kind, row.id);
              }}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
