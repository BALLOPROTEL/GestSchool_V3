'use client';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button, Card, CardContent, Pagination, StatusBadge } from '@gestschool/ui';
import { FileText, Download, Eye, Plus } from 'lucide-react';
import {
  documentTypes,
  type DocumentList,
  type DocumentSourceView,
  type DocumentView,
  type OfficialDocumentType,
} from '@gestschool/contracts';
import { useAuth } from '../auth/auth-provider';
import { peopleRequest } from '../directory/people-client';
import { useDebounced, usePeopleData } from '../directory/people-hooks';
import { AcademicDialog } from '../academics/academic-components';
import { PageHeader } from '../shared/page-header';
import { SearchField } from '../shared/search-field';
import { canDocuments, documentTypesFor, downloadDocument } from './documents-client';
import { useDocumentCopy } from './document-copy';
import { DocumentTemplates } from './templates';

export function DocumentsPage() {
  const t = useDocumentCopy();
  return (
    <div className="page-shell">
      <PageHeader title={t.title} description={t.description} />
      <DocumentsPanel />
    </div>
  );
}
const fieldClass =
  'mt-1 w-full min-w-0 rounded-lg border border-input bg-background p-2 text-sm focus-visible:outline-2 focus-visible:outline-ring';
export { fieldClass as documentFieldClass };
type PanelProps = {
  studentId?: string;
  sourceId?: string;
  documentType?: OfficialDocumentType;
  eligible?: boolean;
};
export function DocumentsPanel({ studentId, sourceId, documentType, eligible = true }: PanelProps) {
  const t = useDocumentCopy(),
    common = useTranslations('Common'),
    { session } = useAuth();
  const [revision, setRevision] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('');
  const [generate, setGenerate] = useState(false),
    [selected, setSelected] = useState<DocumentView>(),
    [action, setAction] = useState<'preview' | 'revoke' | 'reissue'>(),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState(false);
  const debounced = useDebounced(search),
    canRead = canDocuments(session?.session, 'documents.read');
  const q = new URLSearchParams({ page: String(page), pageSize: '10', search: debounced });
  if (studentId) q.set('studentId', studentId);
  if (sourceId) q.set('sourceId', sourceId);
  if (documentType || filter) q.set('documentType', documentType ?? filter);
  const result = usePeopleData<DocumentList>(canRead ? `documents?${q}` : null, revision);
  const refresh = () => setRevision((value) => value + 1);
  useEffect(() => {
    if (!result.data?.items.some((d) => ['PENDING', 'PROCESSING'].includes(d.status))) return;
    const timer = setTimeout(() => setRevision((v) => v + 1), 2000);
    return () => clearTimeout(timer);
  }, [result.data]);
  if (!canRead)
    return (
      <p className="p-4" role="status">
        {t.forbidden}
      </p>
    );
  const types = documentTypesFor(session?.session);
  async function download(row: DocumentView) {
    setError(false);
    setBusy(true);
    try {
      const blob = await downloadDocument(row.id),
        url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = `${row.reference}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="min-w-0 space-y-4 p-4"
      aria-label={documentType ? t[documentType] : t.title}
      data-documents-ready={!result.loading}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{t.title}</h2>
        <div className="flex flex-wrap gap-2">
          {eligible && types.length > 0 && (!documentType || types.includes(documentType)) ? (
            <Button size="sm" type="button" onClick={() => setGenerate(true)}>
              <Plus />
              {t.generate}
            </Button>
          ) : null}
          {!sourceId && !studentId && canDocuments(session?.session, 'document-templates.read') ? (
            <Button size="sm" variant="outline" onClick={() => setTemplates(true)}>
              {t.templates}
            </Button>
          ) : null}
        </div>
      </div>
      {!sourceId ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <SearchField
            label={t.search}
            placeholder={t.search}
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          {!documentType ? (
            <label className="text-sm">
              {t.type}
              <select
                className={fieldClass}
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t.all}</option>
                {documentTypes.map((type) => (
                  <option key={type} value={type}>
                    {t[type]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      {result.loading ? <p role="status">{t.loading}</p> : null}
      {error || result.error ? (
        <p role="alert" className="text-sm text-destructive">
          {t.error}
        </p>
      ) : null}
      {result.data?.items.length === 0 ? <p role="status">{t.empty}</p> : null}
      <div className="space-y-3">
        {result.data?.items.map((row) => (
          <Card key={row.id} data-document-id={row.id}>
            <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 gap-3">
                <FileText className="mt-1 size-6 shrink-0 text-primary" />
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold">
                    {t[row.documentType]} · {row.reference}
                  </h3>
                  <p className="break-words text-sm">{row.holder}</p>
                  <p className="break-words text-xs text-muted-foreground">
                    {row.academicYear} · {row.locale.toUpperCase()} · {row.createdAt.slice(0, 10)}
                  </p>
                  <StatusBadge
                    tone={
                      row.status === 'READY'
                        ? 'success'
                        : row.status === 'REVOKED' || row.status === 'FAILED'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {t[row.status]}
                  </StatusBadge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {['READY', 'REVOKED'].includes(row.status) &&
                canDocuments(session?.session, 'documents.download') ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setSelected(row);
                        setAction('preview');
                      }}
                    >
                      <Eye />
                      {t.preview}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        void download(row);
                      }}
                    >
                      <Download />
                      {t.download}
                    </Button>
                  </>
                ) : null}
                {row.status === 'READY' && canDocuments(session?.session, 'documents.revoke') ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelected(row);
                      setAction('revoke');
                    }}
                  >
                    {t.revoke}
                  </Button>
                ) : null}
                {['READY', 'REVOKED', 'FAILED'].includes(row.status) &&
                canDocuments(session?.session, 'documents.reissue') ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelected(row);
                      setAction('reissue');
                    }}
                  >
                    {t.reissue}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {result.data && result.data.total > 10 ? (
        <Pagination
          currentPage={page}
          totalPages={Math.ceil(result.data.total / 10)}
          labels={{ previous: common('previous'), next: common('next') }}
          onPageChange={setPage}
        />
      ) : null}
      {generate ? (
        <DocumentGenerator
          {...(studentId ? { studentId } : {})}
          {...(sourceId ? { sourceId } : {})}
          types={documentType ? [documentType] : types}
          close={() => setGenerate(false)}
          saved={() => {
            setGenerate(false);
            refresh();
          }}
        />
      ) : null}
      {selected && action ? (
        <DocumentAction
          row={selected}
          action={action}
          close={() => setAction(undefined)}
          saved={() => {
            setAction(undefined);
            refresh();
          }}
          download={() => {
            void download(selected);
          }}
        />
      ) : null}
      {templates ? <DocumentTemplates close={() => setTemplates(false)} /> : null}
    </section>
  );
}
function DocumentGenerator({
  studentId,
  sourceId,
  types,
  close,
  saved,
}: {
  studentId?: string;
  sourceId?: string;
  types: OfficialDocumentType[];
  close: () => void;
  saved: () => void;
}) {
  const t = useDocumentCopy(),
    locale = useLocale();
  const [type, setType] = useState<OfficialDocumentType>(types[0] ?? 'SCHOOL_CERTIFICATE'),
    [language, setLanguage] = useState(locale),
    [search, setSearch] = useState(''),
    [source, setSource] = useState(sourceId ?? ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const [key] = useState(() => crypto.randomUUID()),
    debounced = useDebounced(search);
  const q = new URLSearchParams({ documentType: type, search: debounced });
  if (studentId) q.set('studentId', studentId);
  const sources = usePeopleData<DocumentSourceView[]>(!sourceId ? `documents/sources?${q}` : null);
  return (
    <AcademicDialog title={t.generate} description={t.sourceHint} close={close} busy={busy}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(false);
          void peopleRequest(
            'documents/generate',
            { documentType: type, sourceId: source, locale: language },
            'POST',
            true,
            { 'Idempotency-Key': key },
          )
            .then(saved)
            .catch(() => setError(true))
            .finally(() => setBusy(false));
        }}
      >
        <label className="block text-sm">
          {t.type}
          <select
            className={fieldClass}
            value={type}
            disabled={busy}
            onChange={(e) => {
              setType(e.target.value as OfficialDocumentType);
              if (!sourceId) setSource('');
            }}
          >
            {types.map((option) => (
              <option value={option} key={option}>
                {t[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          {t.locale}
          <select
            className={fieldClass}
            value={language}
            disabled={busy}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </label>
        {!sourceId ? (
          <>
            <SearchField
              label={t.sourceSearch}
              placeholder={t.sourceSearch}
              value={search}
              onChange={(v) => {
                setSearch(v);
                setSource('');
              }}
            />
            <label className="block text-sm">
              {t.source}
              <select
                required
                className={fieldClass}
                value={source}
                disabled={busy || sources.loading}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="">{t.choose}</option>
                {sources.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {error || sources.error ? (
          <p role="alert" className="text-sm text-destructive">
            {t.error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !source}>
            {t.generate}
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={close}>
            {t.cancel}
          </Button>
        </div>
      </form>
    </AcademicDialog>
  );
}
function DocumentAction({
  row,
  action,
  close,
  saved,
  download,
}: {
  row: DocumentView;
  action: 'preview' | 'revoke' | 'reissue';
  close: () => void;
  saved: () => void;
  download: () => void;
}) {
  const t = useDocumentCopy();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [key] = useState(() => crypto.randomUUID());
  return (
    <AcademicDialog
      title={`${t[action]} · ${row.reference}`}
      description={action === 'reissue' ? t.history : t.description}
      close={close}
      busy={busy}
    >
      {action === 'preview' ? (
        <>
          <div
            className={
              row.documentType === 'STUDENT_CARD'
                ? 'flex aspect-[85.6/53.98] w-full flex-col justify-between overflow-hidden rounded-xl border-2 border-primary p-3 text-xs sm:p-5'
                : 'space-y-3 rounded-xl border p-4'
            }
            data-document-preview={row.documentType}
            dir={row.locale === 'ar' ? 'rtl' : 'ltr'}
          >
            <h3 className="font-bold">{t[row.documentType]}</h3>
            <p className="break-words font-semibold">{row.holder}</p>
            <p>{row.matricule}</p>
            <p className="break-words">
              {row.className} · {row.academicYear}
            </p>
            <p className="font-mono text-[10px]">{row.reference}</p>
            <p>{t[row.status]}</p>
          </div>
          <DocumentPdfPreview row={row} />
          {row.status === 'REVOKED' ? <p role="status">{t.revokedHint}</p> : null}
          {row.documentType === 'STUDENT_CARD' ? <p className="text-xs">{t.print}</p> : null}
          <Button type="button" onClick={download}>
            {t.download}
          </Button>
        </>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const values = new FormData(e.currentTarget);
            setBusy(true);
            setError(false);
            void peopleRequest(
              `documents/${row.id}/${action}`,
              action === 'revoke' ? { reason: values.get('reason') } : {},
              'POST',
              true,
              { 'Idempotency-Key': key },
            )
              .then(saved)
              .catch(() => setError(true))
              .finally(() => setBusy(false));
          }}
        >
          {action === 'revoke' ? (
            <label className="block text-sm">
              {t.reason}
              <textarea
                name="reason"
                className={fieldClass}
                required
                minLength={5}
                maxLength={500}
                disabled={busy}
              />
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-destructive">
              {t.error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {t.confirm}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              {t.cancel}
            </Button>
          </div>
        </form>
      )}
    </AcademicDialog>
  );
}

function DocumentPdfPreview({ row }: { row: DocumentView }) {
  const t = useDocumentCopy();
  const [url, setUrl] = useState<string>(),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false,
      objectUrl: string | undefined;
    void downloadDocument(row.id)
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [row.id]);
  if (failed) return <p role="alert">{t.error}</p>;
  if (!url) return <p role="status">{t.loading}</p>;
  return (
    <iframe
      title={`${t.preview} · ${row.reference}`}
      src={`${url}#toolbar=0&view=FitH`}
      className="h-[55vh] w-full min-w-0 rounded-lg border"
      referrerPolicy="no-referrer"
    />
  );
}
