'use client';
import { Input, Label, Select, SelectItem, StatusBadge } from '@gestschool/ui';
import { useId, type ComponentProps } from 'react';
import { useTranslations } from 'next-intl';
import { PeopleError } from '../directory/people-client';
import { resultErrorKey } from './results-client';
export function ResultError({ error }: { error: unknown }) {
  const t = useTranslations('Results');
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {t(resultErrorKey(error))}
      {error instanceof PeopleError && error.requestId ? (
        <span className="block break-all font-mono text-xs">{error.requestId}</span>
      ) : null}
    </p>
  );
}
export function ResultStatus({ status }: { status: string }) {
  const t = useTranslations('Results');
  return (
    <StatusBadge
      dot
      tone={
        status === 'PUBLISHED'
          ? 'success'
          : ['SUBMITTED', 'VALIDATED'].includes(status)
            ? 'warning'
            : 'neutral'
      }
    >
      {t(status)}
    </StatusBadge>
  );
}
export function ResultField({ label, ...props }: ComponentProps<typeof Input> & { label: string }) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}
export function ResultSelect({
  label,
  items,
  ...props
}: ComponentProps<typeof Select> & { label: string; items: { value: string; label: string }[] }) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} {...props}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </Select>
    </div>
  );
}
