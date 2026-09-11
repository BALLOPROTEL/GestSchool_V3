import { describe, expect, it } from 'vitest';
import {
  assessmentInput,
  gradeBulkInput,
  gradeCorrectionInput,
  gradeEntry,
  type GradeOutcome,
} from '@gestschool/contracts';
import { randomUUID } from 'node:crypto';
import {
  competitionRanks,
  decimalFraction,
  decimalUnits,
  fraction,
  roundAverage,
  subjectAverage,
  weightedAverage,
} from './calculations.js';
import { transition, draftOnly } from './policy.js';

const row = (
  score: string | null,
  maxScore = '20',
  weight = '1',
  outcome: GradeOutcome = 'SCORED',
) => ({ score, maxScore, weight, outcome });
const display = (scores: ReturnType<typeof row>[], scale = '20') => {
  const result = subjectAverage(scores, scale);
  return result.average ? roundAverage(result.average) : null;
};
describe('LOT 9 exact result arithmetic', () => {
  it('calculates a simple mean', () => expect(display([row('12'), row('16')])).toBe('14.00'));
  it('distinguishes assessment weights from subject coefficients', () =>
    expect(display([row('10'), row('14'), row('18', '20', '2')])).toBe('15.00'));
  it('normalizes different scales', () =>
    expect(display([row('15'), row('38', '50')])).toBe('15.10'));
  it('supports the official school scale', () =>
    expect(display([row('15'), row('38', '50')], '100')).toBe('75.50'));
  it('weights subjects with class-specific coefficients', () => {
    const result = weightedAverage([
      { value: decimalFraction('15'), weight: '4' },
      { value: decimalFraction('12'), weight: '3' },
      { value: decimalFraction('18'), weight: '2' },
    ]);
    expect(result && roundAverage(result)).toBe('14.67');
  });
  it('handles decimal weights exactly', () =>
    expect(display([row('12.25', '20', '0.75'), row('17.50', '20', '1.25')])).toBe('15.53'));
  it('does not round intermediate subject averages', () => {
    const subject = subjectAverage([row('1', '3')]).average;
    expect(subject && roundAverage(subject)).toBe('6.67');
    const overall = weightedAverage([
      { value: subject ?? fraction(0n), weight: '1' },
      { value: fraction(0n), weight: '1' },
    ]);
    expect(overall && roundAverage(overall)).toBe('3.33');
  });
  it.each([
    ['1.005', fraction(1005n, 1000n), '1.01'],
    ['1.0049', fraction(10049n, 10000n), '1.00'],
    ['2.675', fraction(2675n, 1000n), '2.68'],
    ['zero', fraction(0n), '0.00'],
  ] as const)('rounds %s HALF_UP only at the boundary', (_name, value, expected) =>
    expect(roundAverage(value)).toBe(expected),
  );
  it('keeps a real zero distinct from missing', () => expect(display([row('0')])).toBe('0.00'));
  it('accepts the maximum', () => expect(display([row('99999.99', '99999.99')])).toBe('20.00'));
  it('rejects out-of-range grades', () =>
    expect(() => display([row('20.01')])).toThrow(RangeError));
  it.each(['-1', '1.234', 'NaN', 'Infinity', '1e2', '01', '100000', ''])(
    'rejects ambiguous or unsupported decimal %s',
    (value) => expect(() => decimalUnits(value)).toThrow(RangeError),
  );
  it.each(['0', '0.00'])('rejects zero maxima/weights %s', (value) => {
    expect(() => display([row('0', value)])).toThrow(RangeError);
    expect(() => display([row('10', '20', value)])).toThrow(RangeError);
  });
  it('never turns absence into zero or a partial average', () => {
    expect(subjectAverage([row('18'), row(null, '20', '1', 'ABSENT')])).toMatchObject({
      average: null,
      complete: false,
      outcome: 'ABSENT',
      missing: 1,
    });
  });
  it('excludes excused assessments from weights', () =>
    expect(display([row('18'), row(null, '20', '10', 'EXCUSED')])).toBe('18.00'));
  it('distinguishes full exemption from a subject without results', () => {
    expect(subjectAverage([row(null, '20', '1', 'EXCUSED')])).toMatchObject({
      average: null,
      complete: true,
      outcome: 'EXCUSED',
    });
    expect(subjectAverage([])).toMatchObject({
      average: null,
      complete: false,
      outcome: 'NOT_GRADED',
    });
  });
  it('marks missing entries as incomplete', () =>
    expect(subjectAverage([row('15'), row(null, '20', '1', 'NOT_GRADED')])).toMatchObject({
      complete: false,
      average: null,
    }));
  it('rejects a numeric absence and a null scored grade', () => {
    expect(() => subjectAverage([row('0', '20', '1', 'ABSENT')])).toThrow(RangeError);
    expect(() => subjectAverage([row(null)])).toThrow(RangeError);
  });
  it('does not invent a general average without applicable subjects', () =>
    expect(weightedAverage([])).toBeNull());
});
describe('LOT 9 rank policy', () => {
  it('uses competition ranks and leaves insufficient students unranked', () => {
    const result = competitionRanks([
      { id: 'a', average: '15.50', complete: true },
      { id: 'b', average: '14.75', complete: true },
      { id: 'c', average: '14.75', complete: true },
      { id: 'd', average: '13.80', complete: true },
      { id: 'e', average: null, complete: false },
      { id: 'f', average: '19.00', complete: false },
      { id: 'g', average: '0.00', complete: true },
    ]);
    expect([...result.values()]).toEqual([1, 2, 2, 4, null, null, 5]);
  });
  it('ties the officially displayed averages', () =>
    expect([
      ...competitionRanks([
        { id: 'b', average: '10.00', complete: true },
        { id: 'a', average: '10', complete: true },
      ]).values(),
    ]).toEqual([1, 1]));
  it('handles no eligible students', () => expect(competitionRanks([]).size).toBe(0));
});
describe('LOT 9 workflow and input contracts', () => {
  it.each([
    ['DRAFT', 'submit', 'SUBMITTED'],
    ['SUBMITTED', 'validate', 'VALIDATED'],
    ['VALIDATED', 'publish', 'PUBLISHED'],
    ['PUBLISHED', 'lock', 'LOCKED'],
    ['SUBMITTED', 'reopen', 'DRAFT'],
  ] as const)('%s → %s → %s', (from, action, to) => expect(transition(from, action)).toBe(to));
  it.each([
    ['DRAFT', 'publish'],
    ['PUBLISHED', 'reopen'],
    ['LOCKED', 'reopen'],
    ['SUBMITTED', 'lock'],
    ['VALIDATED', 'submit'],
  ] as const)('rejects %s → %s', (from, action) =>
    expect(() => transition(from, action)).toThrow(),
  );
  it.each(['SUBMITTED', 'VALIDATED', 'PUBLISHED', 'LOCKED'] as const)(
    'does not allow ordinary patches in %s',
    (status) => expect(() => draftOnly(status, null)).toThrow(),
  );
  it('does not edit archived drafts', () => expect(() => draftOnly('DRAFT', new Date())).toThrow());
  it('rejects duplicate students in a single bulk request', () => {
    const grade = { studentId: randomUUID(), score: '12', outcome: 'SCORED' };
    expect(gradeBulkInput.safeParse({ expectedVersion: 1, grades: [grade, grade] }).success).toBe(
      false,
    );
  });
  it.each(['ABSENT', 'EXCUSED', 'NOT_GRADED'] as const)(
    'requires a null score for %s',
    (outcome) => {
      expect(gradeEntry.safeParse({ studentId: randomUUID(), outcome, score: null }).success).toBe(
        true,
      );
      expect(gradeEntry.safeParse({ studentId: randomUUID(), outcome, score: '0' }).success).toBe(
        false,
      );
    },
  );
  it('requires a real correction reason', () =>
    expect(
      gradeCorrectionInput.safeParse({
        expectedVersion: 1,
        score: '14',
        outcome: 'SCORED',
        reason: ' ',
      }).success,
    ).toBe(false));
  it('does not accept tenant or workflow injection', () => {
    const data = {
      classSubjectId: randomUUID(),
      academicPeriodId: randomUUID(),
      title: 'Test',
      assessedOn: '2026-10-15',
    };
    expect(assessmentInput.safeParse({ ...data, tenantId: randomUUID() }).success).toBe(false);
    expect(assessmentInput.safeParse({ ...data, status: 'PUBLISHED' }).success).toBe(false);
  });
});
