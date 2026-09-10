import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import type {
  FeeScheduleView,
  FeeTypeView,
  InvoiceView,
  LoginResult,
  PaymentView,
} from '@gestschool/contracts';
import { expect, test, type Page } from './fixtures';
import { login, overflow, watch, type Credentials } from './academic-helpers';
interface Fixture {
  accountant: Credentials;
  locales: Credentials;
  parent: Credentials;
  student: Credentials;
  teacher: Credentials;
  yearId: string;
  targetClassId: string;
  ownStudentId: string;
  otherStudentId: string;
  ownEnrollmentId: string;
  invoiceIds: string[];
  scheduleId: string;
  cashSessionId: string;
}
function fixtures() {
  return JSON.parse(
    readFileSync(new URL('../../../.local/iam-e2e.json', import.meta.url), 'utf8'),
  ) as { finance: Record<string, Fixture> };
}
function fixture(viewport: string) {
  const value = fixtures().finance[viewport];
  if (!value) throw new Error('Missing Finance fixture');
  return value;
}
const money = (amount: string, locale = 'fr') =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'XOF',
    maximumFractionDigits: 0,
  }).format(BigInt(amount));
async function ready(page: Page) {
  // Fresh portal contexts restore their session before querying Finance. Allow local CPU contention
  // without bypassing the actual loaded state or any subsequent money/scope/error assertions.
  await expect(page.locator('[data-finance-ready]').first()).toHaveAttribute(
    'data-finance-ready',
    'true',
    { timeout: 30_000 },
  );
}
async function tab(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
  await ready(page);
}
async function fields(page: Page, values: Record<string, string>) {
  for (const [key, value] of Object.entries(values))
    await page.getByRole('dialog').locator(`input[name="${key}"]`).fill(value);
}
async function pick(page: Page, label: string, value: string) {
  const select = page.getByRole('dialog').getByRole('combobox', { name: label, exact: true });
  await expect(select).toBeEnabled();
  await expect(select.locator(`option[value="${value}"]`)).toHaveCount(1);
  await select.selectOption(value);
}
async function save<T>(page: Page, path: string, method = 'POST'): Promise<T> {
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === `/api/v1/finance/${path}` && r.request().method() === method,
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer', exact: true }).click();
  const received = await response;
  expect(received.ok()).toBe(true);
  await expect(page.getByRole('dialog')).toBeHidden();
  await ready(page);
  return (await received.json()) as T;
}
async function invoiceDetail(page: Page, number: string) {
  await tab(page, 'Factures');
  const row = page.getByRole('row').filter({ hasText: number });
  await row.getByRole('button', { name: 'Voir les détails', exact: true }).click();
  await expect(page.locator('[data-finance-detail="invoices"]')).toContainText(number);
}
test('LOT 8 accountant configures fees, collects twice, reverses and reconciles cash', async ({
  page,
}, info) => {
  test.skip(
    !['360x800', '1440x900'].includes(info.project.name),
    'Mutation workflow on mobile and desktop; localization and scope checks at all seven widths.',
  );
  test.slow();
  const data = fixture(`workflow-${info.project.name}`),
    check = watch(page),
    code = `F8-${Date.now()}`;
  await login(page, data.accountant, true);
  await page.goto('/fr/finance');
  await ready(page);
  await overflow(page);
  await page.getByRole('button', { name: 'Créer un type de frais', exact: true }).click();
  await fields(page, { code, name: `Scolarité ${code}` });
  const fee = await save<FeeTypeView>(page, 'fee-types');
  await page.getByRole('button', { name: 'Créer une grille', exact: true }).click();
  await fields(page, { code, name: `Grille ${code}` });
  await pick(page, 'Année scolaire', data.yearId);
  await pick(page, 'Classe', data.targetClassId);
  const schedule = await save<FeeScheduleView>(page, 'fee-schedules');
  await page
    .locator('[data-finance-detail]')
    .getByRole('button', { name: 'Ajouter un tarif', exact: true })
    .click();
  await pick(page, 'Type de frais', fee.id);
  await fields(page, { amount: '300000', dueOn: '2027-06-30' });
  for (const due of ['2026-10-31', '2027-01-31', '2027-06-30']) {
    await page.getByRole('button', { name: 'Ajouter une échéance', exact: true }).click();
    const part = page.getByRole('dialog').locator('fieldset fieldset').last();
    await part.getByLabel('Montant (XOF)', { exact: true }).fill('100000');
    await part.getByLabel('Date limite', { exact: true }).fill(due);
  }
  await overflow(page);
  expect(
    (
      await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await save(page, `fee-schedules/${schedule.id}/items`);
  await page.getByRole('button', { name: 'Créer une facture', exact: true }).click();
  await pick(page, 'Élève', data.ownStudentId);
  await pick(page, 'Inscription active', data.ownEnrollmentId);
  await pick(page, 'Grille tarifaire', schedule.id);
  await fields(page, { issuedOn: '2026-09-09' });
  const invoice = await save<InvoiceView>(page, 'invoices');
  expect(invoice.totalAmountMinor).toBe('300000');
  const captured: PaymentView[] = [];
  for (const [amount, balance] of [
    ['100000', '200000'],
    ['50000', '150000'],
  ] as const) {
    await invoiceDetail(page, invoice.invoiceNumber);
    await page
      .locator('[data-finance-detail]')
      .getByRole('button', { name: 'Enregistrer un paiement', exact: true })
      .click();
    await fields(page, { amount });
    if (amount === '50000') {
      await page
        .getByRole('dialog')
        .getByRole('combobox', { name: 'Méthode de paiement', exact: true })
        .selectOption('CASH');
      await pick(page, 'Session de caisse', data.cashSessionId);
    }
    const payment = await save<PaymentView>(page, 'payments');
    await page
      .locator('[data-finance-detail="payments"]')
      .getByRole('button', { name: 'Valider le paiement', exact: true })
      .click();
    const validated = await save<PaymentView>(page, `payments/${payment.id}/validate`);
    captured.push(validated);
    const receipt = validated.receipts[0];
    if (!receipt) throw new Error('Missing validated receipt');
    await page
      .locator('[data-finance-detail]')
      .getByRole('button', { name: receipt.receiptNumber, exact: true })
      .click();
    await expect(page.locator('[data-finance-detail="receipts"]')).toContainText(money(amount));
    await invoiceDetail(page, invoice.invoiceNumber);
    await expect(page.locator('[data-finance-detail]')).toContainText(money(balance));
  }
  const first = captured[0];
  if (!first) throw new Error('Missing captured payment');
  await tab(page, 'Paiements');
  await page
    .getByRole('row')
    .filter({ hasText: first.paymentReference })
    .getByRole('button', { name: 'Voir les détails', exact: true })
    .click();
  await page
    .locator('[data-finance-detail]')
    .getByRole('button', { name: 'Demander l’annulation', exact: true })
    .click();
  await fields(page, { reason: 'Demande de correction E2E' });
  await save(page, `payments/${first.id}/request-cancellation`);
  await page
    .locator('[data-finance-detail]')
    .getByRole('button', { name: 'Confirmer l’annulation', exact: true })
    .click();
  await fields(page, { reason: 'Remboursement approuvé E2E' });
  const reversed = await save<PaymentView>(page, `payments/${first.id}/cancel`);
  expect(reversed.reversals).toHaveLength(1);
  await expect(page.locator('[data-finance-detail]')).toContainText('Historique des annulations');
  await invoiceDetail(page, invoice.invoiceNumber);
  await expect(page.locator('[data-finance-detail]')).toContainText(money('250000'));
  await tab(page, 'Caisse');
  await page
    .getByRole('row')
    .filter({ hasText: 'Ouverte' })
    .getByRole('button', { name: 'Voir les détails', exact: true })
    .click();
  await page
    .locator('[data-finance-detail]')
    .getByRole('button', { name: 'Clôturer la caisse', exact: true })
    .click();
  await fields(page, { amount: '360000', reason: 'Clôture de la caisse témoin' });
  await save(page, `cash-sessions/${data.cashSessionId}/close`);
  await page.getByRole('button', { name: 'Ouvrir une caisse', exact: true }).click();
  await fields(page, { amount: '10000' });
  const cash = await save<{ id: string }>(page, 'cash-sessions/open');
  await page
    .locator('[data-finance-detail]')
    .getByRole('button', { name: 'Clôturer la caisse', exact: true })
    .click();
  await fields(page, { amount: '10000', reason: 'Clôture de contrôle E2E' });
  await save(page, `cash-sessions/${cash.id}/close`);
  await page.goto(`/fr/students/${data.ownStudentId}`);
  await page.getByRole('tab', { name: 'Situation financière', exact: true }).click();
  await ready(page);
  await expect(page.getByRole('row').filter({ hasText: invoice.invoiceNumber })).toContainText(
    money('250000'),
  );
  await overflow(page);
  check();
});
test('LOT 8 Finance FR EN AR, dialogs, accessibility and exact money at every viewport', async ({
  page,
}, info) => {
  test.slow();
  const data = fixture(info.project.name),
    check = watch(page);
  await login(page, data.locales, true);
  for (const locale of ['fr', 'en', 'ar'] as const) {
    await page.goto(`/${locale}/finance`);
    await ready(page);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('main')).toContainText(money('900000', locale));
    await overflow(page);
    const create = { fr: 'Créer un type de frais', en: 'Create fee type', ar: 'إنشاء نوع رسوم' }[
      locale
    ];
    await page.getByRole('button', { name: create, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('dialog').locator(':focus')).toHaveCount(1);
    await overflow(page);
    expect(
      (
        await new AxeBuilder({ page })
          .include('[role="dialog"]')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(
      (
        await new AxeBuilder({ page })
          .include('main')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  check();
});
test('LOT 8 parent CHILDREN, student OWN, teacher denial and cross-tenant reads', async ({
  browser,
}, info) => {
  test.slow();
  const data = fixture(info.project.name),
    other = Object.values(fixtures().finance).find((f) => f.ownStudentId !== data.ownStudentId);
  if (!other?.invoiceIds[0]) throw new Error('Missing cross-tenant invoice');
  for (const role of ['parent', 'student', 'teacher'] as const) {
    const context = await browser.newContext(
      info.project.use.viewport ? { viewport: info.project.use.viewport } : {},
    );
    const page = await context.newPage(),
      check = watch(page);
    const response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/v1/auth/login' && r.request().method() === 'POST',
    );
    await login(page, data[role], false);
    const auth = (await (await response).json()) as LoginResult;
    if (auth.kind !== 'session') throw new Error('Expected scoped login');
    await page.goto('/fr/finance');
    await ready(page);
    if (role === 'teacher') {
      await expect(page.locator('[data-finance-denied]')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Créer une facture', exact: true }),
      ).toHaveCount(0);
    } else {
      await expect(page.getByRole('row').filter({ hasText: 'Élève Lié' })).toHaveCount(3);
      await expect(
        page.getByRole('button', { name: 'Créer une facture', exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole('tab', { name: 'Caisse', exact: true })).toHaveCount(0);
      const hidden = await page.request.get(`/api/v1/finance/invoices/${other.invoiceIds[0]}`, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      expect(hidden.status()).toBe(404);
      const outside = await page.request.get(
        `/api/v1/finance/summary?studentId=${data.otherStudentId}`,
        { headers: { Authorization: `Bearer ${auth.accessToken}` } },
      );
      expect(await outside.json()).toEqual({ currencies: [] });
    }
    await overflow(page);
    check();
    await context.close();
  }
});
