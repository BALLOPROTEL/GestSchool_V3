import { readFile, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import AxeBuilder from '@axe-core/playwright';
import type {
  DocumentView,
  LoginResult,
  OfficialDocumentType,
  ReportCardView,
  ResultList,
  FinanceList,
} from '@gestschool/contracts';
import type { Locator } from '@playwright/test';
import { pdfEvidence } from '../../api/tests/pdf-evidence';
import { expect, test, type Page } from './fixtures';
import { login, overflow, watch, type Credentials } from './academic-helpers';

interface Fixture {
  admin: Credentials;
  accountant: Credentials;
  parent: Credentials;
  student: Credentials;
  studentId: string;
  enrollmentId: string;
  otherEnrollmentId: string;
  reportId: string;
  receiptId: string;
}
function fixture(viewport: string) {
  const data = JSON.parse(
    readFileSync(new URL('../../../.local/iam-e2e.json', import.meta.url), 'utf8'),
  ) as { documents: Record<string, Fixture> };
  const value = data.documents[viewport];
  if (!value) throw new Error('Missing document fixture');
  return value;
}
async function ready(page: Page) {
  await expect(page.locator('[data-documents-ready]')).toHaveAttribute(
    'data-documents-ready',
    'true',
    { timeout: 30000 },
  );
}
async function generate(
  page: Page,
  type: OfficialDocumentType,
  sourceId: string,
  locale = 'fr',
  panel?: Locator,
) {
  await (panel ?? page).getByRole('button', { name: 'Générer un document', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Type de document', exact: true }).selectOption(type);
  await dialog.getByRole('combobox', { name: 'Langue', exact: true }).selectOption(locale);
  const source = dialog.getByRole('combobox', { name: 'Source officielle', exact: true });
  if (panel) {
    // Contextual issuance fixes the source to the report or receipt being viewed.
    await expect(source).toHaveCount(0);
  } else {
    await expect(source.locator(`option[value="${sourceId}"]`)).toHaveCount(1);
    await source.selectOption(sourceId);
  }
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/v1/documents/generate' && r.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Générer un document', exact: true }).click();
  const reply = await response;
  expect(reply.request().postDataJSON()).toEqual({ documentType: type, sourceId, locale });
  expect(reply.status()).toBe(202);
  const document = (await reply.json()) as DocumentView;
  await expect(dialog).toBeHidden();
  await expect(page.locator(`[data-document-id="${document.id}"]`)).toContainText('Prêt', {
    timeout: 60000,
  });
  return document;
}
async function pdf(page: Page, row: DocumentView) {
  const event = page.waitForEvent('download');
  await page
    .locator(`[data-document-id="${row.id}"]`)
    .getByRole('button', { name: 'Télécharger le PDF', exact: true })
    .click();
  const download = await event,
    path = await download.path();
  if (!path) throw new Error('Missing PDF download');
  const bytes = await promisify(readFile)(path);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const evidence = await pdfEvidence(bytes);
  expect(Boolean(evidence.verificationUrl)).toBe(true);
  return evidence;
}
test('LOT 10 official PDFs, QR verification, revocation and scoped downloads at every viewport', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240000);
  const data = fixture(info.project.name),
    check = watch(page);
  await login(page, data.admin, true);
  await page.goto('/fr/documents');
  await ready(page);
  const certificate = await generate(page, 'SCHOOL_CERTIFICATE', data.enrollmentId),
    evidence = await pdf(page, certificate);
  const card = await generate(page, 'STUDENT_CARD', data.enrollmentId),
    cardPdf = await pdf(page, card);
  expect(cardPdf.pages).toHaveLength(1);
  expect((cardPdf.pages[0]!.width * 25.4) / 72).toBeCloseTo(85.6, 0);
  expect((cardPdf.pages[0]!.height * 25.4) / 72).toBeCloseTo(53.98, 0);
  await page
    .locator(`[data-document-id="${card.id}"]`)
    .getByRole('button', { name: 'Aperçu', exact: true })
    .click();
  const bounds = await page.locator('[data-document-preview="STUDENT_CARD"]').boundingBox();
  expect((bounds?.width ?? 0) / (bounds?.height ?? 1)).toBeCloseTo(85.6 / 53.98, 1);
  await expect(page.getByTitle(`Aperçu · ${card.reference}`, { exact: true })).toHaveAttribute(
    'src',
    /^blob:/,
  );
  await overflow(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.goto(`/fr/students/${data.studentId}`);
  await page.getByRole('tab', { name: 'Documents officiels', exact: true }).click();
  await ready(page);
  await expect(page.locator(`[data-document-id="${card.id}"]`)).toBeVisible();
  await pdf(page, card);
  await overflow(page);
  await page.goto('/fr/grades');
  const reportList = page
    .waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/report-cards')
    .then((response) => response.json() as Promise<ResultList<ReportCardView>>);
  await page.getByRole('tab', { name: 'Bulletins', exact: true }).click();
  const sourceReport = (await reportList).items.find((report) => report.id === data.reportId);
  if (!sourceReport?.snapshot) throw new Error('Missing published report in the UI');
  const frozen = sourceReport.snapshot;
  await page
    .getByRole('row')
    .filter({ hasText: `${frozen.student.firstName} ${frozen.student.lastName}` })
    .filter({ hasText: frozen.academicPeriod.name })
    .getByRole('button', { name: 'Voir le bulletin', exact: true })
    .click();
  await expect(page.locator(`[data-report-preview="${data.reportId}"]`)).toBeVisible();
  const reportPdf = await generate(
    page,
    'REPORT_CARD',
    data.reportId,
    'fr',
    page.getByRole('region', { name: 'Bulletin scolaire', exact: true }),
  );
  await pdf(page, reportPdf);
  await overflow(page);
  await page.goto('/fr/documents');
  await ready(page);
  const unrelated = await generate(page, 'SCHOOL_CERTIFICATE', data.otherEnrollmentId);
  for (const locale of ['en', 'ar']) {
    const row = await generate(page, 'SCHOOL_CERTIFICATE', data.enrollmentId, locale);
    const generated = await pdf(page, row);
    expect(
      new URL(generated.verificationUrl ?? 'https://invalid.invalid').pathname.startsWith(
        `/${locale}/verify/`,
      ),
    ).toBe(true);
  }
  await overflow(page);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  const publicContext = await browser.newContext(
      info.project.use.viewport ? { viewport: info.project.use.viewport } : {},
    ),
    publicPage = await publicContext.newPage(),
    publicCheck = watch(publicPage);
  if (!evidence.verificationUrl) throw new Error('Missing verification URL');
  await publicPage.goto(evidence.verificationUrl).catch(() => {
    throw new Error('Public document verification navigation failed');
  });
  await expect(publicPage.getByRole('status')).toHaveText('Valide');
  await overflow(publicPage);
  expect(
    (
      await new AxeBuilder({ page: publicPage })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .locator(`[data-document-id="${certificate.id}"]`)
    .getByRole('button', { name: 'Révoquer', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel('Motif de révocation')
    .fill('Remplacement de la pièce officielle');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await publicPage.reload();
  await expect(publicPage.getByRole('status')).toHaveText('Révoqué');
  for (const [locale, status] of [
    ['fr', 'Document invalide ou introuvable.'],
    ['en', 'Invalid or unknown document.'],
    ['ar', 'وثيقة غير صالحة أو غير موجودة.'],
  ] as const) {
    await publicPage.goto(`/${locale}/verify/invalid-token`);
    await expect(publicPage.getByRole('status')).toHaveText(status);
    await expect(publicPage.locator('html')).toHaveAttribute(
      'dir',
      locale === 'ar' ? 'rtl' : 'ltr',
    );
    await overflow(publicPage);
  }
  publicCheck();
  await publicContext.close();
  for (const [locale, title] of [
    ['en', 'Official documents'],
    ['ar', 'الوثائق الرسمية'],
  ] as const) {
    await page.goto(`/${locale}/documents`);
    await ready(page);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await overflow(page);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  }
  check();
  for (const role of ['parent', 'student', 'accountant'] as const) {
    const context = await browser.newContext(
        info.project.use.viewport ? { viewport: info.project.use.viewport } : {},
      ),
      own = await context.newPage(),
      ownCheck = watch(own);
    const loginResponse =
      role === 'accountant'
        ? null
        : own
            .waitForResponse(
              (r) =>
                new URL(r.url()).pathname === '/api/v1/auth/login' &&
                r.request().method() === 'POST',
            )
            .then((response) => response.json() as Promise<LoginResult>);
    await login(own, data[role], role === 'accountant');
    const auth = await loginResponse;
    await own.goto('/fr/documents');
    await ready(own);
    if (role === 'accountant') {
      await own.goto('/fr/finance');
      const receiptList = own
        .waitForResponse(
          (response) => new URL(response.url()).pathname === '/api/v1/finance/receipts',
        )
        .then((response) => response.json() as Promise<FinanceList>);
      await own.getByRole('tab', { name: 'Reçus', exact: true }).click();
      const sourceReceipt = (await receiptList).items.find((entry) => entry.id === data.receiptId);
      if (sourceReceipt?.kind !== 'receipts')
        throw new Error('Missing validated receipt in Finance');
      await own
        .getByRole('row')
        .filter({ hasText: sourceReceipt.receiptNumber })
        .getByRole('button', { name: 'Voir les détails', exact: true })
        .click();
      const receipt = await generate(
        own,
        'RECEIPT',
        data.receiptId,
        'fr',
        own.getByRole('region', { name: 'Reçu de paiement', exact: true }),
      );
      await pdf(own, receipt);
    } else {
      if (auth?.kind !== 'session') throw new Error('Expected scoped session');
      await expect(own.locator(`[data-document-id="${card.id}"]`)).toBeVisible();
      await pdf(own, card);
      await expect(own.locator(`[data-document-id="${unrelated.id}"]`)).toHaveCount(0);
      const denied = await own.request.get(`/api/v1/documents/${unrelated.id}/download`, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      expect(denied.status()).toBe(404);
      await expect(
        own.getByRole('button', { name: 'Générer un document', exact: true }),
      ).toHaveCount(0);
    }
    await overflow(own);
    ownCheck();
    await context.close();
  }
});
