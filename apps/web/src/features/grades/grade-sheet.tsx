'use client';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectItem,
} from '@gestschool/ui';
import {
  gradeOutcomes,
  type AssessmentAction,
  type AssessmentView,
  type GradeChangeView,
  type GradeOutcome,
  type GradeSheet,
  type GradeView,
} from '@gestschool/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '../auth/auth-provider';
import { AcademicDialog } from '../academics/academic-components';
import { usePeopleData } from '../directory/people-hooks';
import { PeopleError } from '../directory/people-client';
import { canResults, resultsRequest, scoreInput, validScore } from './results-client';
import { ResultError, ResultField, ResultSelect, ResultStatus } from './results-components';
import { AssessmentEditor } from './assessment-editor';

const transitions: { status: string; action: AssessmentAction; permission: string }[] = [
  { status: 'DRAFT', action: 'submit', permission: 'grades.submit' },
  { status: 'DRAFT', action: 'archive', permission: 'assessments.update' },
  { status: 'SUBMITTED', action: 'validate', permission: 'grades.validate' },
  { status: 'SUBMITTED', action: 'reopen', permission: 'grades.validate' },
  { status: 'VALIDATED', action: 'publish', permission: 'grades.publish' },
  { status: 'PUBLISHED', action: 'lock', permission: 'grades.lock' },
];
export function GradeEntrySheet({
  sheet,
  refresh,
  dirtyChanged,
}: {
  sheet: GradeSheet;
  refresh: () => void;
  dirtyChanged: (dirty: boolean) => void;
}) {
  const t = useTranslations('Results'),
    { session } = useAuth();
  const assessment = sheet.assessment;
  const can = (permission: string) => canResults(session?.session, permission, 'write');
  const editable =
    can('grades.create') &&
    can('grades.update') &&
    assessment.status === 'DRAFT' &&
    !assessment.archivedAt;
  const [rows, setRows] = useState(sheet.grades),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const [action, setAction] = useState<AssessmentAction>(),
    [editing, setEditing] = useState(false),
    [correction, setCorrection] = useState<GradeView>(),
    [history, setHistory] = useState<string>();
  const table = useRef<HTMLTableElement>(null);
  useEffect(() => {
    dirtyChanged(dirty);
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      dirtyChanged(false);
    };
  }, [dirty, dirtyChanged]);
  const invalid = rows.some(
    (row) => !validScore(row.score ?? '', row.outcome, assessment.maxScore),
  );
  function update(studentId: string, change: Partial<GradeView>) {
    setRows((values) =>
      values.map((row) => (row.studentId === studentId ? { ...row, ...change } : row)),
    );
    setDirty(true);
  }
  function save() {
    if (invalid) {
      setError(new PeopleError('GRADE_OUT_OF_RANGE'));
      return;
    }
    setBusy(true);
    setError(undefined);
    void resultsRequest<GradeSheet>(
      `assessments/${assessment.id}/grades`,
      {
        expectedVersion: assessment.version,
        grades: rows.map((row) => ({
          studentId: row.studentId,
          score: row.outcome === 'SCORED' ? scoreInput(row.score ?? '') : null,
          outcome: row.outcome,
          comment: row.comment,
        })),
      },
      'PUT',
    )
      .then(() => {
        setDirty(false);
        refresh();
      })
      .catch(setError)
      .finally(() => setBusy(false));
  }
  return (
    <Card data-grade-sheet={assessment.id} className="min-w-0 overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{assessment.title}</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              {assessment.className} · {assessment.subjectName} · {assessment.periodName}
            </p>
          </div>
          <ResultStatus status={assessment.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="flex flex-wrap gap-5 text-sm">
          {[
            ['maxScore', assessment.maxScore],
            ['weight', assessment.weight],
            ['coefficient', assessment.coefficient],
            ['date', assessment.assessedOn],
          ].map(([key, value]) => (
            <div key={key}>
              <dt className="text-muted-foreground">{t(key ?? '')}</dt>
              <dd>
                <bdi className="font-mono">{value}</bdi>
              </dd>
            </div>
          ))}
        </dl>
        {assessment.status === 'LOCKED' ? <p role="status">{t('locked')}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <Button onClick={save} disabled={busy || !dirty || invalid || rows.length === 0}>
              {t('saveDraft')}
            </Button>
          ) : null}
          {assessment.status === 'DRAFT' && can('assessments.update') && !assessment.archivedAt ? (
            <Button variant="outline" onClick={() => setEditing(true)} disabled={busy || dirty}>
              {t('editAssessment')}
            </Button>
          ) : null}
          {transitions
            .filter(
              (item) =>
                item.status === assessment.status &&
                can(item.permission) &&
                !assessment.archivedAt &&
                !(
                  item.action === 'validate' &&
                  assessment.submittedByMembershipId === session?.session.membershipId
                ),
            )
            .map((item) => (
              <Button
                key={item.action}
                variant="outline"
                onClick={() => setAction(item.action)}
                disabled={busy || dirty}
              >
                {t(item.action)}
              </Button>
            ))}
          <span role="status" className="text-sm text-muted-foreground">
            {t(dirty ? 'unsaved' : 'saved')}
          </span>
        </div>
        {error ? <ResultError error={error} /> : null}
        {rows.length === 0 ? (
          <p>{t('emptyRoster')}</p>
        ) : (
          <div
            className="max-w-full overflow-x-auto rounded-lg border"
            tabIndex={0}
            role="region"
            aria-label={t('entryTable')}
          >
            <table ref={table} className="w-full min-w-[780px] text-start text-sm">
              <caption className="sr-only">{t('entryTable')}</caption>
              <thead className="bg-muted">
                <tr>
                  {['student', 'score', 'outcome', 'comment', 'actions'].map((key) => (
                    <th key={key} scope="col" className="p-3 text-start">
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const valid = validScore(row.score ?? '', row.outcome, assessment.maxScore);
                  const name = `${row.firstName} ${row.lastName}`;
                  return (
                    <tr
                      key={row.studentId}
                      className="border-t align-top"
                      data-grade-student={row.studentId}
                    >
                      <th scope="row" className="p-3 text-start font-medium">
                        {name}
                        <span className="block font-mono text-xs text-muted-foreground">
                          {row.matricule}
                        </span>
                      </th>
                      <td className="w-32 p-3">
                        {editable ? (
                          <>
                            <Input
                              aria-label={t('scoreFor', { name })}
                              aria-invalid={!valid}
                              aria-describedby={!valid ? `grade-error-${row.studentId}` : undefined}
                              data-grade-score
                              inputMode="decimal"
                              dir="ltr"
                              value={row.score ?? ''}
                              disabled={busy || ['ABSENT', 'EXCUSED'].includes(row.outcome)}
                              onChange={(e) =>
                                update(row.studentId, {
                                  score: e.target.value || null,
                                  outcome: e.target.value ? 'SCORED' : 'NOT_GRADED',
                                })
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  const inputs = Array.from(
                                    table.current?.querySelectorAll<HTMLInputElement>(
                                      'input[data-grade-score]',
                                    ) ?? [],
                                  );
                                  const next = event.shiftKey
                                    ? inputs
                                        .slice(0, index)
                                        .toReversed()
                                        .find((input) => !input.disabled)
                                    : inputs.slice(index + 1).find((input) => !input.disabled);
                                  next?.focus();
                                  next?.select();
                                }
                              }}
                            />
                            {!valid ? (
                              <p
                                id={`grade-error-${row.studentId}`}
                                className="mt-1 text-xs text-destructive"
                              >
                                {t('outOfRange')}
                              </p>
                            ) : null}
                          </>
                        ) : (
                          <bdi className="font-mono">
                            {row.score ?? '—'} / {assessment.maxScore}
                          </bdi>
                        )}
                      </td>
                      <td className="w-44 p-3">
                        {editable ? (
                          <Select
                            aria-label={t('outcomeFor', { name })}
                            value={row.outcome}
                            disabled={busy}
                            onChange={(e) => {
                              const value = gradeOutcomes.find(
                                (outcome) => outcome === e.target.value,
                              );
                              if (value)
                                update(row.studentId, {
                                  outcome: value,
                                  score: value === 'SCORED' ? '' : null,
                                });
                            }}
                          >
                            {gradeOutcomes.map((outcome) => (
                              <SelectItem key={outcome} value={outcome}>
                                {t(outcome)}
                              </SelectItem>
                            ))}
                          </Select>
                        ) : (
                          t(row.outcome)
                        )}
                      </td>
                      <td className="p-3">
                        {editable ? (
                          <Input
                            aria-label={t('commentFor', { name })}
                            value={row.comment ?? ''}
                            maxLength={500}
                            disabled={busy}
                            onChange={(e) =>
                              update(row.studentId, { comment: e.target.value || null })
                            }
                          />
                        ) : (
                          (row.comment ?? '—')
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          {row.id ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setHistory(row.id ?? undefined)}
                            >
                              {t('history')}
                            </Button>
                          ) : null}
                          {row.id && assessment.status === 'PUBLISHED' && can('grades.correct') ? (
                            <Button size="sm" variant="outline" onClick={() => setCorrection(row)}>
                              {t('correct')}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      {action ? (
        <AssessmentConfirmation
          assessment={assessment}
          action={action}
          close={() => setAction(undefined)}
          saved={refresh}
        />
      ) : null}
      {editing ? (
        <AssessmentEditor
          year={assessment.academicYearId}
          period={assessment.academicPeriodId}
          classId={assessment.classId}
          row={assessment}
          close={() => setEditing(false)}
          saved={refresh}
        />
      ) : null}
      {correction ? (
        <GradeCorrection
          assessment={assessment}
          grade={correction}
          close={() => setCorrection(undefined)}
          saved={refresh}
        />
      ) : null}
      {history ? <GradeHistory id={history} close={() => setHistory(undefined)} /> : null}
    </Card>
  );
}
function AssessmentConfirmation({
  assessment,
  action,
  close,
  saved,
}: {
  assessment: AssessmentView;
  action: AssessmentAction;
  close: () => void;
  saved: () => void;
}) {
  const t = useTranslations('Results');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return (
    <AcademicDialog
      title={t(action)}
      description={t('confirmTransition')}
      busy={busy}
      close={close}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const reason = new FormData(e.currentTarget).get('reason');
          setBusy(true);
          setError(undefined);
          void resultsRequest(
            `assessments/${assessment.id}/${action}`,
            { expectedVersion: assessment.version, ...(reason ? { reason: String(reason) } : {}) },
            'POST',
          )
            .then(() => {
              close();
              saved();
            })
            .catch(setError)
            .finally(() => setBusy(false));
        }}
      >
        <p className="font-semibold">{assessment.title}</p>
        {action === 'reopen' ? (
          <ResultField label={t('reason')} name="reason" minLength={3} maxLength={500} required />
        ) : null}
        {error ? <ResultError error={error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {t('confirm')}
          </Button>
        </div>
      </form>
    </AcademicDialog>
  );
}
function GradeCorrection({
  assessment,
  grade,
  close,
  saved,
}: {
  assessment: AssessmentView;
  grade: GradeView;
  close: () => void;
  saved: () => void;
}) {
  const t = useTranslations('Results');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [outcome, setOutcome] = useState<GradeOutcome>(grade.outcome);
  return (
    <AcademicDialog
      title={t('correct')}
      description={t('correctionHint')}
      busy={busy}
      close={close}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget),
            score = scoreInput(String(form.get('score') ?? ''));
          if (!validScore(score, outcome, assessment.maxScore)) {
            setError(new PeopleError('GRADE_OUT_OF_RANGE'));
            return;
          }
          setBusy(true);
          setError(undefined);
          void resultsRequest(
            `grades/${grade.id}/correct`,
            {
              expectedVersion: assessment.version,
              score: outcome === 'SCORED' ? score : null,
              outcome,
              comment: String(form.get('comment') ?? '') || null,
              reason: String(form.get('reason')),
            },
            'POST',
          )
            .then(() => {
              close();
              saved();
            })
            .catch(setError)
            .finally(() => setBusy(false));
        }}
      >
        <p>
          {grade.firstName} {grade.lastName} ·{' '}
          <bdi>
            {grade.score ?? '—'} / {assessment.maxScore}
          </bdi>
        </p>
        <fieldset disabled={busy} className="space-y-3">
          <ResultSelect
            label={t('outcome')}
            value={outcome}
            onChange={(e) => {
              const value = gradeOutcomes.find((item) => item === e.target.value);
              if (value) setOutcome(value);
            }}
            items={gradeOutcomes.map((value) => ({ value, label: t(value) }))}
          />
          <ResultField
            label={t('score')}
            name="score"
            dir="ltr"
            inputMode="decimal"
            defaultValue={grade.score ?? ''}
            disabled={outcome !== 'SCORED'}
            required={outcome === 'SCORED'}
          />
          <ResultField
            label={t('comment')}
            name="comment"
            defaultValue={grade.comment ?? ''}
            maxLength={500}
          />
          <ResultField label={t('reason')} name="reason" required minLength={3} maxLength={500} />
        </fieldset>
        {error ? <ResultError error={error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {t('confirm')}
          </Button>
        </div>
      </form>
    </AcademicDialog>
  );
}
function GradeHistory({ id, close }: { id: string; close: () => void }) {
  const t = useTranslations('Results'),
    history = usePeopleData<GradeChangeView[]>(`grades/${id}/changes`);
  return (
    <AcademicDialog title={t('history')} description={t('correctionHint')} close={close}>
      {history.loading ? <p role="status">{t('loading')}</p> : null}
      {history.error ? <ResultError error={history.error} /> : null}
      {history.data?.length === 0 ? <p>{t('emptyHistory')}</p> : null}
      <ol className="space-y-4">
        {history.data?.map((row) => (
          <li key={row.id} className="space-y-2 rounded-lg border p-3 text-sm">
            <p>
              <bdi>
                {row.previousScore ?? '—'} → {row.newScore ?? '—'}
              </bdi>{' '}
              · {t(row.previousOutcome ?? 'NOT_GRADED')} → {t(row.newOutcome)}
            </p>
            <p>{row.reason}</p>
            <p>
              {row.previousComment ?? '—'} → {row.newComment ?? '—'}
            </p>
            <time dateTime={row.changedAt} className="block">
              {row.changedAt}
            </time>
            <p className="break-all text-xs">
              {t('actor')}: {row.actorMembershipId ?? '—'}
            </p>
            <p className="break-all font-mono text-xs">{row.requestId}</p>
          </li>
        ))}
      </ol>
    </AcademicDialog>
  );
}
