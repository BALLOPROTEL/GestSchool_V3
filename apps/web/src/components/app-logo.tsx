'use client';

import { GraduationCap } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function AppLogo({ compact = false }: { compact?: boolean }) {
  const shell = useTranslations('Shell');
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-950/25">
        <GraduationCap aria-hidden="true" className="size-5" />
      </span>
      {compact ? null : (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-bold text-white">GestSchool</span>
          <span className="block truncate text-[10px] font-medium text-blue-400">
            {shell('portal')}
          </span>
        </span>
      )}
    </div>
  );
}
