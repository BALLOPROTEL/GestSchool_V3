'use client';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@gestschool/ui';
import type { FeeItemView, FinanceResource, FinanceView } from '@gestschool/contracts';
import { useTranslations } from 'next-intl';
import { useAuth } from '../auth/auth-provider';
import { canFinance } from './finance-client';
import { Money, FinanceStatus } from './finance-components';
import type { FinanceAction } from './finance-editor';
export function financeReference(row: FinanceView) {
  return row.kind === 'invoices'
    ? row.invoiceNumber
    : row.kind === 'payments'
      ? row.paymentReference
      : row.kind === 'receipts'
        ? row.receiptNumber
        : row.kind === 'cash-sessions'
          ? row.openedAt.slice(0, 16)
          : `${row.code} · ${row.name}`;
}
export function FinanceDetail({
  row,
  act,
  select,
  close,
}: {
  row: FinanceView;
  act: (action: FinanceAction, row: FinanceView, item?: FeeItemView) => void;
  select: (resource: FinanceResource, id: string) => void;
  close: () => void;
}) {
  const t = useTranslations('FinanceFlow'),
    { session } = useAuth();
  const can = (permission: string) => canFinance(session?.session, permission, false);
  const button = (action: FinanceAction, permission: string, condition = true) =>
    can(permission) && condition ? (
      <Button
        key={action}
        type="button"
        size="sm"
        variant="outline"
        onClick={() => act(action, row)}
      >
        {t(action)}
      </Button>
    ) : null;
  return (
    <Card className="mt-5 min-w-0 overflow-hidden" data-finance-detail={row.kind}>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle className="break-all">{financeReference(row)}</CardTitle>
        <Button size="sm" variant="ghost" onClick={close}>
          {t('closeDetails')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {row.kind === 'fee-types' ? (
            <>
              {button('editFee', 'fee-types.update')}
              {button(row.archivedAt ? 'restoreFee' : 'archiveFee', 'fee-types.update')}
            </>
          ) : null}
          {row.kind === 'fee-schedules' ? (
            <>
              {button('editSchedule', 'fee-schedules.update')}
              {button('addItem', 'fee-schedules.update')}
            </>
          ) : null}
          {row.kind === 'invoices' ? (
            <>
              {button(
                'createPayment',
                'payments.create',
                !['DRAFT', 'VOID', 'PAID'].includes(row.status) && BigInt(row.balanceMinor) > 0n,
              )}
              {button('adjustInvoice', 'invoices.adjust', !['DRAFT', 'VOID'].includes(row.status))}
              {button(
                'voidInvoice',
                'invoices.adjust',
                !['DRAFT', 'VOID'].includes(row.status) && row.paidMinor === '0',
              )}
            </>
          ) : null}
          {row.kind === 'payments' ? (
            <>
              {button('validatePayment', 'payments.validate', row.status === 'PENDING')}
              {button('rejectPayment', 'payments.validate', row.status === 'PENDING')}
              {button(
                'requestCancellation',
                'payments.cancel',
                row.status === 'COMPLETED' && !row.cancellationRequestedAt,
              )}
              {button(
                'cancelPayment',
                'payments.cancel',
                row.status === 'COMPLETED' && Boolean(row.cancellationRequestedAt),
              )}
            </>
          ) : null}
          {row.kind === 'cash-sessions'
            ? button(
                'closeCash',
                'cash-sessions.close',
                row.status === 'OPEN' && row.openedByMembershipId === session?.session.membershipId,
              )
            : null}
        </div>
        {row.kind === 'fee-types' ? (
          <FinanceStatus status={row.archivedAt ? 'ARCHIVED' : 'ACTIVE'} />
        ) : null}
        {row.kind === 'fee-schedules' ? (
          <>
            <p className="text-sm">
              {row.yearName} · {row.currency}
            </p>
            {row.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('empty')}</p>
            ) : null}
            {row.items.map((item) => (
              <article key={item.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{item.name}</h3>
                  <Money amount={item.amountMinor} currency={item.currency} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('dueOn')}: {item.dueOn}
                </p>
                {item.installments.map((part) => (
                  <div key={part.id} className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
                    <span>
                      {t('installmentNumber', { number: part.ordinal })} · {part.dueOn}
                    </span>
                    <Money amount={part.amountMinor} currency={part.currency} />
                  </div>
                ))}
                {can('fee-schedules.update') ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => act('editItem', row, item)}>
                      {t('editItem')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => act('deleteItem', row, item)}>
                      {t('deleteItem')}
                    </Button>
                  </div>
                ) : null}
              </article>
            ))}
          </>
        ) : null}
        {row.kind === 'invoices' ? (
          <>
            <p className="text-sm">
              {row.studentName} · {row.className} · {row.yearName}
            </p>
            <FinanceStatus status={row.status} />
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {(
                [
                  ['subtotal', row.subtotalMinor],
                  ['adjustments', row.adjustmentsMinor],
                  ['total', row.totalAmountMinor],
                  ['paid', row.paidMinor],
                  ['balance', row.balanceMinor],
                ] as const
              ).map(([label, amount]) => (
                <div key={label} className="min-w-0 rounded-lg bg-muted p-3">
                  <dt className="text-xs text-muted-foreground">{t(label)}</dt>
                  <dd className="mt-1 font-semibold">
                    <Money amount={amount} currency={row.currency} />
                  </dd>
                </div>
              ))}
            </dl>
            <h3 className="font-semibold">{t('lines')}</h3>
            {row.lines.map((line) => (
              <article key={line.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>
                    {line.description}
                    {line.ordinal ? ` · ${t('installmentNumber', { number: line.ordinal })}` : ''}
                  </span>
                  <Money amount={line.totalAmountMinor} currency={line.currency} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('dueOn')}: {line.dueOn} · {t('balance')}:{' '}
                  <Money amount={line.balanceMinor} currency={line.currency} />
                </p>
              </article>
            ))}
            {row.adjustments.length ? <h3 className="font-semibold">{t('adjustments')}</h3> : null}
            {row.adjustments.map((a) => (
              <article key={a.id} className="rounded-lg border p-3 text-sm">
                <p>
                  {t(a.kind)} · <Money amount={a.amountMinor} currency={a.currency} />
                </p>
                <p className="break-words">{a.reason}</p>
                <p className="break-all text-xs text-muted-foreground">
                  {a.createdAt} · {t('actor')}: {a.actorMembershipId}
                </p>
              </article>
            ))}
          </>
        ) : null}
        {row.kind === 'payments' ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <FinanceStatus status={row.status} />
              <Money amount={row.amountMinor} currency={row.currency} />
              <span className="text-sm">{t(row.method)}</span>
            </div>
            {row.cancellationRequestedAt ? (
              <p className="break-words rounded-lg bg-muted p-3 text-sm">
                {t('cancellationRequested')}: {row.cancellationReason} ·{' '}
                {row.cancellationRequestedAt}
              </p>
            ) : null}
            <h3 className="font-semibold">{t('allocations')}</h3>
            {row.allocations.map((a) => (
              <div
                key={a.invoiceId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <Button size="sm" variant="ghost" onClick={() => select('invoices', a.invoiceId)}>
                  {t('invoices')} · {t('details')}
                </Button>
                <Money amount={a.amountMinor} currency={a.currency} />
              </div>
            ))}
            {row.receipts.length ? <h3 className="font-semibold">{t('receipts')}</h3> : null}
            {row.receipts.map((receipt) => (
              <Button
                key={receipt.id}
                size="sm"
                variant="outline"
                onClick={() => select('receipts', receipt.id)}
              >
                {receipt.receiptNumber}
              </Button>
            ))}
            {row.reversals.length ? <h3 className="font-semibold">{t('reversals')}</h3> : null}
            {row.reversals.map((r) => (
              <article key={r.id} className="rounded-lg border p-3 text-sm">
                <p>
                  {r.reversalReference} · <Money amount={r.amountMinor} currency={r.currency} />
                </p>
                <p className="break-words">{r.reason}</p>
                <p className="break-all text-xs text-muted-foreground">
                  {r.reversedAt} · {t('actor')}: {r.actorMembershipId}
                </p>
              </article>
            ))}
          </>
        ) : null}
        {row.kind === 'receipts' ? (
          <>
            <FinanceStatus status={row.paymentStatus} />
            <p>
              <Money amount={row.amountMinor} currency={row.currency} />
            </p>
            <p className="text-sm">{row.issuedAt}</p>
            <p className="text-xs text-muted-foreground">{t('receiptHint')}</p>
            <Button size="sm" variant="outline" onClick={() => select('payments', row.paymentId)}>
              {t('payments')} · {t('details')}
            </Button>
          </>
        ) : null}
        {row.kind === 'cash-sessions' ? (
          <>
            <FinanceStatus status={row.status} />
            <dl className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ['opening', row.openingAmountMinor],
                  ['expected', row.expectedClosingAmountMinor],
                  ['declared', row.closingAmountMinor],
                  ['difference', row.differenceAmountMinor],
                ] as const
              ).map(([label, amount]) =>
                amount === null ? null : (
                  <div key={label} className="min-w-0 rounded-lg bg-muted p-3">
                    <dt className="text-xs text-muted-foreground">{t(label)}</dt>
                    <dd>
                      <Money amount={amount} currency={row.currency} />
                    </dd>
                  </div>
                ),
              )}
            </dl>
            <p className="break-words text-sm">{row.closingReason}</p>
            <p className="break-all text-xs text-muted-foreground">
              {row.openedAt} {row.closedAt ? ` → ${row.closedAt}` : ''}
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
