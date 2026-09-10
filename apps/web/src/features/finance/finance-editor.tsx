'use client';
import { Button, Label, Select, SelectItem } from '@gestschool/ui';
import {
  currencyDecimals,
  financeCurrency,
  type FeeItemView,
  type FinanceCurrency,
  type FinanceView,
} from '@gestschool/contracts';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { AcademicDialog, AcademicPicker } from '../academics/academic-components';
import { useAuth } from '../auth/auth-provider';
import { FinanceError, FinanceField, FinancePicker, Money } from './finance-components';
import { financeRequest, parseMoney } from './finance-client';
export type FinanceAction =
  | 'createFee'
  | 'editFee'
  | 'archiveFee'
  | 'restoreFee'
  | 'createSchedule'
  | 'editSchedule'
  | 'addItem'
  | 'editItem'
  | 'deleteItem'
  | 'createInvoice'
  | 'adjustInvoice'
  | 'voidInvoice'
  | 'createPayment'
  | 'validatePayment'
  | 'rejectPayment'
  | 'requestCancellation'
  | 'cancelPayment'
  | 'openCash'
  | 'closeCash';
function inputMoney(amount: string, currency: FinanceCurrency) {
  const dec = currencyDecimals[currency],
    scale = 10n ** BigInt(dec),
    value = BigInt(amount);
  return `${value / scale}${dec ? `.${String(value % scale).padStart(dec, '0')}` : ''}`;
}
export function FinanceEditor({
  action,
  row,
  item,
  close,
  saved,
}: {
  action: FinanceAction;
  row?: FinanceView;
  item?: FeeItemView;
  close: () => void;
  saved: (row: FinanceView) => void;
}) {
  const t = useTranslations('FinanceFlow'),
    common = useTranslations('Common'),
    { session } = useAuth();
  const [currency, setCurrency] = useState<FinanceCurrency>(
    financeCurrency.parse(row && 'currency' in row ? row.currency : 'XOF'),
  );
  const [year, setYear] = useState(row?.kind === 'fee-schedules' ? row.academicYearId : '');
  const [level, setLevel] = useState(row?.kind === 'fee-schedules' ? (row.levelId ?? '') : '');
  const [classId, setClass] = useState(row?.kind === 'fee-schedules' ? (row.classId ?? '') : '');
  const [student, setStudent] = useState(row?.kind === 'invoices' ? row.studentId : '');
  const [enrollment, setEnrollment] = useState(''),
    [schedule, setSchedule] = useState(''),
    [fee, setFee] = useState(item?.feeTypeId ?? '');
  const [method, setMethod] = useState('BANK_TRANSFER'),
    [cash, setCash] = useState(''),
    [kind, setKind] = useState('DISCOUNT');
  const [parts, setParts] = useState(
    () =>
      item?.installments.map((p) => ({
        key: p.id,
        amount: inputMoney(p.amountMinor, currency),
        dueOn: p.dueOn,
      })) ?? [],
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  // Retained across transport/refresh retries. A changed payload receives a new explicit attempt.
  const [attempt, setAttempt] = useState<{ payload: string; key: string }>();
  const feeForm = action === 'createFee' || action === 'editFee',
    scheduleForm = action === 'createSchedule' || action === 'editSchedule',
    itemForm = action === 'addItem' || action === 'editItem';
  const cashPicker =
    (action === 'createPayment' && method === 'CASH') ||
    (action === 'cancelPayment' && row?.kind === 'payments' && row.method === 'CASH');
  const needsReason = [
    'rejectPayment',
    'adjustInvoice',
    'voidInvoice',
    'requestCancellation',
    'cancelPayment',
    'closeCash',
  ].includes(action);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget),
      get = (key: string) => String(form.get(key) ?? '');
    setBusy(true);
    setError(undefined);
    try {
      let path = '',
        body: unknown = {},
        verb = 'POST',
        key: string | undefined;
      if (feeForm) {
        path = action === 'editFee' ? `fee-types/${row?.id}` : 'fee-types';
        verb = action === 'editFee' ? 'PATCH' : 'POST';
        body = { code: get('code'), name: get('name') };
      } else if (action === 'archiveFee' || action === 'restoreFee')
        path = `fee-types/${row?.id}/${action === 'archiveFee' ? 'archive' : 'restore'}`;
      else if (scheduleForm) {
        path = action === 'editSchedule' ? `fee-schedules/${row?.id}` : 'fee-schedules';
        verb = action === 'editSchedule' ? 'PATCH' : 'POST';
        body = {
          code: get('code'),
          name: get('name'),
          academicYearId: year,
          levelId: level || null,
          classId: classId || null,
          currency,
        };
      } else if (itemForm) {
        path = `fee-schedules/${row?.id}/items${item ? `/${item.id}` : ''}`;
        verb = item ? 'PATCH' : 'POST';
        body = {
          feeTypeId: fee,
          amountMinor: parseMoney(get('amount'), currency),
          dueOn: get('dueOn'),
          installments: parts.map((p, index) => ({
            amountMinor: parseMoney(p.amount, currency),
            dueOn: p.dueOn,
            ordinal: index + 1,
          })),
        };
      } else if (action === 'deleteItem') {
        path = `fee-schedules/${row?.id}/items/${item?.id}`;
        verb = 'DELETE';
      } else if (action === 'createInvoice') {
        path = 'invoices';
        body = {
          studentId: student,
          enrollmentId: enrollment,
          feeScheduleId: schedule,
          issuedOn: get('issuedOn'),
        };
      } else if (action === 'adjustInvoice') {
        path = `invoices/${row?.id}/adjustments`;
        body = {
          kind,
          amountMinor: `${['DISCOUNT', 'SCHOLARSHIP', 'CREDIT'].includes(kind) || (kind === 'CORRECTION' && get('sign') === 'negative') ? '-' : ''}${parseMoney(get('amount'), currency)}`,
          reason: get('reason'),
        };
      } else if (action === 'voidInvoice') {
        path = `invoices/${row?.id}/void`;
        body = { reason: get('reason') };
      } else if (action === 'createPayment') {
        path = 'payments';
        body = {
          studentId: student,
          amountMinor: parseMoney(get('amount'), currency),
          currency,
          method,
          cashSessionId: method === 'CASH' ? cash : null,
          allocations: [{ invoiceId: row?.id, amountMinor: parseMoney(get('amount'), currency) }],
        };
        const payload = JSON.stringify(body);
        key = attempt?.payload === payload ? attempt.key : crypto.randomUUID();
        setAttempt({ payload, key });
      } else if (action === 'rejectPayment') {
        path = `payments/${row?.id}/reject`;
        body = { reason: get('reason') };
      } else if (action === 'validatePayment') path = `payments/${row?.id}/validate`;
      else if (action === 'requestCancellation') {
        path = `payments/${row?.id}/request-cancellation`;
        body = { reason: get('reason') };
      } else if (action === 'cancelPayment') {
        path = `payments/${row?.id}/cancel`;
        body = { reason: get('reason'), cashSessionId: cashPicker ? cash : null };
      } else if (action === 'openCash') {
        path = 'cash-sessions/open';
        body = { currency, openingAmountMinor: parseMoney(get('amount'), currency) };
      } else if (action === 'closeCash') {
        path = `cash-sessions/${row?.id}/close`;
        body = { closingAmountMinor: parseMoney(get('amount'), currency), reason: get('reason') };
      }
      saved(await financeRequest<FinanceView>(path, body, verb, key));
    } catch (cause: unknown) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AcademicDialog title={t(action)} description={t('workflowHint')} close={close} busy={busy}>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        className="space-y-4"
      >
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          {feeForm || scheduleForm ? (
            <>
              <FinanceField
                label={t('code')}
                name="code"
                required
                maxLength={40}
                defaultValue={row && 'code' in row ? row.code : ''}
              />
              <FinanceField
                label={t('name')}
                name="name"
                required
                maxLength={120}
                defaultValue={row && 'name' in row ? row.name : ''}
              />
            </>
          ) : null}
          {scheduleForm || action === 'openCash' ? (
            <label className="block space-y-1 text-sm font-medium">
              {t('currency')}
              <Select
                value={currency}
                onChange={(e) => setCurrency(financeCurrency.parse(e.target.value))}
              >
                {Object.keys(currencyDecimals).map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </Select>
            </label>
          ) : null}
          {scheduleForm ? (
            <>
              <AcademicPicker
                label={t('year')}
                path="academic-years"
                value={year}
                required
                onChange={(value) => {
                  setYear(value);
                  setClass('');
                }}
              />
              <AcademicPicker
                label={t('level')}
                path="levels?status=ACTIVE"
                value={level}
                onChange={(value) => {
                  setLevel(value);
                  setClass('');
                }}
              />
              <AcademicPicker
                label={t('class')}
                path={
                  year
                    ? `classes?academicYearId=${year}&status=ACTIVE${level ? `&levelId=${level}` : ''}`
                    : null
                }
                value={classId}
                onChange={setClass}
              />
            </>
          ) : null}
          {itemForm ? (
            <FinancePicker
              label={t('feeType')}
              path="finance/fee-types?status=ACTIVE"
              value={fee}
              required
              onChange={setFee}
              {...(item ? { defaultLabel: item.name } : {})}
            />
          ) : null}
          {action === 'createInvoice' ? (
            <>
              <AcademicPicker
                label={t('student')}
                path="students?status=ACTIVE"
                value={student}
                required
                onChange={(value) => {
                  setStudent(value);
                  setEnrollment('');
                  setYear('');
                  setSchedule('');
                }}
              />
              <FinancePicker
                label={t('enrollment')}
                path={student ? `students/${student}/enrollments?status=ACTIVE` : null}
                value={enrollment}
                required
                onChange={(value, selected) => {
                  setEnrollment(value);
                  setYear(selected?.academicYearId ?? '');
                  setSchedule('');
                }}
              />
              <FinancePicker
                label={t('schedule')}
                path={year ? `finance/fee-schedules?academicYearId=${year}` : null}
                value={schedule}
                required
                onChange={setSchedule}
              />
              <FinanceField
                label={t('issuedOn')}
                name="issuedOn"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </>
          ) : null}
          {action === 'createPayment' && row?.kind === 'invoices' ? (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-semibold">
                {row.invoiceNumber} · {row.studentName}
              </p>
              <p>
                {t('balance')}: <Money amount={row.balanceMinor} currency={row.currency} />
              </p>
            </div>
          ) : null}
          {action === 'adjustInvoice' ? (
            <>
              <label className="block space-y-1 text-sm font-medium">
                {t('adjustmentKind')}
                <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                  {['DISCOUNT', 'SCHOLARSHIP', 'CREDIT', 'DEBIT', 'CORRECTION'].map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(value)}
                    </SelectItem>
                  ))}
                </Select>
              </label>
              {kind === 'CORRECTION' ? (
                <label className="block space-y-1 text-sm font-medium">
                  {t('direction')}
                  <Select name="sign">
                    <SelectItem value="negative">{t('decrease')}</SelectItem>
                    <SelectItem value="positive">{t('increase')}</SelectItem>
                  </Select>
                </label>
              ) : null}
            </>
          ) : null}
          {itemForm ||
          ['createPayment', 'adjustInvoice', 'openCash', 'closeCash'].includes(action) ? (
            <FinanceField
              label={`${t(action === 'closeCash' ? 'declared' : action === 'openCash' ? 'opening' : 'amount')} (${currency})`}
              name="amount"
              inputMode="decimal"
              required
              maxLength={24}
              defaultValue={item ? inputMoney(item.amountMinor, currency) : ''}
            />
          ) : null}
          {itemForm ? (
            <>
              <FinanceField
                label={t('dueOn')}
                name="dueOn"
                type="date"
                required
                defaultValue={item?.dueOn ?? ''}
              />
              <div className="space-y-2">
                <Label>{t('installments')}</Label>
                <p className="text-xs text-muted-foreground">{t('installmentHint')}</p>
                {parts.map((part, index) => (
                  <fieldset key={part.key} className="min-w-0 rounded-lg border p-3">
                    <legend className="px-1 text-xs">
                      {t('installmentNumber', { number: index + 1 })}
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <FinanceField
                        label={`${t('amount')} (${currency})`}
                        inputMode="decimal"
                        required
                        value={part.amount}
                        onChange={(e) =>
                          setParts((rows) =>
                            rows.map((p) =>
                              p.key === part.key ? { ...p, amount: e.target.value } : p,
                            ),
                          )
                        }
                      />
                      <FinanceField
                        label={t('dueOn')}
                        type="date"
                        required
                        value={part.dueOn}
                        onChange={(e) =>
                          setParts((rows) =>
                            rows.map((p) =>
                              p.key === part.key ? { ...p, dueOn: e.target.value } : p,
                            ),
                          )
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setParts((rows) => rows.filter((p) => p.key !== part.key))}
                    >
                      {t('removeInstallment')}
                    </Button>
                  </fieldset>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={parts.length >= 100}
                  onClick={() =>
                    setParts((rows) => [
                      ...rows,
                      { key: crypto.randomUUID(), amount: '', dueOn: '' },
                    ])
                  }
                >
                  {t('addInstallment')}
                </Button>
              </div>
            </>
          ) : null}
          {action === 'createPayment' ? (
            <label className="block space-y-1 text-sm font-medium">
              {t('method')}
              <Select
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value);
                  setCash('');
                }}
              >
                {['CASH', 'BANK_TRANSFER', 'CHECK', 'OTHER'].map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(value)}
                  </SelectItem>
                ))}
              </Select>
            </label>
          ) : null}
          {cashPicker ? (
            <FinancePicker
              label={t('cashSession')}
              path="finance/cash-sessions?status=OPEN"
              value={cash}
              required
              onChange={setCash}
              filter={(choice) =>
                choice.openedByMembershipId === session?.session.membershipId &&
                choice.currency === currency
              }
            />
          ) : null}
          {action === 'closeCash' && row?.kind === 'cash-sessions' ? (
            <p className="text-sm">
              {t('expected')}:{' '}
              <Money amount={row.expectedClosingAmountMinor} currency={row.currency} />
            </p>
          ) : null}
          {needsReason ? (
            <FinanceField
              label={t('reason')}
              name="reason"
              required
              minLength={3}
              maxLength={500}
            />
          ) : null}
          {!feeForm &&
          !scheduleForm &&
          !itemForm &&
          !['createInvoice', 'createPayment', 'openCash', 'closeCash', 'adjustInvoice'].includes(
            action,
          ) ? (
            <p className="break-words text-sm">
              {t('confirmAction')}
              {row && 'paymentReference' in row
                ? ` · ${row.paymentReference}`
                : row && 'name' in row
                  ? ` · ${row.name}`
                  : ''}
            </p>
          ) : null}
        </fieldset>
        {error ? <FinanceError error={error} /> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={close}>
            {common('cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? t('saving') : t('confirm')}
          </Button>
        </div>
      </form>
    </AcademicDialog>
  );
}
