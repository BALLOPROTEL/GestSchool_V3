'use client';
import { Button, Input, Label, Select, SelectItem } from '@gestschool/ui';
import {
  academicYearCreate,
  academicYearUpdate,
  academicPeriodCreate,
  academicPeriodUpdate,
  levelCreate,
  levelUpdate,
  schoolClassCreate,
  schoolClassUpdate,
  subjectCreate,
  subjectUpdate,
  classSubjectCreate,
  classSubjectUpdate,
  teachingAssignmentCreate,
  teachingAssignmentUpdate,
  type AcademicEntity,
  type AcademicView,
} from '@gestschool/contracts';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { PeopleError } from '../directory/people-client';
import { academicLabels, academicRequest } from './academic-client';
import { AcademicDialog, AcademicErrorNotice, AcademicPicker } from './academic-components';

const schemas = {
  'academic-years': [academicYearCreate, academicYearUpdate],
  'academic-periods': [academicPeriodCreate, academicPeriodUpdate],
  levels: [levelCreate, levelUpdate],
  classes: [schoolClassCreate, schoolClassUpdate],
  subjects: [subjectCreate, subjectUpdate],
  'class-subjects': [classSubjectCreate, classSubjectUpdate],
  'teaching-assignments': [teachingAssignmentCreate, teachingAssignmentUpdate],
} as const;
export function academicPath(kind: AcademicEntity, parent?: AcademicView): string {
  return kind === 'academic-periods'
    ? `academic-years/${parent?.id}/periods`
    : kind === 'class-subjects'
      ? `classes/${parent?.id}/subjects`
      : kind;
}
export function academicRowPath(
  kind: AcademicEntity,
  row: AcademicView,
  parent?: AcademicView,
): string {
  return kind === 'class-subjects'
    ? `${academicPath(kind, parent)}/${row.subjectId}`
    : `${kind}/${row.id}`;
}
export function AcademicEditor({
  kind,
  row,
  parent,
  close,
  saved,
}: {
  kind: AcademicEntity;
  row: AcademicView | null;
  parent?: AcademicView | undefined;
  close: () => void;
  saved: () => void;
}) {
  const t = useTranslations('Academics');
  const common = useTranslations('Common');
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [yearId, setYearId] = useState(row?.academicYearId ?? '');
  const [levelId, setLevelId] = useState(row?.levelId ?? '');
  const [subjectId, setSubjectId] = useState(row?.subjectId ?? '');
  const [classSubjectId, setClassSubjectId] = useState(row?.classSubjectId ?? '');
  const [teacherId, setTeacherId] = useState(row?.teacherId ?? '');
  const [periodId, setPeriodId] = useState(row?.academicPeriodId ?? '');
  const [type, setType] = useState(row?.type ?? 'TRIMESTER');
  const isDates = kind === 'academic-years' || kind === 'academic-periods';
  const hasName = kind !== 'class-subjects' && kind !== 'teaching-assignments';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = {
      ...(hasName ? { name: form.get('name') } : {}),
      ...(hasName && kind !== 'academic-periods' ? { code: form.get('code') } : {}),
      ...(isDates ? { startsOn: form.get('startsOn'), endsOn: form.get('endsOn') } : {}),
      ...(kind === 'academic-periods' ? { type, ordinal: Number(form.get('ordinal')) } : {}),
      ...(kind === 'levels' ? { position: Number(form.get('position')) } : {}),
      ...(kind === 'classes'
        ? {
            ...(!row ? { academicYearId: yearId } : {}),
            levelId,
            capacity: form.get('capacity') ? Number(form.get('capacity')) : null,
          }
        : {}),
      ...(kind === 'class-subjects'
        ? { ...(!row ? { subjectId } : {}), coefficient: form.get('coefficient') }
        : {}),
      ...(kind === 'teaching-assignments'
        ? { classSubjectId, teacherId, academicPeriodId: periodId }
        : {}),
    };
    const parsed = schemas[kind][row ? 1 : 0].safeParse(data);
    if (!parsed.success) {
      setError(new PeopleError('AUTH_INVALID_REQUEST'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await academicRequest(
        row ? academicRowPath(kind, row, parent) : academicPath(kind, parent),
        parsed.data,
        row ? 'PATCH' : 'POST',
      );
      saved();
    } catch (issue: unknown) {
      setError(issue);
    } finally {
      setBusy(false);
    }
  }
  const field = (
    name:
      'name' | 'code' | 'startsOn' | 'endsOn' | 'ordinal' | 'position' | 'capacity' | 'coefficient',
    inputType = 'text',
    required = true,
  ) => (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={`${id}-${name}`}>{t(name)}</Label>
      <Input
        id={`${id}-${name}`}
        name={name}
        type={inputType}
        required={required}
        autoComplete="off"
        defaultValue={
          row?.[name] ??
          (name === 'position' ? 0 : name === 'ordinal' ? 1 : name === 'coefficient' ? '1.00' : '')
        }
        maxLength={
          name === 'code'
            ? kind === 'classes'
              ? 40
              : 30
            : name === 'name'
              ? kind === 'classes' || kind === 'subjects'
                ? 120
                : 100
              : undefined
        }
        min={
          inputType === 'date'
            ? '1900-01-01'
            : name === 'position'
              ? 0
              : name === 'coefficient'
                ? '0.01'
                : inputType === 'number'
                  ? 1
                  : undefined
        }
        max={
          inputType === 'date'
            ? '2199-12-31'
            : name === 'ordinal'
              ? type === 'SEMESTER'
                ? 2
                : 3
              : name === 'position'
                ? 32767
                : name === 'capacity'
                  ? 10000
                  : name === 'coefficient'
                    ? '999.99'
                    : undefined
        }
        step={name === 'coefficient' ? '0.01' : inputType === 'number' ? 1 : undefined}
      />
    </div>
  );
  return (
    <AcademicDialog
      title={t(row ? 'editEntity' : 'createEntity', { entity: t(academicLabels[kind]) })}
      description={t('formHint')}
      close={close}
      busy={busy}
    >
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
        className="grid min-w-0 gap-4"
        aria-busy={busy}
      >
        <fieldset disabled={busy} className="grid min-w-0 gap-4">
          {hasName ? field('name') : null}
          {hasName && kind !== 'academic-periods' ? field('code') : null}
          {isDates ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {field('startsOn', 'date')}
              {field('endsOn', 'date')}
            </div>
          ) : null}
          {kind === 'academic-periods' ? (
            <>
              <div className="space-y-1">
                <Label htmlFor={`${id}-type`}>{t('type')}</Label>
                <Select
                  id={`${id}-type`}
                  value={type}
                  onChange={(event) => setType(event.target.value as 'TRIMESTER' | 'SEMESTER')}
                >
                  <SelectItem value="TRIMESTER">{t('TRIMESTER')}</SelectItem>
                  <SelectItem value="SEMESTER">{t('SEMESTER')}</SelectItem>
                </Select>
              </div>
              {field('ordinal', 'number')}
            </>
          ) : null}
          {kind === 'levels' ? field('position', 'number') : null}
          {kind === 'classes' ? (
            <>
              {row ? (
                <p className="text-sm text-muted-foreground">
                  {t('year')}: {row.academicYearName} · {t('immutableYear')}
                </p>
              ) : (
                <AcademicPicker
                  path="academic-years?status=ALL"
                  label={t('year')}
                  value={yearId}
                  onChange={setYearId}
                  required
                  writable
                />
              )}
              <AcademicPicker
                path="levels?status=ACTIVE"
                label={t('level')}
                value={levelId}
                onChange={setLevelId}
                defaultLabel={row?.levelName}
                required
                writable
              />
              {field('capacity', 'number', false)}
            </>
          ) : null}
          {kind === 'class-subjects' ? (
            <>
              {row ? (
                <p className="text-sm font-medium">{row.name}</p>
              ) : (
                <AcademicPicker
                  path="subjects?status=ACTIVE"
                  label={t('subject')}
                  value={subjectId}
                  onChange={setSubjectId}
                  required
                  writable
                />
              )}
              {field('coefficient', 'number')}
            </>
          ) : null}
          {kind === 'teaching-assignments' ? (
            <>
              <AcademicPicker
                path={parent ? `classes/${parent.id}/subjects?status=ACTIVE` : null}
                label={t('subject')}
                value={classSubjectId}
                onChange={setClassSubjectId}
                defaultLabel={row?.subjectName}
                required
                writable
              />
              <AcademicPicker
                path="teachers?status=ACTIVE"
                label={t('teacher')}
                value={teacherId}
                onChange={setTeacherId}
                defaultLabel={row?.teacherName}
                required
                writable
              />
              <AcademicPicker
                path={
                  parent?.academicYearId
                    ? `academic-years/${parent.academicYearId}/periods?status=ACTIVE`
                    : null
                }
                label={t('period')}
                value={periodId}
                onChange={setPeriodId}
                defaultLabel={row?.academicPeriodName}
                required
                writable
              />
            </>
          ) : null}
        </fieldset>
        {error ? <AcademicErrorNotice error={error} /> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={close} disabled={busy}>
            {common('cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {common('save')}
          </Button>
        </div>
      </form>
    </AcademicDialog>
  );
}
