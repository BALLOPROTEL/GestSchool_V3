'use client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectItem,
  StatusBadge,
} from '@gestschool/ui';
import type { AcademicView, PageResult, PersonView } from '@gestschool/contracts';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
import { PeopleError } from '../directory/people-client';
import { usePeopleData as useAcademicData, useDebounced } from '../directory/people-hooks';
import { academicErrorKey, academicWritable } from './academic-client';

export function AcademicErrorNotice({ error }: { error: unknown }) {
  const t = useTranslations('Academics');
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {t(academicErrorKey(error))}
      {error instanceof PeopleError && error.requestId ? (
        <span className="mt-1 block break-all font-mono text-[11px]">{error.requestId}</span>
      ) : null}
    </p>
  );
}
export function AcademicStatus({ row }: { row: AcademicView }) {
  const t = useTranslations('Academics');
  return (
    <StatusBadge dot tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
      {t(row.status)}
    </StatusBadge>
  );
}
export function AcademicDialog({
  title,
  description,
  close,
  busy = false,
  children,
}: {
  title: string;
  description: string;
  close: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const common = useTranslations('Common');
  const [opener] = useState(() => document.activeElement);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent
        closeLabel={common('close')}
        className="max-h-[90dvh] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
          else
            document
              .querySelector<HTMLElement>('[data-academic-create], [data-academic-focus]')
              ?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function AcademicPicker({
  path,
  value,
  onChange,
  label,
  name,
  defaultLabel,
  required = false,
  writable = false,
  disabled = false,
}: {
  path: string | null;
  value: string;
  onChange: (value: string) => void;
  label: string;
  name?: string | undefined;
  defaultLabel?: string | undefined;
  required?: boolean;
  writable?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations('Academics');
  const id = useId();
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const result = useAcademicData<PageResult<AcademicView | PersonView>>(
    path
      ? `${path}${path.includes('?') ? '&' : '?'}pageSize=25&search=${encodeURIComponent(search)}`
      : null,
  );
  const items = result.data?.items ?? [];
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        aria-label={t('searchFor', { entity: label })}
        placeholder={t('searchFor', { entity: label })}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        disabled={disabled || !path}
      />
      <Select
        id={id}
        name={name}
        value={value}
        required={required}
        disabled={disabled || !path || result.loading}
        onChange={(event) => onChange(event.target.value)}
      >
        <SelectItem value="">{required ? t('choose') : t('all')}</SelectItem>
        {value && !items.some((row) => row.id === value) ? (
          <SelectItem value={value}>{defaultLabel ?? value}</SelectItem>
        ) : null}
        {items.map((row) => (
          <SelectItem
            key={row.id}
            value={row.id}
            disabled={
              writable && ('firstName' in row ? row.status !== 'ACTIVE' : !academicWritable(row))
            }
          >
            {'firstName' in row ? `${row.firstName} ${row.lastName}` : row.name}
            {'code' in row && row.code ? ` · ${row.code}` : ''}
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
      {result.error ? <AcademicErrorNotice error={result.error} /> : null}
    </div>
  );
}
