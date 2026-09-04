'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

export function useMockAction() {
  const translate = useTranslations('Common');
  return (label?: string) =>
    toast.info(label ?? translate('mockAction'), { description: translate('mockAction') });
}
