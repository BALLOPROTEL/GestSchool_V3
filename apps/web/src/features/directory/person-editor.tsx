'use client';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectItem,
} from '@gestschool/ui';
import {
  guardianCreate,
  studentCreate,
  teacherCreate,
  type PeopleKind,
  type PersonView,
} from '@gestschool/contracts';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { errorKey, PeopleError, peopleRequest } from './people-client';

export function PersonEditor({
  kind,
  person,
  close,
  saved,
}: {
  kind: PeopleKind;
  person: PersonView | null;
  close: () => void;
  saved: (person: PersonView) => void;
}) {
  const t = useTranslations('People');
  const common = useTranslations('Common');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [opener] = useState(() => document.activeElement);
  const reference = {
    students: 'matricule',
    guardians: 'guardianReference',
    teachers: 'employeeNumber',
  }[kind] as 'matricule' | 'guardianReference' | 'employeeNumber';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = {
      firstName: String(form.get('firstName')),
      lastName: String(form.get('lastName')),
      status: form.get('status'),
      ...(form.get(reference) ? { [reference]: String(form.get(reference)) } : {}),
      ...(kind === 'students' ? { birthDate: form.get('birthDate') || null } : {}),
      ...(kind === 'guardians'
        ? { email: form.get('email') || null, phone: form.get('phone') || null }
        : {}),
    };
    const parsed = { students: studentCreate, guardians: guardianCreate, teachers: teacherCreate }[
      kind
    ].safeParse(data);
    if (!parsed.success) {
      setError(new PeopleError('AUTH_INVALID_REQUEST'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      saved(
        await peopleRequest<PersonView>(
          `${kind}${person ? `/${person.id}` : ''}`,
          parsed.data,
          person ? 'PATCH' : 'POST',
        ),
      );
    } catch (issue: unknown) {
      setError(issue);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent
        closeLabel={common('close')}
        className="max-h-[90dvh] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
          else document.querySelector<HTMLElement>('[data-person-focus]')?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{person ? t('editPerson') : t('createPerson')}</DialogTitle>
          <DialogDescription>{t('formHint')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
          className="grid min-w-0 gap-4"
          aria-busy={busy}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="person-firstName">{t('firstName')}</Label>
              <Input
                id="person-firstName"
                name="firstName"
                required
                maxLength={100}
                defaultValue={person?.firstName}
                autoComplete="off"
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="person-lastName">{t('lastName')}</Label>
              <Input
                id="person-lastName"
                name="lastName"
                required
                maxLength={100}
                defaultValue={person?.lastName}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="person-reference">{t(reference)}</Label>
            <Input
              id="person-reference"
              name={reference}
              maxLength={40}
              defaultValue={person?.[reference]}
              placeholder={t('automatic')}
              autoComplete="off"
            />
          </div>
          {kind === 'students' ? (
            <div className="space-y-1">
              <Label htmlFor="person-birthDate">{t('birthDate')}</Label>
              <Input
                id="person-birthDate"
                name="birthDate"
                type="date"
                min="1900-01-01"
                max={new Date().toISOString().slice(0, 10)}
                defaultValue={person?.birthDate ?? ''}
              />
            </div>
          ) : null}
          {kind === 'guardians' ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="person-email">{common('email')}</Label>
                <Input
                  id="person-email"
                  name="email"
                  type="email"
                  maxLength={254}
                  defaultValue={person?.email ?? ''}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="person-phone">{common('phone')}</Label>
                <Input
                  id="person-phone"
                  name="phone"
                  type="tel"
                  maxLength={30}
                  defaultValue={person?.phone ?? ''}
                />
              </div>
            </>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="person-status">{common('status')}</Label>
            <Select id="person-status" name="status" defaultValue={person?.status ?? 'ACTIVE'}>
              <SelectItem value="ACTIVE">{t('ACTIVE')}</SelectItem>
              <SelectItem value="INACTIVE">{t('INACTIVE')}</SelectItem>
            </Select>
          </div>
          {error ? <ErrorNotice error={error} /> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button disabled={busy} onClick={close} type="button" variant="outline">
              {common('cancel')}
            </Button>
            <Button disabled={busy} type="submit">
              {busy ? t('saving') : common('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function ErrorNotice({ error }: { error: unknown }) {
  const t = useTranslations('People');
  return (
    <div
      role="alert"
      className="min-w-0 rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
    >
      <p>{t(errorKey(error))}</p>
      {error instanceof PeopleError && error.requestId ? (
        <p className="mt-1 break-all text-xs">
          {t('requestId')}: {error.requestId}
        </p>
      ) : null}
    </div>
  );
}
