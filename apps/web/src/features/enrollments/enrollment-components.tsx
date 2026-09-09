'use client';
import { Input, Label, Select, SelectItem, StatusBadge } from '@gestschool/ui';
import type { EnrollmentClassView, EnrollmentStatus, PageResult } from '@gestschool/contracts';
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useDebounced, usePeopleData } from '../directory/people-hooks';
import { PeopleError } from '../directory/people-client';
import { enrollmentErrorKey } from './enrollment-client';
export function EnrollmentError({ error }: { error: unknown }) {
  const t = useTranslations('EnrollmentFlow');
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {t(enrollmentErrorKey(error))}
      {error instanceof PeopleError && error.requestId ? (
        <span className="mt-1 block break-all font-mono text-[11px]">{error.requestId}</span>
      ) : null}
    </p>
  );
}
export function EnrollmentStatusBadge({ status }: { status: EnrollmentStatus }) {
  const t = useTranslations('EnrollmentFlow');
  return (
    <StatusBadge
      dot
      tone={status === 'ACTIVE' ? 'success' : status === 'PENDING' ? 'warning' : 'neutral'}
    >
      {t(status)}
    </StatusBadge>
  );
}
export function EnrollmentClassPicker({
  yearId,
  levelId = '',
  value,
  onChange,
  defaultLabel,
  excluded,
}: {
  yearId: string;
  levelId?: string;
  value: string;
  onChange: (value: string) => void;
  defaultLabel?: string;
  excluded?: string;
}) {
  const t = useTranslations('EnrollmentFlow');
  const id = useId();
  const [search, setSearch] = useState('');
  const query = useDebounced(search);
  const result = usePeopleData<PageResult<EnrollmentClassView>>(
    yearId
      ? `enrollment-classes?academicYearId=${yearId}&pageSize=25&search=${encodeURIComponent(query)}${levelId ? `&levelId=${levelId}` : ''}`
      : null,
  );
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id}>{t('class')}</Label>
      <Input
        aria-label={t('searchClass')}
        placeholder={t('searchClass')}
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        disabled={!yearId}
      />
      <Select
        id={id}
        value={value}
        required
        disabled={!yearId || result.loading}
        onChange={(event) => onChange(event.target.value)}
      >
        <SelectItem value="">{t('choose')}</SelectItem>
        {value && !result.data?.items.some((row) => row.id === value) ? (
          <SelectItem value={value}>{defaultLabel ?? value}</SelectItem>
        ) : null}
        {result.data?.items.map((row) => (
          <SelectItem key={row.id} value={row.id} disabled={row.id === excluded}>
            {row.name} ·{' '}
            {row.availablePlaces === null
              ? t('unlimited')
              : t('places', { count: row.availablePlaces })}
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
      {result.error ? <EnrollmentError error={result.error} /> : null}
    </div>
  );
}
export function EnrollmentCapacity({ classroom }: { classroom: EnrollmentClassView }) {
  const t = useTranslations('EnrollmentFlow');
  return (
    <dl
      className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm"
      data-enrollment-capacity
    >
      {[
        [t('capacity'), classroom.capacity ?? t('unlimited')],
        [t('occupied'), classroom.occupiedPlaces],
        [t('reserved'), classroom.pendingEnrollments],
        [t('available'), classroom.availablePlaces ?? t('unlimited')],
      ].map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
