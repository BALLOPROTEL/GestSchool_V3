import { describe, expect, it } from 'vitest';
import { safeMessagingFailureCode } from './provider-error-code.js';

describe('safe messaging provider diagnostics', () => {
  it('keeps only allowlisted provider codes', () => {
    expect(safeMessagingFailureCode(new Error('BREVO_HTTP_401'))).toBe('BREVO_HTTP_401');
    expect(safeMessagingFailureCode(new Error('BREVO_CONNECTION_UNCERTAIN'))).toBe(
      'BREVO_CONNECTION_UNCERTAIN',
    );
    expect(safeMessagingFailureCode(new Error('STAGING_RECIPIENT_NOT_AUTHORIZED'))).toBe(
      'STAGING_RECIPIENT_NOT_AUTHORIZED',
    );
  });

  it('never forwards arbitrary provider error content', () => {
    expect(safeMessagingFailureCode(new Error('401 body={"api-key":"secret"}'))).toBe(
      'MESSAGING_DELIVERY_FAILED',
    );
    expect(safeMessagingFailureCode('BREVO_HTTP_403')).toBe('MESSAGING_DELIVERY_FAILED');
  });
});
