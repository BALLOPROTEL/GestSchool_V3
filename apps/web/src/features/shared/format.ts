import type { AppLocale } from '../../i18n/routing';

const localeMap: Record<AppLocale, string> = {
  ar: 'ar-CI',
  en: 'en-CI',
  fr: 'fr-CI',
};

export function formatCurrency(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(localeMap[locale], {
    currency: 'XOF',
    currencyDisplay: 'code',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
}

export function formatNumber(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(localeMap[locale]).format(value);
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .filter((letter): letter is string => letter !== undefined)
    .join('')
    .slice(0, 2)
    .toLocaleUpperCase();
}
