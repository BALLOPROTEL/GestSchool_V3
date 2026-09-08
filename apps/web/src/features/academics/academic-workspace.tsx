'use client';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@gestschool/ui';
import type { AcademicEntity, AcademicView } from '@gestschool/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { PageHeader } from '../shared/page-header';
import { useAuth } from '../auth/auth-provider';
import { academicLabels, canAcademic } from './academic-client';
import { AcademicList } from './academic-list';
import { AcademicStatus } from './academic-components';

export function ClassesPage() {
  const { session } = useAuth();
  return (
    <AcademicWorkspace key={`${session?.session.tenant.id}:${session?.session.membershipId}`} />
  );
}
function AcademicWorkspace() {
  const t = useTranslations('Academics');
  const nav = useTranslations('Nav');
  const locale = useLocale();
  const { session } = useAuth();
  const [tab, setTab] = useState('classes');
  const [detail, setDetail] = useState<{
    kind: 'classes' | 'academic-years';
    row: AcademicView;
  } | null>(null);
  const entities: AcademicEntity[] = [
    'classes',
    'academic-years',
    'levels',
    'teaching-assignments',
  ];
  const tabs = entities.filter((kind) => canAcademic(session?.session, kind));
  return (
    <div className="page-shell">
      <PageHeader eyebrow={nav('academic')} title={t('classes')} description={t('description')} />
      {detail ? (
        <div className="space-y-5">
          <Button
            data-academic-focus
            variant="outline"
            onClick={() => {
              setDetail(null);
              requestAnimationFrame(() =>
                document.querySelector<HTMLElement>('[role="tab"][data-state="active"]')?.focus(),
              );
            }}
          >
            {t('back')}
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="min-w-0 max-w-full break-words text-xl font-semibold">
              {detail.row.name}
            </h2>
            <AcademicStatus row={detail.row} />
          </div>
          {detail.kind === 'academic-years' ? (
            <AcademicList kind="academic-periods" parent={detail.row} />
          ) : (
            <>
              <AcademicList kind="class-subjects" parent={detail.row} />
              <AcademicList kind="teaching-assignments" parent={detail.row} />
            </>
          )}
        </div>
      ) : tabs.length ? (
        <Tabs value={tab} onValueChange={setTab} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <TabsList
            aria-label={t('navigation')}
            className="h-auto max-w-full flex-wrap justify-start"
          >
            {tabs.map((kind) => (
              <TabsTrigger key={kind} value={kind}>
                {t(academicLabels[kind])}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((kind) => (
            <TabsContent key={kind} value={kind}>
              <AcademicList
                kind={kind}
                select={
                  kind === 'classes' || kind === 'academic-years'
                    ? (row) => {
                        setDetail({ kind, row });
                        requestAnimationFrame(() =>
                          document.querySelector<HTMLElement>('[data-academic-focus]')?.focus(),
                        );
                      }
                    : undefined
                }
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <p role="status" className="rounded-xl border border-border p-5">
          {t('forbidden')}
        </p>
      )}
    </div>
  );
}
export function SubjectsPage() {
  const t = useTranslations('Academics');
  const nav = useTranslations('Nav');
  const { session } = useAuth();
  return (
    <div className="page-shell">
      <PageHeader eyebrow={nav('academic')} title={t('subjects')} description={t('subjectsHint')} />
      <AcademicList
        key={`${session?.session.tenant.id}:${session?.session.membershipId}`}
        kind="subjects"
      />
    </div>
  );
}
