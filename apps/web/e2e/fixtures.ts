// Set this inside each test worker, not only in the configuration process:
// failed authentication pages can contain passwords and MFA enrollment keys.
process.env['PLAYWRIGHT_NO_COPY_PROMPT'] = '1';

export { expect, test, type Page } from '@playwright/test';
