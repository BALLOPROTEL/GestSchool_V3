import type { GradeOutcome } from '@gestschool/contracts';

// Exact rational arithmetic: decimal inputs never pass through IEEE-754 numbers.
export interface Fraction {
  readonly numerator: bigint;
  readonly denominator: bigint;
}
function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}
export function fraction(numerator: bigint, denominator = 1n): Fraction {
  if (denominator <= 0n || numerator < 0n) throw new RangeError('Invalid nonnegative fraction');
  const common = gcd(numerator, denominator);
  return { numerator: numerator / common, denominator: denominator / common };
}
export function decimalUnits(value: string): bigint {
  if (!/^(0|[1-9]\d{0,4})(\.\d{1,2})?$/.test(value)) throw new RangeError('Invalid decimal');
  const [whole = '0', decimals = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(decimals.padEnd(2, '0'));
}
export function decimalFraction(value: string): Fraction {
  return fraction(decimalUnits(value), 100n);
}
function add(a: Fraction, b: Fraction): Fraction {
  return fraction(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator,
  );
}
function multiply(a: Fraction, b: Fraction): Fraction {
  return fraction(a.numerator * b.numerator, a.denominator * b.denominator);
}
function divide(a: Fraction, b: Fraction): Fraction {
  if (!b.numerator) throw new RangeError('Division by zero');
  return fraction(a.numerator * b.denominator, a.denominator * b.numerator);
}
export function roundAverage(value: Fraction): string {
  const units = (value.numerator * 200n + value.denominator) / (value.denominator * 2n);
  return `${units / 100n}.${String(units % 100n).padStart(2, '0')}`;
}
export function weightedAverage(
  rows: readonly { value: Fraction; weight: string }[],
): Fraction | null {
  if (!rows.length) return null;
  let numerator = fraction(0n),
    denominator = fraction(0n);
  for (const row of rows) {
    const weight = decimalFraction(row.weight);
    if (!weight.numerator) throw new RangeError('Nonpositive weight');
    numerator = add(numerator, multiply(row.value, weight));
    denominator = add(denominator, weight);
  }
  return divide(numerator, denominator);
}
export interface CalculationGrade {
  score: string | null;
  maxScore: string;
  weight: string;
  outcome: GradeOutcome;
}
export function subjectAverage(rows: readonly CalculationGrade[], scale = '20') {
  const target = decimalFraction(scale);
  if (!target.numerator) throw new RangeError('Nonpositive scale');
  let missing = 0,
    absent = false;
  const scored: { value: Fraction; weight: string }[] = [];
  for (const row of rows) {
    const maximum = decimalUnits(row.maxScore);
    if (!maximum || !decimalUnits(row.weight)) throw new RangeError('Nonpositive scale or weight');
    if ((row.outcome === 'SCORED') !== (row.score !== null))
      throw new RangeError('Inconsistent outcome');
    if (row.outcome === 'EXCUSED') continue;
    if (row.score === null) {
      missing++;
      absent ||= row.outcome === 'ABSENT';
      continue;
    }
    const score = decimalUnits(row.score);
    if (score > maximum) throw new RangeError('Score exceeds maximum');
    scored.push({ value: multiply(fraction(score, maximum), target), weight: row.weight });
  }
  const complete = rows.length > 0 && missing === 0;
  const average = complete ? weightedAverage(scored) : null;
  const outcome: GradeOutcome = average
    ? 'SCORED'
    : complete
      ? 'EXCUSED'
      : absent
        ? 'ABSENT'
        : 'NOT_GRADED';
  return { average, complete, outcome, missing, scored: scored.length };
}
export function competitionRanks(
  rows: readonly { id: string; average: string | null; complete: boolean }[],
): Map<string, number | null> {
  const ranks = new Map<string, number | null>(rows.map((row) => [row.id, null]));
  const eligible = rows
    .filter((row): row is typeof row & { average: string } => row.complete && row.average !== null)
    .toSorted((a, b) => {
      const difference = decimalUnits(b.average) - decimalUnits(a.average);
      return difference > 0n ? 1 : difference < 0n ? -1 : a.id.localeCompare(b.id);
    });
  let previous: bigint | null = null,
    rank = 0;
  eligible.forEach((row, index) => {
    const value = decimalUnits(row.average);
    if (value !== previous) rank = index + 1;
    previous = value;
    ranks.set(row.id, rank);
  });
  return ranks;
}
