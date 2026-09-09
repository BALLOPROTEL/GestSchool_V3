'use client';
import { Button, Input, Label, Textarea } from '@gestschool/ui';
import {
  enrollmentEnd,
  enrollmentTransfer,
  type EnrollmentClassView,
  type EnrollmentView,
  type PageResult,
} from '@gestschool/contracts';
import { useId, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { AcademicDialog } from '../academics/academic-components';
import { usePeopleData } from '../directory/people-hooks';
import { enrollmentRequest, hasEnrollmentPlace } from './enrollment-client';
import {
  EnrollmentCapacity,
  EnrollmentClassPicker,
  EnrollmentError,
} from './enrollment-components';
export type EnrollmentAction = 'confirm' | 'cancel' | 'transfer' | 'complete';
export function EnrollmentActionDialog({
  row,
  action,
  close,
  saved,
}: {
  row: EnrollmentView;
  action: EnrollmentAction;
  close: () => void;
  saved: () => void;
}) {
  const t = useTranslations('EnrollmentFlow');
  const common = useTranslations('Common');
  const id = useId();
  const [classId, setClassId] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(row.enrolledOn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const capacity = usePeopleData<PageResult<EnrollmentClassView>>(
    action === 'transfer' && classId
      ? `enrollment-classes?academicYearId=${row.academicYearId}&classId=${classId}`
      : null,
  );
  const target = capacity.data?.items[0];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const input =
        action === 'confirm'
          ? {}
          : action === 'transfer'
            ? enrollmentTransfer.parse({ targetClassId: classId, reason, effectiveDate: date })
            : enrollmentEnd.parse({ reason, effectiveDate: date });
      await enrollmentRequest(`enrollments/${row.id}/${action}`, input, 'POST');
      saved();
    } catch (issue: unknown) {
      setError(issue);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AcademicDialog
      title={t(action)}
      description={t('actionHint', { name: row.studentName })}
      close={close}
      busy={busy}
    >
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        className="min-w-0 space-y-4"
        data-enrollment-action={action}
      >
        <p className="text-sm [overflow-wrap:anywhere]">
          {row.academicYearName} · {row.className}
        </p>
        {action === 'transfer' ? (
          <>
            <EnrollmentClassPicker
              yearId={row.academicYearId}
              value={classId}
              onChange={setClassId}
              excluded={row.classId}
            />
            {target ? <EnrollmentCapacity classroom={target} /> : null}
            {target && !hasEnrollmentPlace(target) ? (
              <p role="status" className="text-sm text-destructive">
                {t('classFull')}
              </p>
            ) : null}
            {capacity.error ? <EnrollmentError error={capacity.error} /> : null}
          </>
        ) : null}
        {action !== 'confirm' ? (
          <>
            <div className="space-y-1">
              <Label htmlFor={`${id}-date`}>{t('effectiveDate')}</Label>
              <Input
                id={`${id}-date`}
                type="date"
                required
                min={row.enrolledOn}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-reason`}>{t('reason')}</Label>
              <Textarea
                id={`${id}-reason`}
                required
                minLength={3}
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('confirmationHint')}</p>
        )}
        {error ? <EnrollmentError error={error} /> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" disabled={busy} variant="outline" onClick={close}>
            {common('cancel')}
          </Button>
          <Button
            type="submit"
            disabled={
              busy ||
              (action === 'transfer' &&
                (!target || !hasEnrollmentPlace(target) || classId === row.classId))
            }
          >
            {busy ? t('saving') : common('confirm')}
          </Button>
        </div>
      </form>
    </AcademicDialog>
  );
}
