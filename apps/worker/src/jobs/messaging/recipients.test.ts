import { describe, expect, it } from 'vitest';
import { guardianIsEligible, normalizeInternationalPhone } from './recipients.js';

describe('international phone normalization', () => {
  it('accepts E.164 and international 00 prefixes without assuming a country', () => {
    expect(normalizeInternationalPhone('+33 6 12 34 56 78')).toBe('+33612345678');
    expect(normalizeInternationalPhone('0033 6 12 34 56 78')).toBe('+33612345678');
  });
  it('rejects local numbers, extensions and impossible lengths', () => {
    expect(normalizeInternationalPhone('06 12 34 56 78')).toBeNull();
    expect(normalizeInternationalPhone('+33 6 12 34 56 78 ext 2')).toBeNull();
    expect(normalizeInternationalPhone('+123')).toBeNull();
  });
});

describe('guardian audience rules', () => {
  it('sends finance events only to financial contacts', () => {
    expect(
      guardianIsEligible({ isFinancialContact: true, receivesNotifications: false }, 'FINANCE'),
    ).toBe(true);
    expect(
      guardianIsEligible({ isFinancialContact: false, receivesNotifications: true }, 'FINANCE'),
    ).toBe(false);
  });
  it('sends school events only to guardians accepting school notifications', () => {
    expect(
      guardianIsEligible({ isFinancialContact: true, receivesNotifications: false }, 'SCHOOL'),
    ).toBe(false);
    expect(
      guardianIsEligible({ isFinancialContact: false, receivesNotifications: true }, 'SCHOOL'),
    ).toBe(true);
  });
});
