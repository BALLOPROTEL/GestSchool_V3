import { setTimeout } from 'node:timers/promises';
import { expect, type Page } from './fixtures';
import { nextMfaCounter, readMfaState, totp, writeMfaState } from './mfa-state';

export interface Credentials {
  email: string;
  password: string;
  mfaSecret?: string;
}

export async function completeMfa(page: Page, credentials: Credentials) {
  await expect(
    page.getByRole('heading', { name: 'Vérification en deux étapes', exact: true }),
  ).toBeVisible();
  const code = page.getByLabel('Code à six chiffres', { exact: true });
  await expect(code).toBeVisible();
  const saved = await readMfaState(credentials.email);
  const enrollment = page.getByTestId('mfa-secret');
  const secret = (await enrollment.isVisible())
    ? await enrollment.textContent()
    : (credentials.mfaSecret ?? saved?.secret);
  if (!secret) throw new Error('Missing private E2E MFA fixture for an enrolled account');

  const next = nextMfaCounter(Date.now(), saved?.secret === secret ? saved.counter : -1);
  if (next.waitMs) await setTimeout(next.waitMs);
  const counter = Math.floor(Date.now() / 30_000);
  // Persist BEFORE sending: a retry may start after the server accepted the code but before
  // the browser observed success. Reserving that counter also preserves replay protection.
  await writeMfaState(credentials.email, { secret, counter });
  try {
    await code.fill(totp(secret, counter));
  } catch {
    throw new Error('Cannot fill E2E MFA code (sensitive action details omitted)');
  }
  await page.getByRole('button', { name: 'Vérifier', exact: true }).click();
}
