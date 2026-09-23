export type MessagingLocale = 'fr' | 'en' | 'ar';
import type { MessagingTemplateKey } from '@gestschool/contracts';
export type { MessagingTemplateKey } from '@gestschool/contracts';

export const templateVariables = [
  'recipient.firstName',
  'school.name',
  'student.firstName',
  'academicYear.name',
  'invoice.reference',
  'payment.amount',
  'document.reference',
  'actionUrl',
] as const;
export type TemplateVariable = (typeof templateVariables)[number];
export type TemplateValues = Partial<Record<TemplateVariable, string>>;

interface TemplateText {
  subject: string;
  body: string;
}

const templates: Record<MessagingTemplateKey, Record<MessagingLocale, TemplateText>> = {
  'account.activation': {
    fr: {
      subject: 'Activez votre compte GestSchool',
      body: 'Bonjour {{recipient.firstName}}, activez votre compte : {{actionUrl}}',
    },
    en: {
      subject: 'Activate your GestSchool account',
      body: 'Hello {{recipient.firstName}}, activate your account: {{actionUrl}}',
    },
    ar: {
      subject: 'فعّل حسابك في GestSchool',
      body: 'مرحبًا {{recipient.firstName}}، فعّل حسابك: {{actionUrl}}',
    },
  },
  'password.reset': {
    fr: {
      subject: 'Réinitialisez votre mot de passe',
      body: 'Bonjour {{recipient.firstName}}, utilisez ce lien à usage unique : {{actionUrl}}',
    },
    en: {
      subject: 'Reset your password',
      body: 'Hello {{recipient.firstName}}, use this one-time link: {{actionUrl}}',
    },
    ar: {
      subject: 'أعد تعيين كلمة المرور',
      body: 'مرحبًا {{recipient.firstName}}، استخدم هذا الرابط لمرة واحدة: {{actionUrl}}',
    },
  },
  'enrollment.confirmed': {
    fr: {
      subject: 'Inscription confirmée',
      body: 'L’inscription de {{student.firstName}} est confirmée. Ouvrez GestSchool : {{actionUrl}}',
    },
    en: {
      subject: 'Enrollment confirmed',
      body: '{{student.firstName}}’s enrollment is confirmed. Open GestSchool: {{actionUrl}}',
    },
    ar: {
      subject: 'تم تأكيد التسجيل',
      body: 'تم تأكيد تسجيل {{student.firstName}}. افتح GestSchool: {{actionUrl}}',
    },
  },
  'enrollment.transferred': {
    fr: {
      subject: 'Transfert scolaire',
      body: 'Le dossier de {{student.firstName}} a été transféré. Consultez GestSchool : {{actionUrl}}',
    },
    en: {
      subject: 'School transfer',
      body: '{{student.firstName}}’s record was transferred. Open GestSchool: {{actionUrl}}',
    },
    ar: {
      subject: 'نقل مدرسي',
      body: 'تم نقل ملف {{student.firstName}}. افتح GestSchool: {{actionUrl}}',
    },
  },
  'invoice.created': {
    fr: {
      subject: 'Nouvelle facture scolaire',
      body: 'La facture {{invoice.reference}} est disponible dans GestSchool : {{actionUrl}}',
    },
    en: {
      subject: 'New school invoice',
      body: 'Invoice {{invoice.reference}} is available in GestSchool: {{actionUrl}}',
    },
    ar: {
      subject: 'فاتورة مدرسية جديدة',
      body: 'الفاتورة {{invoice.reference}} متاحة في GestSchool: {{actionUrl}}',
    },
  },
  'payment.validated': {
    fr: {
      subject: 'Paiement validé',
      body: 'Un paiement de {{payment.amount}} a été validé. Consultez GestSchool : {{actionUrl}}',
    },
    en: {
      subject: 'Payment confirmed',
      body: 'A payment of {{payment.amount}} was confirmed. Open GestSchool: {{actionUrl}}',
    },
    ar: {
      subject: 'تم تأكيد الدفع',
      body: 'تم تأكيد دفعة بقيمة {{payment.amount}}. افتح GestSchool: {{actionUrl}}',
    },
  },
  'receipt.ready': {
    fr: {
      subject: 'Reçu disponible',
      body: 'Votre reçu est disponible dans GestSchool : {{actionUrl}}',
    },
    en: {
      subject: 'Receipt available',
      body: 'Your receipt is available in GestSchool: {{actionUrl}}',
    },
    ar: { subject: 'الإيصال متاح', body: 'إيصالك متاح في GestSchool: {{actionUrl}}' },
  },
  'results.published': {
    fr: {
      subject: 'Résultats publiés',
      body: 'De nouveaux résultats sont disponibles dans GestSchool : {{actionUrl}}',
    },
    en: {
      subject: 'Results published',
      body: 'New results are available in GestSchool: {{actionUrl}}',
    },
    ar: { subject: 'نُشرت النتائج', body: 'نتائج جديدة متاحة في GestSchool: {{actionUrl}}' },
  },
  'report_card.published': {
    fr: {
      subject: 'Bulletin disponible',
      body: 'Votre bulletin est disponible dans GestSchool : {{actionUrl}}',
    },
    en: {
      subject: 'Report card available',
      body: 'Your report card is available in GestSchool: {{actionUrl}}',
    },
    ar: { subject: 'كشف الدرجات متاح', body: 'كشف الدرجات متاح في GestSchool: {{actionUrl}}' },
  },
  'document.ready': {
    fr: {
      subject: 'Document officiel disponible',
      body: 'Le document {{document.reference}} est disponible dans GestSchool : {{actionUrl}}',
    },
    en: {
      subject: 'Official document available',
      body: 'Document {{document.reference}} is available in GestSchool: {{actionUrl}}',
    },
    ar: {
      subject: 'مستند رسمي متاح',
      body: 'المستند {{document.reference}} متاح في GestSchool: {{actionUrl}}',
    },
  },
  'manual.school_notice': {
    fr: {
      subject: 'Information de votre établissement',
      body: 'Une nouvelle communication est disponible dans GestSchool : {{actionUrl}}',
    },
    en: {
      subject: 'Message from your school',
      body: 'A new message is available in GestSchool: {{actionUrl}}',
    },
    ar: { subject: 'رسالة من مدرستك', body: 'رسالة جديدة متاحة في GestSchool: {{actionUrl}}' },
  },
};

const placeholder = /{{\s*([^{}]+?)\s*}}/g;
const allowed = new Set<string>(templateVariables);
const htmlEscape = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });

export function resolveMessagingLocale(
  ...candidates: (string | null | undefined)[]
): MessagingLocale {
  for (const candidate of candidates) {
    const normalized = candidate?.toLowerCase().split('-')[0];
    if (normalized === 'fr' || normalized === 'en' || normalized === 'ar') return normalized;
  }
  return 'fr';
}

export function systemTemplate(key: MessagingTemplateKey, locale: MessagingLocale): TemplateText {
  return templates[key][locale];
}

export function renderMessagingTemplate(
  template: TemplateText,
  values: TemplateValues,
): { subject: string; text: string; html: string } {
  const resolve = (source: string, escape: boolean) =>
    source.replace(placeholder, (_match, key: string) => {
      if (!allowed.has(key)) throw new Error('MESSAGING_TEMPLATE_VARIABLE_DENIED');
      const value = values[key as TemplateVariable];
      if (value === undefined) throw new Error('MESSAGING_TEMPLATE_VARIABLE_MISSING');
      return escape ? htmlEscape(value) : value;
    });
  // Escape template literals as well as values: tenant templates are plain text,
  // never trusted HTML or executable expressions.
  const subject = resolve(template.subject, false);
  const text = resolve(template.body, false);
  const html = `<html><body><p>${resolve(htmlEscape(template.body), true).replaceAll('\n', '<br>')}</p></body></html>`;
  if (/[\r\n]/.test(subject)) throw new Error('MESSAGING_TEMPLATE_SUBJECT_INVALID');
  return { subject, text, html };
}
