import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  defaultLocale: 'fr',
  localeDetection: false,
  localePrefix: 'always',
  locales: ['fr', 'en', 'ar'],
});

export type AppLocale = (typeof routing.locales)[number];
