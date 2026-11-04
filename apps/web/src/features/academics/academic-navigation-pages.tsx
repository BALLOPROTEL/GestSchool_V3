'use client';

import { Card, CardContent } from '@gestschool/ui';
import type { AcademicView } from '@gestschool/contracts';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { usePeopleData } from '../directory/people-hooks';
import { PageHeader } from '../shared/page-header';
import { AcademicPicker } from './academic-components';
import { AcademicSetupGuide } from './academic-guide';
import { AcademicList } from './academic-list';

function SelectionNotice({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4 text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

export function AcademicYearsPage() {
  const t = useTranslations('Academics');
  const nav = useTranslations('Nav');
  return (
    <div className="page-shell space-y-5">
      <PageHeader eyebrow={nav('academic')} title={t('years')} description={t('yearsDescription')} />
      <AcademicSetupGuide current="years" />
      <AcademicList kind="academic-years" />
    </div>
  );
}

export function LevelsPage() {
  const t = useTranslations('Academics');
  const nav = useTranslations('Nav');
  return (
    <div className="page-shell space-y-5">
      <PageHeader eyebrow={nav('academic')} title={t('levels')} description={t('levelsDescription')} />
      <AcademicSetupGuide current="levels" />
      <AcademicList kind="levels" />
    </div>
  );
}

export function PeriodsPage() {
  const t = useTranslations('Academics');
  const nav = useTranslations('Nav');
  const [yearId, setYearId] = useState('');
  const year = usePeopleData<AcademicView>(yearId ? `academic-years/${yearId}` : null);

  useEffect(() => {
    setYearId(new URLSearchParams(window.location.search).get('yearId') ?? '');
  }, []);

  return (
    <div className="page-shell space-y-5">
      <PageHeader
        eyebrow={nav('academic')}
        title={t('periods')}
        description={t('periodsDescription')}
      />
      <AcademicSetupGuide current="periods" />
      <Card>
        <CardContent className="p-4">
          <AcademicPicker
            label={t('year')}
            path="academic-years?status=ALL"
            value={yearId}
            onChange={setYearId}
            required
          />
        </CardContent>
      </Card>
      {!yearId ? <SelectionNotice>{t('selectYearFirst')}</SelectionNotice> : null}
      {year.loading ? <SelectionNotice>{t('loading')}</SelectionNotice> : null}
      {year.error ? <SelectionNotice>{t('unavailable')}</SelectionNotice> : null}
      {year.data ? <AcademicList kind="academic-periods" parent={year.data} /> : null}
    </div>
  );
}

export function TeachingAssignmentsPage() {
  const t = useTranslations('Academics');
  const nav = useTranslations('Nav');
  const [classId, setClassId] = useState('');
  const schoolClass = usePeopleData<AcademicView>(classId ? `classes/${classId}` : null);

  useEffect(() => {
    setClassId(new URLSearchParams(window.location.search).get('classId') ?? '');
  }, []);

  return (
    <div className="page-shell space-y-5">
      <PageHeader
        eyebrow={nav('academic')}
        title={t('assignments')}
        description={t('assignmentsDescription')}
      />
      <AcademicSetupGuide current="assignments" />
      <Card>
        <CardContent className="space-y-3 p-4">
          <AcademicPicker
            label={t('class')}
            path="classes?status=ACTIVE"
            value={classId}
            onChange={setClassId}
          />
          <p className="text-sm text-muted-foreground">{t('selectClassFirst')}</p>
        </CardContent>
      </Card>
      {schoolClass.loading ? <SelectionNotice>{t('loading')}</SelectionNotice> : null}
      {schoolClass.error ? <SelectionNotice>{t('unavailable')}</SelectionNotice> : null}
      <AcademicList
        key={schoolClass.data?.id ?? 'all-assignments'}
        kind="teaching-assignments"
        parent={schoolClass.data}
      />
    </div>
  );
}
