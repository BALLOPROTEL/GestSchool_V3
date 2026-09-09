'use client';
import { Button, Input, Label, Select, SelectItem } from '@gestschool/ui';
import {
  enrollmentCreate,
  enrollmentUpdate,
  type AcademicView,
  type EnrollmentClassView,
  type EnrollmentView,
  type PageResult,
  type PersonView,
} from '@gestschool/contracts';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { AcademicDialog, AcademicPicker } from '../academics/academic-components';
import { usePeopleData } from '../directory/people-hooks';
import { enrollmentRequest, hasEnrollmentPlace } from './enrollment-client';
import {
  EnrollmentCapacity,
  EnrollmentClassPicker,
  EnrollmentError,
} from './enrollment-components';
export function EnrollmentWizard({
  current,
  close,
  saved,
}: {
  current?: EnrollmentView;
  close: () => void;
  saved: () => void;
}) {
  const t = useTranslations('EnrollmentFlow');
  const common = useTranslations('Common');
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(1);
  const [studentId, setStudentId] = useState(current?.studentId ?? '');
  const [yearId, setYearId] = useState(current?.academicYearId ?? '');
  const [levelId, setLevelId] = useState('');
  const [classId, setClassId] = useState(current?.classId ?? '');
  const [type, setType] = useState<'NEW' | 'RE_ENROLLMENT'>(
    current?.type === 'RE_ENROLLMENT' ? 'RE_ENROLLMENT' : 'NEW',
  );
  const [date, setDate] = useState(current?.enrolledOn ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const student = usePeopleData<PersonView>(studentId ? `students/${studentId}` : null);
  const year = usePeopleData<AcademicView>(yearId ? `academic-years/${yearId}` : null);
  const capacity = usePeopleData<PageResult<EnrollmentClassView>>(
    yearId && classId ? `enrollment-classes?academicYearId=${yearId}&classId=${classId}` : null,
  );
  const classroom = capacity.data?.items[0];
  const effectiveDate = date || year.data?.startsOn || '';
  const available = classroom ? hasEnrollmentPlace(classroom, current) : false;
  function move(next: number) {
    setStep(next);
    setError(undefined);
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 3) {
      move(step + 1);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const input = current
        ? enrollmentUpdate.parse({ classId, type, enrolledOn: effectiveDate })
        : enrollmentCreate.parse({
            studentId,
            academicYearId: yearId,
            classId,
            type,
            enrolledOn: effectiveDate,
          });
      await enrollmentRequest(
        current ? `enrollments/${current.id}` : 'enrollments',
        input,
        current ? 'PATCH' : 'POST',
      );
      saved();
    } catch (issue: unknown) {
      setError(issue);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AcademicDialog
      title={current ? t('edit') : t('new')}
      description={t('wizardHint')}
      close={close}
      busy={busy}
    >
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        className="min-w-0 space-y-4"
        data-enrollment-wizard
      >
        <ol className="flex flex-wrap gap-2 text-xs text-muted-foreground" aria-label={t('steps')}>
          {[1, 2, 3].map((number) => (
            <li
              key={number}
              aria-current={step === number ? 'step' : undefined}
              className={step === number ? 'font-semibold text-primary' : ''}
            >
              {t('step', { number })}
            </li>
          ))}
        </ol>
        <h3 ref={heading} tabIndex={-1} className="font-semibold outline-none">
          {t(step === 1 ? 'chooseStudent' : step === 2 ? 'chooseClass' : 'review')}
        </h3>
        {step === 1 ? (
          <>
            <AcademicPicker
              path="students?status=ACTIVE"
              value={studentId}
              onChange={setStudentId}
              label={t('student')}
              defaultLabel={current?.studentName}
              required
              disabled={Boolean(current)}
              writable
            />
            <div className="space-y-1">
              <Label htmlFor={`${id}-type`}>{t('type')}</Label>
              <Select
                id={`${id}-type`}
                value={type}
                onChange={(event) =>
                  setType(event.target.value === 'RE_ENROLLMENT' ? 'RE_ENROLLMENT' : 'NEW')
                }
              >
                <SelectItem value="NEW">{t('NEW')}</SelectItem>
                <SelectItem value="RE_ENROLLMENT">{t('RE_ENROLLMENT')}</SelectItem>
              </Select>
            </div>
            {type === 'RE_ENROLLMENT' ? (
              <p className="text-sm text-muted-foreground">{t('reenrollmentHint')}</p>
            ) : null}
          </>
        ) : null}
        {step === 2 ? (
          <>
            <AcademicPicker
              path="academic-years?status=ALL"
              value={yearId}
              onChange={(value) => {
                setYearId(value);
                setClassId('');
                setDate('');
              }}
              label={t('year')}
              defaultLabel={current?.academicYearName}
              required
              writable
              disabled={Boolean(current)}
            />
            <AcademicPicker
              path="levels?status=ACTIVE"
              value={levelId}
              onChange={(value) => {
                setLevelId(value);
                setClassId('');
              }}
              label={t('level')}
            />
            <EnrollmentClassPicker
              yearId={yearId}
              levelId={levelId}
              value={classId}
              onChange={setClassId}
              {...(current ? { defaultLabel: current.className } : {})}
            />
            <div className="space-y-1">
              <Label htmlFor={`${id}-date`}>{t('enrolledOn')}</Label>
              <Input
                id={`${id}-date`}
                type="date"
                required
                min={year.data?.startsOn}
                max={year.data?.endsOn}
                value={effectiveDate}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            {classroom ? <EnrollmentCapacity classroom={classroom} /> : null}
            {classroom && !available ? (
              <p role="status" className="text-sm text-destructive">
                {t('classFull')}
              </p>
            ) : null}
          </>
        ) : null}
        {step === 3 ? (
          <dl className="space-y-3 rounded-lg border border-border p-4 text-sm [overflow-wrap:anywhere]">
            {[
              [t('student'), `${student.data?.firstName ?? ''} ${student.data?.lastName ?? ''}`],
              [t('year'), year.data?.name],
              [t('class'), classroom?.name],
              [t('type'), t(type)],
              [t('enrolledOn'), effectiveDate],
              [t('status'), t('PENDING')],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {student.error || year.error || capacity.error ? (
          <EnrollmentError error={student.error ?? year.error ?? capacity.error} />
        ) : null}
        {error ? <EnrollmentError error={error} /> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={step === 1 ? close : () => move(step - 1)}
          >
            {step === 1 ? common('cancel') : t('back')}
          </Button>
          <Button
            type="submit"
            disabled={
              busy ||
              (step === 1 ? !student.data : !year.data || !classId || !available || !effectiveDate)
            }
          >
            {busy
              ? t('saving')
              : step < 3
                ? t('next')
                : current
                  ? common('save')
                  : t('savePending')}
          </Button>
        </div>
      </form>
    </AcademicDialog>
  );
}
