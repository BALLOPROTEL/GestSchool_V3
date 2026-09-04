'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  KpiCard,
  Select,
  SelectItem,
  cn,
} from '@gestschool/ui';
import type { DataTableColumn } from '@gestschool/ui';
import {
  AlertCircle,
  BarChart3,
  Bell,
  CircleDollarSign,
  Download,
  Eye,
  File,
  FileSpreadsheet,
  FileText,
  Mail,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  TrendingUp,
  Upload,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import type { AppLocale } from '../../i18n/routing';
import { documents, invoices, messages, reports } from '../../mocks/data';
import type { DocumentRecord, Invoice, MessageRecord, ReportRecord } from '../../mocks/data';
import { formatCurrency } from '../shared/format';
import { useMockAction } from '../shared/mock-action';
import { PageHeader } from '../shared/page-header';
import { RowActions } from '../shared/row-actions';
import { SearchField } from '../shared/search-field';
import { StatusPill } from '../shared/status-pill';

export function FinancePage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Finance');
  const locale = useLocale() as AppLocale;
  const mockAction = useMockAction();
  const [query, setQuery] = useState('');
  const filtered = invoices.filter((invoice) =>
    `${invoice.id} ${invoice.student}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const columns: readonly DataTableColumn<Invoice>[] = [
    {
      cell: (row) => <span className="font-mono text-xs font-semibold">{row.id}</span>,
      header: translate('invoice'),
      id: 'id',
    },
    {
      cell: (row) => <span className="whitespace-nowrap font-semibold">{row.student}</span>,
      header: common('student'),
      id: 'student',
    },
    {
      cell: (row) => <Badge variant="outline">{row.className}</Badge>,
      header: common('class'),
      id: 'class',
    },
    {
      cell: (row) => (
        <span className="whitespace-nowrap font-mono font-semibold">
          {formatCurrency(row.amount, locale)}
        </span>
      ),
      header: common('amount'),
      id: 'amount',
    },
    {
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">{row.issueDate}</span>
      ),
      header: translate('issueDate'),
      id: 'issued',
    },
    {
      cell: (row) => <span className="whitespace-nowrap text-muted-foreground">{row.dueDate}</span>,
      header: translate('dueDate'),
      id: 'due',
    },
    { cell: (row) => <StatusPill status={row.status} />, header: common('status'), id: 'status' },
    { cell: () => <RowActions />, header: common('actions'), id: 'actions' },
  ];
  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <>
            <Button onClick={() => mockAction(common('export'))} size="sm" variant="outline">
              <Download />
              {common('export')}
            </Button>
            <Button onClick={() => mockAction(translate('create'))} size="sm">
              <Plus />
              {translate('create')}
            </Button>
          </>
        }
        description={translate('description')}
        eyebrow={nav('administration')}
        title={translate('title')}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          change="+14,2 %"
          changeDirection="up"
          icon={CircleDollarSign}
          label={translate('revenue')}
          value={formatCurrency(561_800_000, locale)}
        />
        <KpiCard
          helper="28"
          icon={TrendingUp}
          label={translate('pending')}
          value={formatCurrency(12_600_000, locale)}
        />
        <KpiCard
          helper="8"
          icon={AlertCircle}
          label={translate('overdue')}
          value={formatCurrency(3_600_000, locale)}
        />
        <KpiCard
          change="+2,1 %"
          changeDirection="up"
          icon={BarChart3}
          label={translate('collection')}
          value="94,2 %"
        />
      </div>
      <Card className="mt-5">
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(220px,1fr)_170px_170px]">
          <SearchField
            label={common('search')}
            onChange={setQuery}
            placeholder={translate('search')}
            value={query}
          />
          <Select aria-label={common('status')}>
            <SelectItem>{common('all')}</SelectItem>
          </Select>
          <Select aria-label={common('class')}>
            <SelectItem>{common('all')}</SelectItem>
          </Select>
        </CardContent>
      </Card>
      <Card className="mt-5 overflow-hidden">
        <CardHeader>
          <CardTitle>{translate('recent')}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <DataTable
            caption={translate('caption')}
            columns={columns}
            getRowId={(row) => row.id}
            minWidth={980}
            rows={filtered}
          />
        </CardContent>
      </Card>
    </div>
  );
}

const documentIcons: Record<DocumentRecord['type'], { className: string; icon: LucideIcon }> = {
  DOC: { className: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300', icon: File },
  PDF: { className: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300', icon: FileText },
  XLS: {
    className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
    icon: FileSpreadsheet,
  },
};

export function DocumentsPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Documents');
  const mockAction = useMockAction();
  const [query, setQuery] = useState('');
  const filtered = documents.filter((document) =>
    `${document.name} ${document.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <>
            <Button
              onClick={() => mockAction(translate('downloadAll'))}
              size="sm"
              variant="outline"
            >
              <Download />
              {translate('downloadAll')}
            </Button>
            <Button onClick={() => mockAction(translate('add'))} size="sm">
              <Upload />
              {translate('add')}
            </Button>
          </>
        }
        description={translate('description', { count: documents.length })}
        eyebrow={nav('administration')}
        title={translate('title')}
      />
      <SearchField
        label={common('search')}
        onChange={setQuery}
        placeholder={translate('search')}
        value={query}
      />
      <Card className="mt-5 divide-y divide-border overflow-hidden">
        {filtered.map((document) => {
          const config = documentIcons[document.type];
          const Icon = config.icon;
          return (
            <article className="flex items-center gap-3 p-4 hover:bg-muted/25" key={document.id}>
              <div
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-lg',
                  config.className,
                )}
              >
                <Icon className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold">{document.name}</h2>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {document.category} · {document.size} · {document.date} · {document.author}
                </p>
              </div>
              <div className="flex shrink-0">
                <Button
                  aria-label={`${common('view')} ${document.name}`}
                  onClick={() => mockAction(common('view'))}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Eye />
                </Button>
                <Button
                  aria-label={`${common('download')} ${document.name}`}
                  onClick={() => mockAction(common('download'))}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Download />
                </Button>
                <Button
                  aria-label={`${common('delete')} ${document.name}`}
                  onClick={() => mockAction(common('delete'))}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            </article>
          );
        })}
      </Card>
    </div>
  );
}

const messageIcons: Record<MessageRecord['type'], { className: string; icon: LucideIcon }> = {
  email: {
    className: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
    icon: Mail,
  },
  notification: {
    className: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300',
    icon: Bell,
  },
  sms: {
    className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
    icon: MessageSquare,
  },
};

export function CommunicationsPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Communications');
  const mockAction = useMockAction();
  const [query, setQuery] = useState('');
  const filtered = messages.filter((message) =>
    `${message.subject} ${message.sender}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <Button onClick={() => mockAction(translate('new'))} size="sm">
            <Plus />
            {translate('new')}
          </Button>
        }
        description={translate('description')}
        eyebrow={nav('administration')}
        title={translate('title')}
      />
      <SearchField
        label={common('search')}
        onChange={setQuery}
        placeholder={translate('search')}
        value={query}
      />
      <Card className="mt-5 divide-y divide-border overflow-hidden">
        {filtered.map((message) => {
          const config = messageIcons[message.type];
          const Icon = config.icon;
          return (
            <article className="flex items-start gap-3 p-4 hover:bg-muted/25" key={message.id}>
              <div
                className={cn(
                  'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg',
                  config.className,
                )}
              >
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="font-semibold">{message.subject}</h2>
                  <StatusPill status={message.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {translate('from', { sender: message.sender })} ·{' '}
                  {translate('to', { recipients: message.recipients })}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">{message.date}</p>
              </div>
              <div className="flex shrink-0">
                <Button
                  aria-label={common('view')}
                  onClick={() => mockAction(common('view'))}
                  size="icon-sm"
                  variant="ghost"
                >
                  <Eye />
                </Button>
                {message.status === 'draft' ? (
                  <Button
                    aria-label={common('send')}
                    onClick={() => mockAction(common('send'))}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Send className="text-primary" />
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </Card>
    </div>
  );
}

const reportIcons: Record<string, { className: string; icon: LucideIcon }> = {
  Finance: {
    className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
    icon: BarChart3,
  },
  Inscriptions: {
    className: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
    icon: FileText,
  },
  Notes: {
    className: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300',
    icon: FileText,
  },
  Présence: {
    className: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
    icon: TrendingUp,
  },
};

export function ReportsPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Reports');
  const mockAction = useMockAction();
  return (
    <div className="page-shell">
      <PageHeader
        actions={
          <Button onClick={() => mockAction(translate('generate'))} size="sm">
            <Plus />
            {translate('generate')}
          </Button>
        }
        description={translate('description')}
        eyebrow={nav('administration')}
        title={translate('title')}
      />
      <div className="grid gap-3">
        {reports.map((report: ReportRecord) => {
          const config = reportIcons[report.type] ?? {
            className: 'bg-muted text-muted-foreground',
            icon: FileText,
          };
          const Icon = config.icon;
          return (
            <Card key={report.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-lg',
                    config.className,
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{report.title}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <Badge className="me-2" variant="secondary">
                      {report.type}
                    </Badge>
                    {report.period}
                    {report.status === 'available' ? ` · ${report.size} · ${report.date}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {report.status === 'generating' ? (
                    <span className="flex items-center gap-2 text-xs text-warning">
                      <RefreshCw className="size-4 animate-spin motion-reduce:animate-none" />
                      {translate('generating')}
                    </span>
                  ) : (
                    <>
                      <Button onClick={() => mockAction(common('view'))} size="sm" variant="ghost">
                        <Eye />
                        {common('view')}
                      </Button>
                      <Button
                        onClick={() => mockAction(common('download'))}
                        size="sm"
                        variant="outline"
                      >
                        <Download />
                        PDF
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
