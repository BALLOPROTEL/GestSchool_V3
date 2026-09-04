import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { routing } from './i18n/routing';
import { formatCurrency } from './features/shared/format';
import { students } from './mocks/data';

function readMessages(locale: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'),
  ) as unknown;
}

function messageKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, nested]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof nested === 'string' ? [path] : messageKeys(nested, path);
  });
}

describe('LOT 1 localisation contract', () => {
  it('uses French as the default and exposes all requested locales', () => {
    expect(routing.defaultLocale).toBe('fr');
    expect(routing.localeDetection).toBe(false);
    expect(routing.locales).toEqual(['fr', 'en', 'ar']);
    expect(routing.localePrefix).toBe('always');
  });

  it('keeps French, English and Arabic message catalogs structurally identical', () => {
    const frenchKeys = messageKeys(readMessages('fr')).toSorted();
    expect(messageKeys(readMessages('en')).toSorted()).toEqual(frenchKeys);
    expect(messageKeys(readMessages('ar')).toSorted()).toEqual(frenchKeys);
    expect(frenchKeys.length).toBeGreaterThan(150);
  });
});

describe('LOT 1 presentation data', () => {
  it('formats all financial values in XOF', () => {
    expect(formatCurrency(150_000, 'fr')).toContain('XOF');
    expect(formatCurrency(150_000, 'en')).toContain('XOF');
    expect(formatCurrency(150_000, 'ar')).toContain('XOF');
  });

  it('provides realistic, typed demonstration records', () => {
    expect(students.length).toBeGreaterThanOrEqual(8);
    expect(students.every((student) => student.id.startsWith('EL-'))).toBe(true);
    expect(students.every((student) => student.name.includes(' '))).toBe(true);
  });
});
