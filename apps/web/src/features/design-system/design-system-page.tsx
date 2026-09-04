'use client';

import {
  Avatar,
  AvatarFallback,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  DataTable,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
  EmptyState,
  ErrorState,
  FileUpload,
  Input,
  KpiCard,
  Label,
  Pagination,
  PermissionDenied,
  Radio,
  RadioItem,
  Select,
  SelectItem,
  Skeleton,
  StatusBadge,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@gestschool/ui';
import type { DataTableColumn } from '@gestschool/ui';
import { Bell, ChevronDown, Inbox, Plus, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Link } from '../../i18n/navigation';
import { useMockAction } from '../shared/mock-action';
import { PageHeader } from '../shared/page-header';

type PreviewRow = { id: string; name: string; status: 'active' | 'pending' };

const previewRows: readonly PreviewRow[] = [
  { id: 'EL-001', name: 'Aminata Diallo', status: 'active' },
  { id: 'EL-002', name: 'Ibrahim Koné', status: 'pending' },
];

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <div>
      <div className={`h-16 rounded-lg border border-black/5 ${color}`} />
      <p className="mt-2 text-xs font-semibold">{label}</p>
    </div>
  );
}

export function DesignSystemPage() {
  const common = useTranslations('Common');
  const nav = useTranslations('Nav');
  const status = useTranslations('Status');
  const translate = useTranslations('DesignSystem');
  const mockAction = useMockAction();
  const [page, setPage] = useState(2);
  const columns: readonly DataTableColumn<PreviewRow>[] = [
    { cell: (row) => <span className="font-mono text-xs">{row.id}</span>, header: 'ID', id: 'id' },
    {
      cell: (row) => <span className="font-semibold">{row.name}</span>,
      header: common('student'),
      id: 'student',
    },
    {
      cell: (row) => (
        <StatusBadge dot tone={row.status === 'active' ? 'success' : 'warning'}>
          {status(row.status)}
        </StatusBadge>
      ),
      header: common('status'),
      id: 'status',
    },
  ];

  return (
    <div className="page-shell">
      <PageHeader
        description={translate('components')}
        eyebrow={nav('system')}
        title={translate('title')}
      />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>{translate('colors')}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Swatch color="bg-primary" label="Primary" />
            <Swatch color="bg-slate-950" label="Sidebar" />
            <Swatch color="bg-success" label="Success" />
            <Swatch color="bg-warning" label="Warning" />
            <Swatch color="bg-destructive" label="Danger" />
            <Swatch color="bg-background" label="Background" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{translate('typography')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <p className="text-3xl font-bold tracking-tight">GestSchool Display</p>
              <p className="text-xl font-semibold">Plus Jakarta Sans</p>
              <p className="max-w-xl text-sm leading-7 text-muted-foreground">
                {translate('components')}
              </p>
            </div>
            <div className="rounded-lg bg-slate-950 p-5 font-mono text-sm text-slate-200">
              <p>EL-2026-0042</p>
              <p className="mt-2 text-blue-400">150 000 XOF</p>
              <p className="mt-2 text-slate-400">JetBrains Mono</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{translate('buttons')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button>
                <Plus />
                {common('add')}
              </Button>
              <Button variant="secondary">{common('save')}</Button>
              <Button variant="outline">{common('edit')}</Button>
              <Button variant="ghost">{common('cancel')}</Button>
              <Button variant="destructive">{common('delete')}</Button>
              <Button disabled>{common('loading')}</Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button aria-label={translate('alerts')} size="icon">
                    <Bell />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{translate('alerts')}</TooltipContent>
              </Tooltip>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{translate('badges')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Badge>Badge</Badge>
              <Badge variant="secondary">{translate('secondary')}</Badge>
              <Badge variant="outline">{translate('outline')}</Badge>
              <Badge variant="destructive">{translate('danger')}</Badge>
              <StatusBadge dot tone="success">
                {status('active')}
              </StatusBadge>
              <StatusBadge dot tone="warning">
                {status('pending')}
              </StatusBadge>
              <StatusBadge tone="danger">{status('overdue')}</StatusBadge>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{translate('forms')}</CardTitle>
            <CardDescription>{translate('controls')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ds-name">{common('student')}</Label>
              <Input id="ds-name" placeholder="Aminata Diallo" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ds-class">{common('class')}</Label>
              <Select defaultValue="tc" id="ds-class">
                <SelectItem value="tc">Terminale C</SelectItem>
                <SelectItem value="td">Terminale D</SelectItem>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="ds-notes">{translate('notes')}</Label>
              <Textarea id="ds-notes" placeholder={common('mockAction')} />
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox defaultChecked id="ds-checkbox" />
                <Label htmlFor="ds-checkbox">{status('active')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch defaultChecked id="ds-switch" />
                <Label htmlFor="ds-switch">{translate('alerts')}</Label>
              </div>
            </div>
            <Radio className="grid-cols-2" defaultValue="email">
              <div className="flex items-center gap-2">
                <RadioItem id="ds-radio-email" value="email" />
                <Label htmlFor="ds-radio-email">E-mail</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioItem id="ds-radio-sms" value="sms" />
                <Label htmlFor="ds-radio-sms">SMS</Label>
              </div>
            </Radio>
          </CardContent>
        </Card>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Dialog · Drawer · Dropdown</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Dialog</Button>
                </DialogTrigger>
                <DialogContent closeLabel={common('close')}>
                  <DialogHeader>
                    <DialogTitle>{translate('dialogTitle')}</DialogTitle>
                    <DialogDescription>{translate('dialogDescription')}</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">{common('cancel')}</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button onClick={() => mockAction(common('confirm'))}>
                        {common('confirm')}
                      </Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Drawer>
                <DrawerTrigger asChild>
                  <Button variant="outline">Drawer</Button>
                </DrawerTrigger>
                <DrawerContent
                  className="bg-card p-6 text-foreground"
                  closeLabel={common('close')}
                  side="end"
                >
                  <DrawerTitle className="text-lg font-semibold">
                    {translate('drawerTitle')}
                  </DrawerTitle>
                  <DrawerDescription className="mt-2 text-sm text-muted-foreground">
                    {translate('drawerDescription')}
                  </DrawerDescription>
                  <DrawerClose asChild>
                    <Button className="mt-6" variant="outline">
                      {common('close')}
                    </Button>
                  </DrawerClose>
                </DrawerContent>
              </Drawer>
              <Dropdown>
                <DropdownTrigger asChild>
                  <Button variant="outline">
                    Dropdown
                    <ChevronDown />
                  </Button>
                </DropdownTrigger>
                <DropdownContent>
                  <DropdownLabel>{common('actions')}</DropdownLabel>
                  <DropdownSeparator />
                  <DropdownItem onSelect={() => mockAction(common('view'))}>
                    {common('view')}
                  </DropdownItem>
                  <DropdownItem onSelect={() => mockAction(common('edit'))}>
                    {common('edit')}
                  </DropdownItem>
                  <DropdownItem destructive onSelect={() => mockAction(common('delete'))}>
                    {common('delete')}
                  </DropdownItem>
                </DropdownContent>
              </Dropdown>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{translate('avatars')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
              <Avatar className="size-8">
                <AvatarFallback>AD</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>IK</AvatarFallback>
              </Avatar>
              <Avatar className="size-14">
                <AvatarFallback>FK</AvatarFallback>
              </Avatar>
              <KpiCard
                change="+4,2 %"
                changeDirection="up"
                icon={UsersRound}
                label={common('student')}
                value="1 247"
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tabs · Breadcrumb · Pagination</CardTitle>
          </CardHeader>
          <CardContent>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <Link href="/">GestSchool</Link>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{translate('title')}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <Tabs className="mt-5 min-w-0" defaultValue="one">
              <div className="max-w-full overflow-x-auto pb-1">
                <TabsList>
                  <TabsTrigger value="one">{translate('components')}</TabsTrigger>
                  <TabsTrigger value="two">{translate('states')}</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="one">
                <p className="text-sm text-muted-foreground">{translate('dialogDescription')}</p>
              </TabsContent>
              <TabsContent value="two">
                <p className="text-sm text-muted-foreground">{translate('errorDescription')}</p>
              </TabsContent>
            </Tabs>
            <div className="mt-6">
              <Pagination
                currentPage={page}
                labels={{ next: common('next'), previous: common('previous') }}
                onPageChange={setPage}
                totalPages={4}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{translate('caption')}</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <DataTable
              caption={translate('caption')}
              columns={columns}
              getRowId={(row) => row.id}
              minWidth={560}
              rows={previewRows}
            />
          </CardContent>
          <CardFooter className="justify-end">
            <Button size="sm" variant="outline">
              {common('view')}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{translate('upload')}</CardTitle>
          </CardHeader>
          <CardContent>
            <FileUpload
              labels={{
                browse: common('browse'),
                clear: common('clear'),
                drop: translate('uploadDrop'),
                hint: translate('uploadHint'),
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{translate('states')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border p-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-4/5" />
              <Skeleton className="mt-6 h-9 w-28" />
            </div>
            <div className="rounded-lg border border-border">
              <EmptyState
                description={translate('emptyDescription')}
                icon={Inbox}
                title={common('noResults')}
              />
            </div>
            <div className="rounded-lg border border-border">
              <ErrorState
                actionLabel={common('retry')}
                description={translate('errorDescription')}
                onAction={() => mockAction(common('retry'))}
                title={translate('errorTitle')}
              />
            </div>
          </CardContent>
          <div className="border-t border-border">
            <PermissionDenied
              actionLabel={common('back')}
              description={translate('permissionDescription')}
              onAction={() => mockAction(common('back'))}
              title={translate('permissionTitle')}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
