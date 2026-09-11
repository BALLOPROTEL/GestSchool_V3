'use client';
import { Button } from '@gestschool/ui';
import type { AcademicView, AssessmentView, PageResult } from '@gestschool/contracts';
import { assessmentInput, assessmentPatch } from '@gestschool/contracts';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AcademicDialog } from '../academics/academic-components';
import { usePeopleData } from '../directory/people-hooks';
import { PeopleError } from '../directory/people-client';
import { ResultError, ResultField, ResultSelect } from './results-components';
import { resultsRequest, scoreInput } from './results-client';
export function AssessmentEditor({
  year,
  period,
  classId,
  row,
  close,
  saved,
}: {
  year: string;
  period: string;
  classId: string;
  row?: AssessmentView;
  close: () => void;
  saved: (row: AssessmentView) => void;
}) {
  const t = useTranslations('Results');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const [query, setQuery] = useState(''),
    [assignment, setAssignment] = useState('');
  const options = usePeopleData<PageResult<AcademicView>>(
    row
      ? null
      : `teaching-assignments?academicYearId=${year}&academicPeriodId=${period}&classId=${classId}&status=ACTIVE&pageSize=100&search=${encodeURIComponent(query)}`,
  );
  const assignments = [
    ...new Map((options.data?.items ?? []).map((item) => [item.classSubjectId, item])).values(),
  ];
  return (
    <AcademicDialog
      title={t(row ? 'editAssessment' : 'createAssessment')}
      description={t('assessmentHint')}
      busy={busy}
      close={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const values = {
            title: String(form.get('title')),
            assessedOn: String(form.get('assessedOn')),
            maxScore: scoreInput(String(form.get('maxScore'))),
            weight: scoreInput(String(form.get('weight'))),
          };
          const parsed = row
            ? assessmentPatch.safeParse({ ...values, expectedVersion: row.version })
            : assessmentInput.safeParse({
                ...values,
                classSubjectId: assignment,
                academicPeriodId: period,
              });
          if (!parsed.success) {
            setError(new PeopleError('AUTH_INVALID_REQUEST'));
            return;
          }
          setBusy(true);
          setError(undefined);
          void resultsRequest<AssessmentView>(
            row ? `assessments/${row.id}` : 'assessments',
            parsed.data,
            row ? 'PATCH' : 'POST',
          )
            .then(saved)
            .catch(setError)
            .finally(() => setBusy(false));
        }}
        className="space-y-4"
      >
        <fieldset disabled={busy} className="space-y-4">
          {!row ? (
            <>
              <ResultField
                label={t('searchSubject')}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setAssignment('');
                }}
              />
              <ResultSelect
                label={t('subject')}
                required
                value={assignment}
                onChange={(e) => setAssignment(e.target.value)}
                items={[
                  { value: '', label: t('choose') },
                  ...assignments.map((item) => ({
                    value: item.classSubjectId ?? '',
                    label: `${item.subjectName ?? item.name} · ${item.teacherName ?? ''}`,
                  })),
                ]}
              />
              {options.loading ? <p role="status">{t('loading')}</p> : null}
              {options.error ? <ResultError error={options.error} /> : null}
              {(options.data?.total ?? 0) > 100 ? <p>{t('refineSearch')}</p> : null}
            </>
          ) : null}
          <ResultField
            label={t('assessmentTitle')}
            name="title"
            defaultValue={row?.title ?? ''}
            required
            maxLength={160}
          />
          <ResultField
            label={t('date')}
            name="assessedOn"
            type="date"
            defaultValue={row?.assessedOn ?? ''}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <ResultField
              label={t('maxScore')}
              name="maxScore"
              inputMode="decimal"
              dir="ltr"
              defaultValue={row?.maxScore ?? '20'}
              required
            />
            <ResultField
              label={t('weight')}
              name="weight"
              inputMode="decimal"
              dir="ltr"
              defaultValue={row?.weight ?? '1'}
              required
            />
          </div>
        </fieldset>
        {error ? <ResultError error={error} /> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={close} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {t('save')}
          </Button>
        </div>
      </form>
    </AcademicDialog>
  );
}
