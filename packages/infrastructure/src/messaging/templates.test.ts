import { describe, expect, it } from 'vitest';
import { renderMessagingTemplate, resolveMessagingLocale, systemTemplate } from './templates.js';

describe('localized messaging templates', () => {
  it('uses an Arabic preference and falls back to French only when no supported locale exists', () => {
    expect(resolveMessagingLocale('ar-MA', 'en', 'fr')).toBe('ar');
    expect(resolveMessagingLocale('de', null, 'en')).toBe('en');
    expect(resolveMessagingLocale(null, 'de')).toBe('fr');
    expect(systemTemplate('report_card.published', 'ar').subject).toContain('الدرجات');
  });

  it('escapes both tenant template text and placeholder values in HTML', () => {
    const result = renderMessagingTemplate(
      {
        subject: 'Hello {{recipient.firstName}}',
        body: '<script>run()</script> {{recipient.firstName}}',
      },
      { 'recipient.firstName': '<img src=x onerror=run()>' },
    );
    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('<img');
    expect(result.html).toContain('&lt;script&gt;');
    expect(result.html).toContain('&lt;img');
  });

  it('rejects expressions and unsupported placeholders', () => {
    expect(() =>
      renderMessagingTemplate({ subject: 'Hi', body: '{{constructor.constructor}}' }, {}),
    ).toThrow('MESSAGING_TEMPLATE_VARIABLE_DENIED');
    expect(() => renderMessagingTemplate({ subject: 'Hi', body: '{{actionUrl}}' }, {})).toThrow(
      'MESSAGING_TEMPLATE_VARIABLE_MISSING',
    );
    expect(() =>
      renderMessagingTemplate({ subject: 'Bad\r\nBcc: victim@example.test', body: 'safe' }, {}),
    ).toThrow('MESSAGING_TEMPLATE_SUBJECT_INVALID');
  });
});
