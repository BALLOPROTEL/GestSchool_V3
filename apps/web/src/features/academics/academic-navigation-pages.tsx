'use client';

import { Card, CardContent } from '@gestschool/ui';
import type { AcademicView } from '@gestschool/contracts';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from '../../i18n/navigation';
import { usePeopleData } from '../directory/people-hooks';
import { useAuth } from '../auth/auth-provider';
import { PageHeader } from '../shared/page-header';
import { AcademicPicker } from './academic-components';
import { canAcademic } from './academic-client';
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
      {!yearId ? (
        <SelectionNotice>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{t('selectYearFirst')}</span>
            <Link
              className="font-medium text-primary underline-offset-4 hover:underline"
              href="/academic-years"
            >
              {t('years')}
            </Link>
          </div>
        </SelectionNotice>
      ) : null}
      {year.loading ? <SelectionNotice>{t('loading')}</SelectionNotice> : null}
      {year.error ? <SelectionNotice>{t('unavailable')}</SelectionNotice> : null}
      {year.data ? <AcademicList kind="academic-periods" parent={year.data} /> : null}
    </div>
  );
}

export function TeachingAssignmentsPage() {
  const t = useTranslations('Academics');
  const nav = useTranslations('Nav');
  const { session } = useAuth();
  const [classId, setClassId] = useState('');
  const schoolClass = usePeopleData<AcademicView>(classId ? `classes/${classId}` : null);
  const canCreateAssignment = canAcademic(session?.session, 'teaching-assignments', 'create');
  const classSubjects = usePeopleData<{ total: number }>(
    canCreateAssignment && schoolClass.data
      ? `classes/${schoolClass.data.id}/subjects?status=ACTIVE&pageSize=1`
      : null,
  );
  const periods = usePeopleData<{ total: number }>(
    canCreateAssignment && schoolClass.data?.academicYearId
      ? `academic-years/${schoolClass.data.academicYearId}/periods?status=ACTIVE&pageSize=1`
      : null,
  );
  const teachers = usePeopleData<{ total: number }>(
    canCreateAssignment && classId ? 'teachers?status=ACTIVE&pageSize=1' : null,
  );
  const missingClassSubjects =
    canCreateAssignment &&
    Boolean(schoolClass.data) &&
    !classSubjects.loading &&
    !classSubjects.error &&
    (classSubjects.data?.total ?? 0) === 0;
  const missingPeriods =
    canCreateAssignment &&
    Boolean(schoolClass.data) &&
    !periods.loading &&
    !periods.error &&
    (periods.data?.total ?? 0) === 0;
  const missingTeachers =
    canCreateAssignment &&
    Boolean(schoolClass.data) &&
    !teachers.loading &&
    !teachers.error &&
    (teachers.data?.total ?? 0) === 0;
  const prerequisiteError =
    canCreateAssignment &&
    Boolean(schoolClass.data) &&
    (Boolean(classSubjects.error) || Boolean(periods.error) || Boolean(teachers.error));
  const assignmentCreationBlocked =
    canCreateAssignment &&
    Boolean(classId) &&
    (schoolClass.loading ||
      classSubjects.loading ||
      periods.loading ||
      teachers.loading ||
      Boolean(schoolClass.error) ||
      prerequisiteError ||
      missingClassSubjects ||
      missingPeriods ||
      missingTeachers);

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
      {prerequisiteError ? <SelectionNotice>{t('prerequisiteUnavailable')}</SelectionNotice> : null}
      {schoolClass.data && (missingClassSubjects || missingPeriods || missingTeachers) ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-medium">{t('missingAssignmentPrerequisites')}</p>
            <div className="flex flex-wrap gap-2 text-sm">
              {missingClassSubjects ? (
                <Link
                  className="rounded-md border border-input px-3 py-2 font-medium hover:bg-accent"
                  href={`/classes?search=${encodeURIComponent(schoolClass.data.code ?? schoolClass.data.name)}`}
                >
                  {t('classSubjects')}
                </Link>
              ) : null}
              {missingPeriods && schoolClass.data.academicYearId ? (
                <Link
                  className="rounded-md border border-input px-3 py-2 font-medium hover:bg-accent"
                  href={`/periods?yearId=${encodeURIComponent(schoolClass.data.academicYearId)}`}
                >
                  {t('periods')}
                </Link>
              ) : null}
              {missingTeachers ? (
                <Link
                  className="rounded-md border border-input px-3 py-2 font-medium hover:bg-accent"
                  href="/teachers"
                >
                  {t('teacher')}
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
      {!classId || schoolClass.data ? (
        <AcademicList
          key={schoolClass.data?.id ?? 'all-assignments'}
          kind="teaching-assignments"
          parent={schoolClass.data}
          creationBlocked={assignmentCreationBlocked}
        />
      ) : null}
    </div>
  );
}
