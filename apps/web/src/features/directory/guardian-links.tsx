'use client';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  Pagination,
  Select,
  SelectItem,
} from '@gestschool/ui';
import type { GuardianLinkView, PageResult, PersonView } from '@gestschool/contracts';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/auth-provider';
import { canRead, canWrite, peopleRequest } from './people-client';
import { useDebounced, usePeopleData } from './people-hooks';
import { ErrorNotice } from './person-editor';
import { SearchField } from '../shared/search-field';
import { Link } from '../../i18n/navigation';

export function GuardianLinks({
  person,
  side,
}: {
  person: PersonView;
  side: 'student' | 'guardian';
}) {
  const t = useTranslations('People');
  const common = useTranslations('Common');
  const { session } = useAuth();
  const allowed = canRead(session?.session, 'students') && canRead(session?.session, 'guardians');
  const writable =
    canWrite(session?.session, 'students', 'update') &&
    canWrite(session?.session, 'guardians', 'update');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const [selected, setSelected] = useState('');
  const [editing, setEditing] = useState<GuardianLinkView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const path =
    side === 'student' ? `students/${person.id}/guardians` : `guardians/${person.id}/students`;
  const links = usePeopleData<PageResult<GuardianLinkView>>(
    allowed ? `${path}?page=${page}&pageSize=10&status=ALL` : null,
    revision,
  );
  const choices = usePeopleData<PageResult<PersonView>>(
    allowed && writable && person.status !== 'ARCHIVED'
      ? `${side === 'student' ? 'guardians' : 'students'}?pageSize=25&search=${encodeURIComponent(search)}`
      : null,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const studentId = editing?.studentId ?? (side === 'student' ? person.id : selected);
    const guardianId = editing?.guardianId ?? (side === 'student' ? selected : person.id);
    setBusy(true);
    setError(undefined);
    try {
      await peopleRequest(
        `students/${studentId}/guardians${editing ? `/${guardianId}` : ''}`,
        {
          ...(!editing ? { guardianId } : {}),
          relationship: String(form.get('relationship')),
          isPrimary: form.get('isPrimary') === 'on',
          isFinancialContact: form.get('isFinancialContact') === 'on',
          receivesNotifications: form.get('receivesNotifications') === 'on',
        },
        editing ? 'PATCH' : 'POST',
      );
      setEditing(null);
      setSelected('');
      setRevision((value) => value + 1);
    } catch (issue: unknown) {
      setError(issue);
    } finally {
      setBusy(false);
    }
  }
  async function unlink(link: GuardianLinkView) {
    setBusy(true);
    setError(undefined);
    try {
      await peopleRequest(`students/${link.studentId}/guardians/${link.guardianId}`, {}, 'DELETE');
      setRevision((value) => value + 1);
    } catch (issue: unknown) {
      setError(issue);
    } finally {
      setBusy(false);
    }
  }
  if (!allowed) return null;
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{side === 'student' ? t('linkedGuardians') : t('linkedChildren')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {links.loading ? <p role="status">{t('loading')}</p> : null}
        {links.error ? <ErrorNotice error={links.error} /> : null}
        {links.data?.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noLinks')}</p>
        ) : null}
        <ul className="space-y-3">
          {links.data?.items.map((link) => (
            <li
              key={`${link.studentId}:${link.guardianId}`}
              className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="min-w-0 break-words">
                {side === 'guardian' ? (
                  <Link
                    href={`/students/${link.studentId}`}
                    className="font-semibold hover:underline"
                  >
                    {link.person.firstName} {link.person.lastName}
                  </Link>
                ) : (
                  <p className="font-semibold">
                    {link.person.firstName} {link.person.lastName}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {link.relationship} · {t(link.person.status)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[
                    link.isPrimary ? t('isPrimary') : '',
                    link.isFinancialContact ? t('isFinancialContact') : '',
                    link.receivesNotifications ? t('receivesNotifications') : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {writable ? (
                <div className="flex gap-2">
                  {person.status !== 'ARCHIVED' && link.person.status !== 'ARCHIVED' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setEditing(link)}
                    >
                      {common('edit')}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      void unlink(link);
                    }}
                  >
                    {t('unlink')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {links.data ? (
          <Pagination
            currentPage={page}
            totalPages={Math.max(1, Math.ceil(links.data.total / 10))}
            onPageChange={setPage}
            labels={{ next: common('next'), previous: common('previous') }}
          />
        ) : null}
        {writable && person.status !== 'ARCHIVED' ? (
          <form
            key={editing ? `${editing.studentId}:${editing.guardianId}` : 'new'}
            onSubmit={(event) => {
              void submit(event);
            }}
            className="grid min-w-0 gap-3 border-t border-border pt-4"
            aria-busy={busy}
          >
            <h3 className="font-semibold">{editing ? t('editLink') : t('link')}</h3>
            {!editing ? (
              <>
                <SearchField
                  label={t('searchLink')}
                  placeholder={t('searchLink')}
                  value={query}
                  onChange={(value) => {
                    setQuery(value);
                    setSelected('');
                  }}
                />
                <div className="space-y-1">
                  <Label htmlFor="link-target">{t('selectPerson')}</Label>
                  <Select
                    id="link-target"
                    required
                    value={selected}
                    onChange={(event) => setSelected(event.target.value)}
                  >
                    <SelectItem value="">{t('selectPerson')}</SelectItem>
                    {choices.data?.items.map((choice) => (
                      <SelectItem key={choice.id} value={choice.id}>
                        {choice.firstName} {choice.lastName} ·{' '}
                        {choice.matricule ?? choice.guardianReference}
                      </SelectItem>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('refineSearch')}</p>
                </div>
              </>
            ) : null}
            {choices.error ? <ErrorNotice error={choices.error} /> : null}
            <div className="space-y-1">
              <Label htmlFor="link-relationship">{t('relationship')}</Label>
              <Input
                id="link-relationship"
                name="relationship"
                required
                maxLength={60}
                defaultValue={editing?.relationship ?? ''}
              />
            </div>
            {(['isPrimary', 'isFinancialContact', 'receivesNotifications'] as const).map(
              (field) => (
                <Label
                  className="flex items-center gap-2 text-sm"
                  key={field}
                  htmlFor={`link-${field}`}
                >
                  <Checkbox
                    id={`link-${field}`}
                    name={field}
                    defaultChecked={editing ? editing[field] : field === 'receivesNotifications'}
                  />
                  {t(field)}
                </Label>
              ),
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || (!editing && !selected)}>
                {busy ? t('saving') : editing ? common('save') : t('link')}
              </Button>
              {editing ? (
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  {common('cancel')}
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}
        {error ? <ErrorNotice error={error} /> : null}
      </CardContent>
    </Card>
  );
}
