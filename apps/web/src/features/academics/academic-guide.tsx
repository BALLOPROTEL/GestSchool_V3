'use client';

import { Card, CardContent, cn } from '@gestschool/ui';
import type { AcademicEntity } from '@gestschool/contracts';
import { useTranslations } from 'next-intl';
import { Link } from '../../i18n/navigation';
import { useAuth } from '../auth/auth-provider';
import { canAcademic } from './academic-client';

export type AcademicSetupStep =
  'years' | 'levels' | 'periods' | 'subjects' | 'classes' | 'assignments';

const steps: readonly { href: string; key: AcademicSetupStep; entity: AcademicEntity }[] = [
  { href: '/academic-years', key: 'years', entity: 'academic-years' },
  { href: '/levels', key: 'levels', entity: 'levels' },
  { href: '/periods', key: 'periods', entity: 'academic-periods' },
  { href: '/subjects', key: 'subjects', entity: 'subjects' },
  { href: '/classes', key: 'classes', entity: 'classes' },
  { href: '/assignments', key: 'assignments', entity: 'teaching-assignments' },
];

export function AcademicSetupGuide({ current }: { current: AcademicSetupStep }) {
  const t = useTranslations('Academics');
  const { session } = useAuth();
  const visibleSteps = steps.filter((step) => canAcademic(session?.session, step.entity));

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold">{t('setupGuideTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('setupGuideDescription')}</p>
        </div>
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visibleSteps.map((step) => {
            const index = steps.findIndex((candidate) => candidate.key === step.key);
            const active = step.key === current;
            return (
              <li key={step.key}>
                <Link
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/60',
                    active && 'border-primary bg-primary/5 font-semibold',
                  )}
                  href={step.href}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                      active && 'border-primary bg-primary text-primary-foreground',
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t('setupStep', { step: index + 1 })}
                    </span>
                    <span className="block truncate">{t(step.key)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
