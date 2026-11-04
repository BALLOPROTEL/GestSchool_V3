'use client';

import { Button, Card, CardContent } from '@gestschool/ui';
import type { AcademicView } from '@gestschool/contracts';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '../../i18n/navigation';
import { PageHeader } from '../shared/page-header';
import { useAuth } from '../auth/auth-provider';
import { usePeopleData } from '../directory/people-hooks';
import { canAcademic } from './academic-client';
import { AcademicSetupGuide } from './academic-guide';
import { AcademicList } from './academic-list';
import { AcademicStatus } from './academic-components';

export function ClassesPage() {
  const { session } = useAuth();
  return (
    <ClassesWorkspace key={`${session?.session.tenant.id}:${session?.session.membershipId}`} />
  );
}

function ClassesWorkspace() {
  const t = useTranslations('Academics');
  const nav = useTranslations('Nav');
  const { session } = useAuth();
  const [detail, setDetail] = useState<AcademicView | null>(null);
  const canCreateClass = canAcademic(session?.session, 'classes', 'create');
  const canReadAssignments = canAcademic(session?.session, 'teaching-assignments');
  const years = usePeopleData<{ total: number }>(
    canCreateClass ? 'academic-years?status=ALL&pageSize=1' : null,
  );
  const levels = usePeopleData<{ total: number }>(
    canCreateClass ? 'levels?status=ACTIVE&pageSize=1' : null,
  );
  const missingYears =
    canCreateClass && !years.loading && !years.error && (years.data?.total ?? 0) === 0;
  const missingLevels =
    canCreateClass && !levels.loading && !levels.error && (levels.data?.total ?? 0) === 0;
  const creationBlocked =
    canCreateClass &&
    (years.loading ||
      levels.loading ||
      Boolean(years.error) ||
      Boolean(levels.error) ||
      missingYears ||
      missingLevels);

  return (
    <div className="page-shell space-y-5">
      <PageHeader
        eyebrow={nav('academic')}
        title={t('classes')}
        description={t('classesDescription')}
      />
      <AcademicSetupGuide current="classes" />
      {!detail && canCreateClass && (years.error || levels.error) ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {t('prerequisiteUnavailable')}
          </CardContent>
        </Card>
      ) : null}
      {!detail && (missingYears || missingLevels) ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-medium">{t('missingClassPrerequisites')}</p>
            <div className="flex flex-wrap gap-2">
              {missingYears ? (
                <Link
                  className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-accent"
                  href="/academic-years"
                >
                  {t('years')}
                </Link>
              ) : null}
              {missingLevels ? (
                <Link
                  className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-accent"
                  href="/levels"
                >
                  {t('levels')}
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
      {detail ? (
        <div className="space-y-5">
          <Button
            data-academic-focus
            variant="outline"
            onClick={() => {
              setDetail(null);
              requestAnimationFrame(() =>
                document.querySelector<HTMLElement>('[data-academic-create]')?.focus(),
              );
            }}
          >
            {t('back')}
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="min-w-0 max-w-full break-words text-xl font-semibold">
              {detail.name}
            </h2>
            <AcademicStatus row={detail} />
          </div>
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{t('classSubjectsHint')}</p>
              {canReadAssignments ? (
                <Link
                  className="inline-flex min-h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  href={`/assignments?classId=${encodeURIComponent(detail.id)}`}
                >
                  {t('manageAssignments')}
                </Link>
              ) : null}
            </CardContent>
          </Card>
          <AcademicList kind="class-subjects" parent={detail} />
        </div>
      ) : (
        <AcademicList
          kind="classes"
          creationBlocked={creationBlocked}
          select={(row) => {
            setDetail(row);
            requestAnimationFrame(() =>
              document.querySelector<HTMLElement>('[data-academic-focus]')?.focus(),
            );
          }}
        />
      )}
    </div>
  );
}

export function SubjectsPage() {
  const t = useTranslations('Academics');
  const nav = useTranslations('Nav');
  const { session } = useAuth();

  return (
    <div className="page-shell space-y-5">
      <PageHeader
        eyebrow={nav('academic')}
        title={t('subjects')}
        description={t('subjectsHint')}
      />
      <AcademicSetupGuide current="subjects" />
      <AcademicList
        key={`${session?.session.tenant.id}:${session?.session.membershipId}`}
        kind="subjects"
      />
    </div>
  );
}
