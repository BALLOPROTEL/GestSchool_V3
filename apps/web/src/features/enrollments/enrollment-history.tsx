'use client';
import { Button, Pagination } from '@gestschool/ui';
import type { EnrollmentEventView, EnrollmentView, PageResult } from '@gestschool/contracts';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePeopleData } from '../directory/people-hooks';
import { AcademicDialog } from '../academics/academic-components';
import { EnrollmentError, EnrollmentStatusBadge } from './enrollment-components';
export function EnrollmentHistory({ row, close }: { row: EnrollmentView; close: () => void }) {
  const t = useTranslations('EnrollmentFlow');
  const common = useTranslations('Common');
  const [page, setPage] = useState(1);
  const result = usePeopleData<PageResult<EnrollmentEventView>>(
    `enrollments/${row.id}/events?page=${page}&pageSize=25`,
  );
  return (
    <AcademicDialog
      title={t('history')}
      description={`${row.studentName} · ${row.academicYearName}`}
      close={close}
    >
      <div
        className="min-w-0 space-y-4"
        data-enrollment-history
        data-enrollment-ready={!result.loading}
      >
        <p className="text-sm [overflow-wrap:anywhere]">
          {row.levelName} · {row.className} · {t(row.type ?? 'LEGACY')}
        </p>
        <EnrollmentStatusBadge status={row.status} />
        {result.loading ? (
          <p role="status">{t('loading')}</p>
        ) : result.error ? (
          <EnrollmentError error={result.error} />
        ) : !result.data?.items.length ? (
          <p role="status">{t('legacyHistory')}</p>
        ) : (
          <ol className="space-y-3">
            {result.data.items.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-border p-3 text-sm [overflow-wrap:anywhere]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{t(`event${item.kind}`)}</strong>
                  <span className="font-mono text-xs">{item.effectiveDate}</span>
                </div>
                <p className="mt-2" dir="auto">
                  {item.fromClassName && item.fromClassId !== item.toClassId
                    ? `${item.fromClassName} → ${item.toClassName}`
                    : item.toClassName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(item.toStatus)} · {t(item.type ?? 'LEGACY')}
                </p>
                {item.reason ? <p className="mt-2 whitespace-pre-wrap">{item.reason}</p> : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('actor')}: {item.actorName ?? t('legacyActor')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('recordedAt')}:{' '}
                  <time dateTime={item.recordedAt}>
                    {item.recordedAt.replace('T', ' ').slice(0, 19)} UTC
                  </time>
                </p>
                {item.kind === 'BASELINE' ? (
                  <p className="mt-2 text-xs text-muted-foreground">{t('legacyHistory')}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {(result.data?.total ?? 0) > 25 ? (
          <Pagination
            currentPage={page}
            totalPages={Math.ceil((result.data?.total ?? 0) / 25)}
            onPageChange={setPage}
            labels={{ next: common('next'), previous: common('previous') }}
          />
        ) : null}
        <div className="flex justify-end">
          <Button variant="outline" onClick={close}>
            {common('close')}
          </Button>
        </div>
      </div>
    </AcademicDialog>
  );
}
