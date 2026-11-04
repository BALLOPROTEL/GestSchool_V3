'use client';

import { Button, Card, CardContent } from '@gestschool/ui';
import type { AcademicView } from '@gestschool/contracts';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '../../i18n/navigation';
import { PageHeader } from '../shared/page-header';
import { useAuth } from '../auth/auth-provider';
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
  const [detail, setDetail] = useState<AcademicView | null>(null);

  return (
    <div className="page-shell space-y-5">
      <PageHeader
        eyebrow={nav('academic')}
        title={t('classes')}
        description={t('classesDescription')}
      />
      <AcademicSetupGuide current="classes" />
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
              <Link
                className="inline-flex min-h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                href={`/assignments?classId=${encodeURIComponent(detail.id)}`}
              >
                {t('manageAssignments')}
              </Link>
            </CardContent>
          </Card>
          <AcademicList kind="class-subjects" parent={detail} />
        </div>
      ) : (
        <AcademicList
          kind="classes"
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
