'use client';

import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@gestschool/ui';
import { KeyRound, Laptop, Mail, MapPin, Phone, Save, Smartphone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { useMockAction } from '../shared/mock-action';
import { PageHeader } from '../shared/page-header';

function ProfileFact({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="mt-0.5 block break-words text-sm font-medium">{value}</span>
      </span>
    </div>
  );
}

function FormField({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
function PreferenceRow({ description, label }: { description: string; label: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-4 last:border-0">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <Switch aria-label={label} defaultChecked />
    </div>
  );
}

export function UserProfilePage() {
  const common = useTranslations('Common');
  const translate = useTranslations('Profile');
  const usersText = useTranslations('Users');
  const mockAction = useMockAction();

  return (
    <div className="page-shell">
      <PageHeader description={translate('description')} title={translate('title')} />
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit min-w-0">
          <CardContent className="flex flex-col items-center p-6 text-center">
            <Avatar className="size-24 ring-4 ring-primary/10">
              <AvatarFallback className="bg-blue-600 text-2xl text-white">AK</AvatarFallback>
            </Avatar>
            <h2 className="mt-4 text-lg font-bold">Amadou Kouyaté</h2>
            <p className="mt-1 text-sm text-muted-foreground">{usersText('admin')}</p>
            <Badge className="mt-3" variant="secondary">
              USR-001
            </Badge>
            <div className="mt-6 w-full space-y-4 border-t border-border pt-5 text-start">
              <ProfileFact
                icon={Mail}
                label={common('email')}
                value="amadou.kouyate@lyceevictor.ci"
              />
              <ProfileFact icon={Phone} label={common('phone')} value="+225 07 12 34 56 78" />
              <ProfileFact
                icon={MapPin}
                label={translate('location')}
                value="Abidjan, Côte d’Ivoire"
              />
            </div>
          </CardContent>
        </Card>

        <Tabs className="min-w-0" defaultValue="personal">
          <div className="max-w-full overflow-x-auto pb-1">
            <TabsList>
              <TabsTrigger value="personal">{translate('personal')}</TabsTrigger>
              <TabsTrigger value="security">{translate('security')}</TabsTrigger>
              <TabsTrigger value="notifications">{translate('notifications')}</TabsTrigger>
              <TabsTrigger value="activity">{translate('activity')}</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="personal">
            <Card>
              <CardHeader>
                <CardTitle>{translate('personal')}</CardTitle>
                <CardDescription>{translate('personalDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-5 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    mockAction(common('save'));
                  }}
                >
                  <FormField htmlFor="profile-first-name" label={translate('firstName')}>
                    <Input defaultValue="Amadou" id="profile-first-name" />
                  </FormField>
                  <FormField htmlFor="profile-last-name" label={translate('lastName')}>
                    <Input defaultValue="Kouyaté" id="profile-last-name" />
                  </FormField>
                  <FormField htmlFor="profile-email" label={common('email')}>
                    <Input
                      defaultValue="amadou.kouyate@lyceevictor.ci"
                      id="profile-email"
                      type="email"
                    />
                  </FormField>
                  <FormField htmlFor="profile-phone" label={common('phone')}>
                    <Input defaultValue="+225 07 12 34 56 78" id="profile-phone" type="tel" />
                  </FormField>
                  <div className="sm:col-span-2">
                    <Button type="submit">
                      <Save />
                      {common('save')}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>{translate('security')}</CardTitle>
                <CardDescription>{translate('securityDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                      <KeyRound className="size-4 text-primary" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{translate('password')}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {translate('passwordChanged')}
                      </p>
                    </div>
                  </div>
                  <Button onClick={() => mockAction(translate('password'))} variant="outline">
                    {translate('changePassword')}
                  </Button>
                </div>
                <PreferenceRow
                  description={translate('twoFactorDescription')}
                  label={translate('twoFactor')}
                />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>{translate('notifications')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-1">
                <PreferenceRow
                  description={translate('emailDescription')}
                  label={translate('emailNotifications')}
                />
                <PreferenceRow
                  description={translate('securityAlertDescription')}
                  label={translate('securityAlerts')}
                />
                <PreferenceRow
                  description={translate('digestDescription')}
                  label={translate('weeklyDigest')}
                />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>{translate('sessions')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Session
                  icon={Laptop}
                  location="Abidjan, Côte d’Ivoire"
                  name="Chrome · Linux"
                  status={translate('currentSession')}
                />
                <Session
                  icon={Smartphone}
                  location="Dakar, Sénégal"
                  name="Safari · iPhone"
                  status="02/09/2026 · 18:42"
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Session({
  icon: Icon,
  location,
  name,
  status,
}: {
  icon: LucideIcon;
  location: string;
  name: string;
  status: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">{location}</p>
      </div>
      <span className="text-end text-xs text-muted-foreground">{status}</span>
    </div>
  );
}
