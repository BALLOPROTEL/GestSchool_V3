'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { DocumentVerification } from '@gestschool/contracts';
import { Card, CardContent } from '@gestschool/ui';
import { useDocumentCopy } from './document-copy';

export function PublicDocumentVerification() {
  const { token } = useParams<{ token: string }>(),
    t = useDocumentCopy();
  const [result, setResult] = useState<DocumentVerification>(),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setResult(undefined);
    setError(false);
    void fetch(`/api/v1/public/documents/verify/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('DOCUMENT_VERIFICATION_UNAVAILABLE');
        const value = (await response.json()) as DocumentVerification;
        if (active) setResult(value);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [token]);
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-4 py-10">
      <Card className="w-full min-w-0">
        <CardContent className="space-y-5 p-5 sm:p-8">
          <p className="font-bold text-primary">GestSchool</p>
          <h1 className="text-2xl font-bold">{t.verify}</h1>
          {error ? (
            <p role="alert">{t.error}</p>
          ) : !result ? (
            <p role="status">{t.loading}</p>
          ) : result.status === 'INVALID' ? (
            <p role="status">{t.invalid}</p>
          ) : (
            <>
              <p
                role="status"
                className={
                  result.status === 'VALID'
                    ? 'font-semibold text-emerald-700 dark:text-emerald-300'
                    : 'font-semibold text-destructive'
                }
              >
                {t[result.status]}
              </p>
              <dl className="grid gap-4 sm:grid-cols-2">
                {[
                  [t.type, t[result.documentType]],
                  [t.reference, result.reference],
                  [t.school, result.school],
                  [t.holder, result.holder],
                  [t.year, result.academicYear],
                  [t.issued, result.issuedAt.slice(0, 10)],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="break-words font-medium">{value || '—'}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <p className="border-t pt-4 text-xs text-muted-foreground">{t.verificationHint}</p>
        </CardContent>
      </Card>
    </main>
  );
}
