'use client';
import { useState } from 'react';
import { useLocale } from 'next-intl';
import { Button } from '@gestschool/ui';
import { documentTypes, type DocumentTemplateView } from '@gestschool/contracts';
import { AcademicDialog } from '../academics/academic-components';
import { useAuth } from '../auth/auth-provider';
import { peopleRequest } from '../directory/people-client';
import { usePeopleData } from '../directory/people-hooks';
import { canDocuments } from './documents-client';
import { useDocumentCopy } from './document-copy';

export function DocumentTemplates({ close }: { close: () => void }) {
  const t = useDocumentCopy(),
    locale = useLocale(),
    { session } = useAuth();
  const [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const result = usePeopleData<DocumentTemplateView[]>('document-templates', revision);
  const field = 'mt-1 w-full rounded-lg border border-input bg-background p-2 text-sm';
  return (
    <AcademicDialog title={t.templates} description={t.templateHint} close={close} busy={busy}>
      <ul className="max-h-40 space-y-2 overflow-y-auto text-sm">
        {result.data?.map((row) => (
          <li key={row.id} className="break-words">
            {t[row.documentType]} · {row.locale} · v{row.version} · {row.name}
          </li>
        ))}
      </ul>
      {result.error || error ? (
        <p role="alert" className="text-sm text-destructive">
          {t.error}
        </p>
      ) : null}
      {canDocuments(session?.session, 'document-templates.manage') ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setBusy(true);
            setError(false);
            void peopleRequest(
              'document-templates',
              {
                documentType: form.get('type'),
                locale: form.get('locale'),
                name: form.get('name'),
                layout: {
                  renderer: 'gestschool-v1',
                  accent: form.get('accent'),
                  footer: form.get('footer'),
                },
              },
              'POST',
            )
              .then(() => setRevision((r) => r + 1))
              .catch(() => setError(true))
              .finally(() => setBusy(false));
          }}
        >
          <label className="block text-sm">
            {t.type}
            <select name="type" className={field} disabled={busy}>
              {documentTypes.map((type) => (
                <option key={type} value={type}>
                  {t[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            {t.locale}
            <select name="locale" className={field} defaultValue={locale} disabled={busy}>
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </label>
          <label className="block text-sm">
            {t.name}
            <input name="name" required maxLength={140} className={field} disabled={busy} />
          </label>
          <label className="block text-sm">
            {t.accent}
            <input
              name="accent"
              type="color"
              defaultValue="#3157a4"
              className="ms-3 h-8 w-12"
              disabled={busy}
            />
          </label>
          <label className="block text-sm">
            {t.footer}
            <textarea
              name="footer"
              maxLength={240}
              className={field}
              defaultValue="GestSchool"
              disabled={busy}
            />
          </label>
          <Button type="submit" disabled={busy}>
            {t.publish}
          </Button>
        </form>
      ) : null}
    </AcademicDialog>
  );
}
