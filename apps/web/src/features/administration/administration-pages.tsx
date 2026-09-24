'use client';

import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
} from '@gestschool/ui';
import { Bell, Eye, Mail, MessageSquare, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../auth/auth-provider';
import { peopleRequest } from '../directory/people-client';
import { PageHeader } from '../shared/page-header';
import { SearchField } from '../shared/search-field';

interface Communication {
  id: string;
  channel: 'EMAIL' | 'WHATSAPP' | 'IN_APP';
  recipientMasked: string | null;
  templateKey: string | null;
  eventType: string | null;
  category: string | null;
  subject: string;
  body?: string;
  status: string;
  attempts: number;
  lastErrorCode: string | null;
  createdAt: string;
}

const messageIcons: Record<Communication['channel'], { className: string; icon: LucideIcon }> = {
  EMAIL: {
    className: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
    icon: Mail,
  },
  IN_APP: {
    className: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300',
    icon: Bell,
  },
  WHATSAPP: {
    className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
    icon: MessageSquare,
  },
};

export function CommunicationsPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const translate = useTranslations('Communications');
  const locale = useLocale();
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Communication[]>([]);
  const [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<Communication | null>(null);
  const [composer, setComposer] = useState(false);
  const [audienceType, setAudienceType] = useState<'STUDENT' | 'CLASS'>('STUDENT');
  const [audienceId, setAudienceId] = useState('');
  const [category, setCategory] = useState<'SCHOOL' | 'ACADEMIC' | 'FINANCE'>('SCHOOL');
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [composerError, setComposerError] = useState(false);
  const [sending, setSending] = useState(false);
  const [queued, setQueued] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const canRead = Boolean(
    session?.session.grants.some(
      (grant) => grant.permission === 'communications.read' && grant.scope !== 'NONE',
    ),
  );
  const canSend = Boolean(
    session?.session.grants.some(
      (grant) => grant.permission === 'communications.send' && grant.scope !== 'NONE',
    ),
  );
  const roles = session?.session.roles ?? [];
  const allowedCategories = useMemo<('SCHOOL' | 'ACADEMIC' | 'FINANCE')[]>(
    () =>
      roles.some((role) => ['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(role))
        ? ['SCHOOL', 'ACADEMIC', 'FINANCE']
        : roles.includes('DIRECTOR')
          ? ['SCHOOL', 'ACADEMIC']
          : roles.includes('ACCOUNTANT')
            ? ['FINANCE']
            : ['ACADEMIC'],
    [roles],
  );
  useEffect(() => {
    if (!allowedCategories.includes(category)) setCategory(allowedCategories[0] ?? 'ACADEMIC');
  }, [category, allowedCategories]);
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (query.trim()) params.set('search', query.trim());
      void peopleRequest<{ items: Communication[]; total: number }>(
        `communications?${params}`,
      ).then(
        (result) => {
          if (!active) return;
          setItems(result.items);
          setTotal(result.total);
          setState('ready');
        },
        () => {
          if (active) setState('error');
        },
      );
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canRead, session?.session.membershipId, query, page, refresh]);
  const view = async (id: string) => {
    try {
      setDetail(await peopleRequest<Communication>(`communications/${id}`));
    } catch {
      setState('error');
    }
  };
  const previewAudience = async () => {
    setComposerError(false);
    try {
      const result = await peopleRequest<{ recipientCount: number }>(
        'communications/audience-preview',
        { category, audience: { type: audienceType, id: audienceId } },
        'POST',
      );
      setRecipientCount(result.recipientCount);
    } catch {
      setRecipientCount(null);
      setComposerError(true);
    }
  };
  const sendManual = async () => {
    if (recipientCount === null) return;
    setComposerError(false);
    setSending(true);
    try {
      await peopleRequest(
        'communications/send',
        {
          category,
          audience: { type: audienceType, id: audienceId },
          channels: ['IN_APP', 'EMAIL'],
          confirmedRecipientCount: recipientCount,
        },
        'POST',
        true,
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      setComposer(false);
      setQueued(true);
      setRecipientCount(null);
      setPage(1);
      setState('loading');
      setRefresh((value) => value + 1);
    } catch {
      setComposerError(true);
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="page-shell" data-messaging-ready={state === 'ready' ? 'true' : 'false'}>
      <PageHeader
        description={translate('description')}
        eyebrow={nav('administration')}
        title={translate('title')}
      />
      {!canRead ? (
        <p role="status" className="mt-5">
          {translate('forbidden')}
        </p>
      ) : (
        <>
          <SearchField
            label={common('search')}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder={translate('search')}
            value={query}
          />
          {canSend ? (
            <Button
              className="mt-3"
              onClick={() => {
                setQueued(false);
                setComposerError(false);
                setComposer(true);
              }}
            >
              <Plus /> {translate('new')}
            </Button>
          ) : null}
          {queued ? (
            <p className="mt-3 text-sm text-emerald-700" role="status">
              {translate('queued')}
            </p>
          ) : null}
          {state === 'loading' ? (
            <p role="status" className="mt-5">
              {translate('loading')}
            </p>
          ) : null}
          {state === 'error' ? (
            <p role="alert" className="mt-5">
              {translate('error')}
            </p>
          ) : null}
          {state === 'ready' && items.length === 0 ? (
            <p role="status" className="mt-5">
              {translate('empty')}
            </p>
          ) : null}
          <Card className="mt-5 divide-y divide-border overflow-hidden">
            {items.map((message) => {
              const config = messageIcons[message.channel];
              const Icon = config.icon;
              return (
                <article
                  className="flex items-start gap-3 p-4 hover:bg-muted/25"
                  data-testid="communication-message"
                  key={message.id}
                >
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
                      <Badge variant="secondary">
                        {translate(`status.${message.status}` as 'status.SENT')}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {message.channel} · {message.recipientMasked ?? '—'} ·{' '}
                      {message.templateKey ?? message.eventType ?? '—'}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(message.createdAt))}{' '}
                      · {translate('attempts', { count: message.attempts })}
                    </p>
                    {message.lastErrorCode ? (
                      <p className="mt-1 text-xs text-destructive">{message.lastErrorCode}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0">
                    <Button
                      aria-label={common('view')}
                      onClick={() => void view(message.id)}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Eye />
                    </Button>
                  </div>
                </article>
              );
            })}
          </Card>
          <div className="mt-4 flex items-center justify-end gap-3">
            <span className="text-xs text-muted-foreground">
              {translate('total', { count: total })}
            </span>
            <Button
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              size="sm"
              variant="outline"
            >
              {translate('previous')}
            </Button>
            <Button
              disabled={page * 20 >= total}
              onClick={() => setPage((value) => value + 1)}
              size="sm"
              variant="outline"
            >
              {translate('next')}
            </Button>
          </div>
        </>
      )}
      <Dialog
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.subject}</DialogTitle>
            <DialogDescription>
              {detail?.channel} · {detail?.recipientMasked ?? '—'}
            </DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm">{detail?.body}</p>
          <p className="text-xs text-muted-foreground">
            {detail?.eventType} · {detail?.status} · {detail?.attempts}
          </p>
        </DialogContent>
      </Dialog>
      <Dialog open={composer} onOpenChange={setComposer}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate('new')}</DialogTitle>
            <DialogDescription>{translate('manualDescription')}</DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-sm" htmlFor="communication-category">
            {translate('category')}
            <select
              className="h-10 rounded-md border bg-background px-3"
              id="communication-category"
              onChange={(event) => {
                setCategory(event.target.value as typeof category);
                setRecipientCount(null);
              }}
              value={category}
            >
              {allowedCategories.includes('SCHOOL') ? (
                <option value="SCHOOL">{translate('categorySchool')}</option>
              ) : null}
              {allowedCategories.includes('ACADEMIC') ? (
                <option value="ACADEMIC">{translate('categoryAcademic')}</option>
              ) : null}
              {allowedCategories.includes('FINANCE') ? (
                <option value="FINANCE">{translate('categoryFinance')}</option>
              ) : null}
            </select>
          </label>
          <label className="grid gap-1 text-sm" htmlFor="communication-audience-type">
            {translate('audience')}
            <select
              className="h-10 rounded-md border bg-background px-3"
              id="communication-audience-type"
              onChange={(event) => {
                setAudienceType(event.target.value as typeof audienceType);
                setRecipientCount(null);
              }}
              value={audienceType}
            >
              <option value="STUDENT">{translate('audienceStudent')}</option>
              <option value="CLASS">{translate('audienceClass')}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm" htmlFor="communication-audience-id">
            {translate('audienceId')}
            <Input
              id="communication-audience-id"
              onChange={(event) => {
                setAudienceId(event.target.value);
                setRecipientCount(null);
              }}
              value={audienceId}
            />
          </label>
          {recipientCount === null ? (
            <Button disabled={!audienceId} onClick={() => void previewAudience()} variant="outline">
              {translate('previewAudience')}
            </Button>
          ) : (
            <p role="status">{translate('confirmAudience', { count: recipientCount })}</p>
          )}
          {composerError ? <p role="alert">{translate('error')}</p> : null}
          <Button disabled={recipientCount === null || sending} onClick={() => void sendManual()}>
            {sending ? translate('sending') : translate('confirmSend')}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
