import { describe, expect, it } from 'vitest';
import { loadMessagingConfig } from './messaging.js';
import { randomBytes } from 'node:crypto';

const key = Buffer.alloc(32, 1).toString('base64');

function remoteEnvironment(mode: 'staging' | 'production'): NodeJS.ProcessEnv {
  return {
    APP_ENV: mode,
    NODE_ENV: 'production',
    IAM_ENV: mode,
    MESSAGING_PROVIDER: 'brevo',
    APP_PUBLIC_ORIGIN: 'https://app.example.com',
    MESSAGING_TOKEN_KEY: randomBytes(32).toString('base64'),
    BREVO_API_KEY: randomBytes(32).toString('hex'),
    BREVO_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
    BREVO_EMAIL_SENDER: 'sender@example.com',
    BREVO_WHATSAPP_SENDER: '33612345678',
    BREVO_WHATSAPP_TEMPLATE_IDS_JSON: '{"fr":1,"en":2,"ar":3}',
  };
}

describe('remote email-only staging and production boundaries', () => {
  it.each([undefined, '', '{}'])(
    'starts staging without WhatsApp sender or templates (%s)',
    (templates) => {
      const config = loadMessagingConfig({
        ...remoteEnvironment('staging'),
        BREVO_WHATSAPP_SENDER: undefined,
        BREVO_WHATSAPP_TEMPLATE_IDS_JSON: templates,
      });
      expect(config.mode).toBe('brevo');
      expect(Buffer.from(config.tokenKey, 'base64')).toHaveLength(32);
      expect(config.whatsAppEnabled).toBe(false);
      expect(config.whatsAppSender).toBeNull();
      expect(config.whatsAppTemplateIds).toEqual({});
      expect(config.stagingEmailRecipient).toBeNull();
    },
  );

  it.each(['BREVO_API_KEY', 'BREVO_WEBHOOK_SECRET', 'BREVO_EMAIL_SENDER'])(
    'still rejects staging without %s',
    (name) => {
      expect(() =>
        loadMessagingConfig({ ...remoteEnvironment('staging'), [name]: undefined }),
      ).toThrow(name);
    },
  );

  it('still rejects local messaging in staging', () => {
    expect(() =>
      loadMessagingConfig({ ...remoteEnvironment('staging'), MESSAGING_PROVIDER: 'local' }),
    ).toThrow('Production messaging requires Brevo');
  });

  it('keeps production WhatsApp disabled by default without requiring sender or templates', () => {
    const config = loadMessagingConfig({
      ...remoteEnvironment('production'),
      BREVO_WHATSAPP_SENDER: undefined,
      BREVO_WHATSAPP_TEMPLATE_IDS_JSON: undefined,
    });
    expect(config.whatsAppEnabled).toBe(false);
    expect(config.whatsAppSender).toBeNull();
    expect(config.whatsAppTemplateIds).toEqual({});
  });

  it('requires a WhatsApp sender only after explicit production opt-in', () => {
    expect(() =>
      loadMessagingConfig({
        ...remoteEnvironment('production'),
        BREVO_WHATSAPP_ENABLED: 'true',
        BREVO_WHATSAPP_SENDER: undefined,
      }),
    ).toThrow();
  });

  it.each(['fr', 'en', 'ar'])(
    'requires the %s template only after explicit production WhatsApp opt-in',
    (locale) => {
      const templates: Record<string, number> = { fr: 1, en: 2, ar: 3 };
      delete templates[locale];
      expect(() =>
        loadMessagingConfig({
          ...remoteEnvironment('production'),
          BREVO_WHATSAPP_ENABLED: 'true',
          BREVO_WHATSAPP_TEMPLATE_IDS_JSON: JSON.stringify(templates),
        }),
      ).toThrow('Brevo requires approved FR/EN/AR WhatsApp template IDs');
    },
  );

  it('never enables WhatsApp in staging even if the flag is supplied', () => {
    expect(
      loadMessagingConfig({
        ...remoteEnvironment('staging'),
        BREVO_WHATSAPP_ENABLED: 'true',
      }).whatsAppEnabled,
    ).toBe(false);
  });

  describe.each(['staging', 'production'] as const)('%s token boundaries', (mode) => {
    it('rejects a missing token key', () => {
      expect(() =>
        loadMessagingConfig({
          ...remoteEnvironment(mode),
          MESSAGING_TOKEN_KEY: undefined,
        }),
      ).toThrow('Messaging token encryption requires a 256-bit key');
    });
    it.each([31, 33])('rejects a %i-byte token key', (bytes) => {
      expect(() =>
        loadMessagingConfig({
          ...remoteEnvironment(mode),
          MESSAGING_TOKEN_KEY: randomBytes(bytes).toString('base64'),
        }),
      ).toThrow('Messaging token encryption requires a 256-bit key');
    });
    it('rejects noncanonical base64', () => {
      const environment = remoteEnvironment(mode);
      expect(() =>
        loadMessagingConfig({
          ...environment,
          MESSAGING_TOKEN_KEY: environment['MESSAGING_TOKEN_KEY']!.slice(0, -1),
        }),
      ).toThrow('MESSAGING_TOKEN_KEY requires a random canonical 256-bit key');
    });
    it('rejects a token key equal to the IAM CSRF key', () => {
      const environment = remoteEnvironment(mode);
      expect(() =>
        loadMessagingConfig({
          ...environment,
          IAM_CSRF_KEY: environment['MESSAGING_TOKEN_KEY'],
        }),
      ).toThrow('Messaging and IAM encryption keys must be independent');
    });
    it('rejects a token key equal to any MFA key', () => {
      const environment = remoteEnvironment(mode);
      expect(() =>
        loadMessagingConfig({
          ...environment,
          IAM_MFA_KEYS_JSON: JSON.stringify({
            previous: randomBytes(32).toString('base64'),
            staging1: environment['MESSAGING_TOKEN_KEY'],
          }),
        }),
      ).toThrow('Messaging and IAM encryption keys must be independent');
    });
  });
});

describe('messaging environment boundaries', () => {
  it('always forces the private local provider during tests', () => {
    expect(
      loadMessagingConfig({
        NODE_ENV: 'test',
        MESSAGING_PROVIDER: 'brevo',
        APP_PUBLIC_ORIGIN: 'http://127.0.0.1:3000',
        MESSAGING_TOKEN_KEY: key,
      }).mode,
    ).toBe('local');
  });

  it('rejects incomplete production Brevo configuration and non-HTTPS links', () => {
    expect(() =>
      loadMessagingConfig({
        NODE_ENV: 'production',
        MESSAGING_PROVIDER: 'brevo',
        APP_PUBLIC_ORIGIN: 'http://app.example.invalid',
        MESSAGING_TOKEN_KEY: key,
      }),
    ).toThrow('Production messaging links require HTTPS');
    expect(() =>
      loadMessagingConfig({
        NODE_ENV: 'production',
        MESSAGING_PROVIDER: 'brevo',
        APP_PUBLIC_ORIGIN: 'https://app.example.invalid',
        MESSAGING_TOKEN_KEY: key,
      }),
    ).toThrow();
  });

  it('accepts production only with explicit secrets and approved locale templates', () => {
    const environment = {
      NODE_ENV: 'production',
      MESSAGING_PROVIDER: 'brevo',
      APP_PUBLIC_ORIGIN: 'https://app.example.com',
      MESSAGING_TOKEN_KEY: randomBytes(32).toString('base64'),
      BREVO_API_KEY: randomBytes(32).toString('hex'),
      BREVO_EMAIL_SENDER: 'sender@example.com',
      BREVO_EMAIL_SENDER_NAME: 'GestSchool',
      BREVO_WHATSAPP_ENABLED: 'true',
      BREVO_WHATSAPP_SENDER: '33612345678',
      BREVO_WHATSAPP_TEMPLATE_IDS_JSON: '{"fr":1,"en":2,"ar":3}',
      BREVO_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
    };
    const config = loadMessagingConfig(environment);
    expect(config.mode).toBe('brevo');
    expect(config.appPublicOrigin).toBe('https://app.example.com');
    expect(config.whatsAppEnabled).toBe(true);
    for (const recipient of [
      undefined,
      '<EMAIL_TEST>',
      'not-an-email',
      'fixture@example.invalid',
    ]) {
      expect(
        loadMessagingConfig({
          ...environment,
          APP_ENV: 'staging',
          IAM_ENV: 'staging',
          BREVO_TEST_RECIPIENT: recipient,
        }).stagingEmailRecipient,
      ).toBeNull();
    }
    expect(
      loadMessagingConfig({
        ...environment,
        APP_ENV: 'staging',
        IAM_ENV: 'staging',
        BREVO_TEST_RECIPIENT: 'controlled@example.com',
      }).stagingEmailRecipient,
    ).toBe('controlled@example.com');
  });
});
