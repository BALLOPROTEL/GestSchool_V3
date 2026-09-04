'use client';

import { StatusBadge, type StatusTone } from '@gestschool/ui';
import { useTranslations } from 'next-intl';

export type DisplayStatus =
  | 'absent'
  | 'active'
  | 'cancelled'
  | 'draft'
  | 'excused'
  | 'inactive'
  | 'late'
  | 'overdue'
  | 'paid'
  | 'partial'
  | 'pending'
  | 'present'
  | 'sent'
  | 'suspended'
  | 'transferred';

const tones: Record<DisplayStatus, StatusTone> = {
  absent: 'danger',
  active: 'success',
  cancelled: 'neutral',
  draft: 'warning',
  excused: 'info',
  inactive: 'neutral',
  late: 'warning',
  overdue: 'danger',
  paid: 'success',
  partial: 'warning',
  pending: 'warning',
  present: 'success',
  sent: 'success',
  suspended: 'danger',
  transferred: 'info',
};

export function StatusPill({ status }: { status: DisplayStatus }) {
  const translate = useTranslations('Status');
  return (
    <StatusBadge dot tone={tones[status]}>
      {translate(status)}
    </StatusBadge>
  );
}
