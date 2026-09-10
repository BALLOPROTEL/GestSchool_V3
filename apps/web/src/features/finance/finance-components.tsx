'use client';
import { Input, Label, Select, SelectItem, StatusBadge } from '@gestschool/ui';
import { useId, useState, type ComponentProps } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PeopleError } from '../directory/people-client';
import { useDebounced, usePeopleData } from '../directory/people-hooks';
import { financeErrorKey, moneyMinor } from './finance-client';
export function Money({ amount, currency }: { amount: string; currency: string }) {
  const locale = useLocale();
  return (
    <bdi className="font-mono tabular-nums [overflow-wrap:anywhere]">
      {moneyMinor(amount, currency, locale)}
    </bdi>
  );
}
export function FinanceError({ error }: { error: unknown }) {
  const t = useTranslations('FinanceFlow');
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {t(financeErrorKey(error))}
      {error instanceof PeopleError && error.requestId ? (
        <span className="mt-1 block break-all font-mono text-[11px]">{error.requestId}</span>
      ) : null}
    </p>
  );
}
export function FinanceStatus({ status }: { status: string }) {
  const t = useTranslations('FinanceFlow');
  return (
    <StatusBadge
      dot
      tone={
        ['COMPLETED', 'PAID', 'ACTIVE'].includes(status)
          ? 'success'
          : ['PENDING', 'PARTIALLY_PAID', 'ISSUED', 'OPEN'].includes(status)
            ? 'warning'
            : 'neutral'
      }
    >
      {t(status)}
    </StatusBadge>
  );
}
export function FinanceField({
  label,
  ...props
}: ComponentProps<typeof Input> & { label: string }) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}
type LookupRow = {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  code?: string;
  studentName?: string;
  className?: string;
  academicYearName?: string;
  academicYearId?: string;
  invoiceNumber?: string;
  currency?: string;
  openedAt?: string;
  openedByMembershipId?: string;
};
export function FinancePicker({
  path,
  value,
  onChange,
  label,
  required = false,
  defaultLabel,
  filter,
}: {
  path: string | null;
  value: string;
  onChange: (value: string, row?: LookupRow) => void;
  label: string;
  required?: boolean;
  defaultLabel?: string;
  filter?: (row: LookupRow) => boolean;
}) {
  const t = useTranslations('FinanceFlow'),
    id = useId();
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const result = usePeopleData<{ items: LookupRow[]; total: number }>(
    path
      ? `${path}${path.includes('?') ? '&' : '?'}pageSize=25&search=${encodeURIComponent(search)}`
      : null,
  );
  const rows = (result.data?.items ?? []).filter((row) => !filter || filter(row));
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        type="search"
        aria-label={t('searchFor', { entity: label })}
        placeholder={t('searchFor', { entity: label })}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        disabled={!path}
      />
      <Select
        id={id}
        value={value}
        required={required}
        disabled={!path || result.loading}
        onChange={(event) =>
          onChange(
            event.target.value,
            rows.find((row) => row.id === event.target.value),
          )
        }
      >
        <SelectItem value="">{t(required ? 'choose' : 'all')}</SelectItem>
        {value && !rows.some((row) => row.id === value) ? (
          <SelectItem value={value}>{defaultLabel ?? value}</SelectItem>
        ) : null}
        {rows.map((row) => (
          <SelectItem key={row.id} value={row.id}>
            {row.name ??
              row.invoiceNumber ??
              (row.firstName
                ? `${row.firstName} ${row.lastName ?? ''}`
                : row.studentName
                  ? `${row.studentName} · ${row.className ?? ''} · ${row.academicYearName ?? ''}`
                  : row.openedAt
                    ? `${row.currency ?? ''} · ${row.openedAt.slice(0, 16)}`
                    : row.id)}
            {row.code ? ` · ${row.code}` : ''}
          </SelectItem>
        ))}
      </Select>
      {result.loading ? (
        <p role="status" className="text-xs text-muted-foreground">
          {t('loading')}
        </p>
      ) : null}
      {(result.data?.total ?? 0) > 25 ? (
        <p className="text-xs text-muted-foreground">{t('refineSearch')}</p>
      ) : null}
      {result.error ? <FinanceError error={result.error} /> : null}
    </div>
  );
}
