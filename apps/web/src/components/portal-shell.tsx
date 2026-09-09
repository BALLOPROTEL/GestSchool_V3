'use client';

import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Drawer,
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
  Input,
  Select,
  SelectItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@gestschool/ui';
import {
  Activity,
  Bell,
  BookOpenCheck,
  Building2,
  CalendarCheck,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardList,
  Command,
  FileText,
  FolderOpen,
  Globe2,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Medal,
  Menu,
  MessagesSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  School,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  UserRoundCheck,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../features/auth/auth-provider';

import { Link, usePathname, useRouter } from '../i18n/navigation';
import type { AppLocale } from '../i18n/routing';
import { routing } from '../i18n/routing';
import { AppLogo } from './app-logo';

type NavItem = {
  badge?: string;
  href: string;
  icon: LucideIcon;
  key: string;
};

type NavGroup = {
  key?: string;
  items: readonly NavItem[];
};

const navigation: readonly NavGroup[] = [
  { items: [{ href: '/', icon: LayoutDashboard, key: 'dashboard' }] },
  {
    key: 'schoolLife',
    items: [
      { badge: '1K+', href: '/students', icon: GraduationCap, key: 'students' },
      { href: '/parents', icon: UsersRound, key: 'parents' },
      { href: '/teachers', icon: UserRoundCheck, key: 'teachers' },
      { href: '/enrollments', icon: ClipboardList, key: 'enrollments' },
    ],
  },
  {
    key: 'academic',
    items: [
      { href: '/classes', icon: School, key: 'classes' },
      { href: '/subjects', icon: BookOpenCheck, key: 'subjects' },
      { href: '/grades', icon: Medal, key: 'grades' },
      { href: '/attendance', icon: CalendarCheck, key: 'attendance' },
    ],
  },
  {
    key: 'administration',
    items: [
      { href: '/finance', icon: WalletCards, key: 'finance' },
      { href: '/documents', icon: FolderOpen, key: 'documents' },
      { href: '/communications', icon: MessagesSquare, key: 'communications' },
      { href: '/reports', icon: ChartNoAxesCombined, key: 'reports' },
    ],
  },
  {
    key: 'system',
    items: [
      { href: '/users', icon: ShieldCheck, key: 'users' },
      { href: '/settings', icon: Settings, key: 'settings' },
      { href: '/audit', icon: Activity, key: 'audit' },
    ],
  },
] as const;

function isCurrentPath(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationList({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const translate = useTranslations('Nav');

  return (
    <nav aria-label={translate('dashboard')} className="flex-1 overflow-y-auto px-2 pb-4">
      {navigation.map((group, groupIndex) => (
        <div className={cn(groupIndex > 0 && 'mt-4')} key={group.key ?? 'root'}>
          {group.key && !collapsed ? (
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {translate(group.key)}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isCurrentPath(pathname, item.href);
              const Icon = item.icon;
              const link = (
                <Link
                  aria-current={active ? 'page' : undefined}
                  aria-label={translate(item.key)}
                  className={cn(
                    'group relative flex h-8 items-center gap-3 rounded-md px-2 text-[13px] font-medium text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-white focus-visible:ring-2 focus-visible:ring-sidebar-primary/60',
                    collapsed && 'justify-center px-0',
                    active && 'bg-sidebar-accent text-white',
                  )}
                  href={item.href}
                  onClick={onNavigate}
                >
                  {active ? (
                    <span className="absolute inset-y-1 start-0 w-0.5 rounded-full bg-blue-500" />
                  ) : null}
                  <Icon
                    aria-hidden="true"
                    className={cn('size-4 shrink-0 text-slate-500', active && 'text-blue-400')}
                  />
                  {collapsed ? null : (
                    <span className="min-w-0 flex-1 truncate">{translate(item.key)}</span>
                  )}
                  {!collapsed && item.badge ? (
                    <Badge className="border-0 bg-slate-800 px-1.5 text-[9px] text-slate-400">
                      {item.badge}
                    </Badge>
                  ) : null}
                </Link>
              );
              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side={locale === 'ar' ? 'left' : 'right'}>
                        {translate(item.key)}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarIdentity({ collapsed = false }: { collapsed?: boolean }) {
  const shell = useTranslations('Shell');
  return (
    <Link
      aria-label={shell('profile')}
      className={cn(
        'flex items-center gap-2.5 border-t border-sidebar-border p-3 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-primary/60',
        collapsed && 'justify-center',
      )}
      href="/profile"
    >
      <Avatar className="size-8">
        <AvatarFallback className="bg-blue-600 text-[11px] text-white">AK</AvatarFallback>
      </Avatar>
      {collapsed ? null : (
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-xs font-semibold text-white">Amadou Kouyaté</span>
          <span className="block truncate text-[10px] text-slate-400">{shell('admin')}</span>
        </span>
      )}
    </Link>
  );
}

function MobileSchoolContext() {
  const shell = useTranslations('Shell');
  return (
    <div className="mx-3 mb-4 space-y-2 rounded-lg border border-sidebar-border bg-sidebar-accent/55 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {shell('currentSchool')}
      </p>
      <p className="truncate text-xs font-semibold text-white">Lycée Moderne Victor Hugo</p>
      <p className="text-[11px] text-slate-400">{shell('academicYear', { year: '2026–2027' })}</p>
    </div>
  );
}

function DesktopSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const shell = useTranslations('Shell');
  return (
    <aside
      className={cn(
        'fixed inset-y-0 start-0 z-40 hidden flex-col border-e border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[60px]' : 'w-[260px]',
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center border-b border-sidebar-border px-3',
          collapsed && 'justify-center',
        )}
      >
        <AppLogo compact={collapsed} />
      </div>
      <NavigationList collapsed={collapsed} />
      <Button
        aria-label={collapsed ? shell('expand') : shell('collapse')}
        className="h-10 rounded-none border-y border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
        onClick={onToggle}
        variant="ghost"
      >
        {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        {collapsed ? null : <span className="text-xs">{shell('collapse')}</span>}
      </Button>
      <SidebarIdentity collapsed={collapsed} />
    </aside>
  );
}

function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const common = useTranslations('Common');
  const shell = useTranslations('Shell');
  return (
    <Drawer onOpenChange={setOpen} open={open}>
      <DrawerTrigger asChild>
        <Button aria-label={shell('menu')} className="lg:hidden" size="icon-sm" variant="ghost">
          <Menu />
        </Button>
      </DrawerTrigger>
      <DrawerContent closeLabel={common('close')}>
        <DrawerTitle className="sr-only">{shell('menu')}</DrawerTitle>
        <DrawerDescription className="sr-only">{shell('currentSchool')}</DrawerDescription>
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <AppLogo />
        </div>
        <MobileSchoolContext />
        <NavigationList onNavigate={() => setOpen(false)} />
        <SidebarIdentity />
      </DrawerContent>
    </Drawer>
  );
}

export function LocaleSelect() {
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();
  const shell = useTranslations('Shell');

  return (
    <label className="relative flex items-center">
      <Globe2 aria-hidden="true" className="pointer-events-none absolute start-2.5 z-10 size-4" />
      <span className="sr-only">{shell('language')}</span>
      <Select
        aria-label={shell('language')}
        className="w-[82px] ps-8 text-xs font-semibold uppercase sm:w-[86px]"
        onChange={(event) => {
          const nextLocale = event.target.value;
          if (routing.locales.some((candidate) => candidate === nextLocale)) {
            router.replace(pathname, { locale: nextLocale as AppLocale });
          }
        }}
        value={locale}
      >
        <SelectItem value="fr">FR</SelectItem>
        <SelectItem value="en">EN</SelectItem>
        <SelectItem value="ar">AR</SelectItem>
      </Select>
    </label>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const shell = useTranslations('Shell');
  return (
    <Button
      aria-label={shell('theme')}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      size="icon-sm"
      variant="ghost"
    >
      <Moon className="dark:hidden" />
      <Sun className="hidden dark:block" />
    </Button>
  );
}

function SearchDialog() {
  const [open, setOpen] = useState(false);
  const common = useTranslations('Common');
  const shell = useTranslations('Shell');
  const nav = useTranslations('Nav');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const shortcuts = [
    { href: '/students', key: 'students' },
    { href: '/classes', key: 'classes' },
    { href: '/finance', key: 'finance' },
  ] as const;

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <Button
        aria-label={shell('search')}
        className="h-9 min-w-0 flex-1 justify-start bg-muted/70 px-3 text-muted-foreground hover:bg-muted md:max-w-[300px]"
        onClick={() => setOpen(true)}
        variant="ghost"
      >
        <Search className="shrink-0" />
        <span className="truncate text-xs sm:text-sm">{shell('search')}</span>
        <kbd className="ms-auto hidden rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground sm:inline">
          {shell('searchShortcut')}
        </kbd>
      </Button>
      <DialogContent closeLabel={common('close')}>
        <DialogHeader>
          <DialogTitle>{shell('searchDialog')}</DialogTitle>
          <DialogDescription>{shell('searchHint')}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus className="ps-9" placeholder={shell('search')} type="search" />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {shortcuts.map((shortcut) => (
            <Button asChild key={shortcut.href} variant="outline">
              <Link href={shortcut.href} onClick={() => setOpen(false)}>
                {nav(shortcut.key)}
              </Link>
            </Button>
          ))}
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Command className="size-3.5" />
          {shell('searchShortcut')}
        </p>
      </DialogContent>
    </Dialog>
  );
}

function NotificationMenu() {
  const shell = useTranslations('Shell');
  const notices = ['notification1', 'notification2', 'notification3', 'notification4'] as const;
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button aria-label={shell('unread')} className="relative" size="icon-sm" variant="ghost">
          <Bell />
          <span className="absolute end-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white">
            2
          </span>
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end" className="w-[min(92vw,340px)]">
        <DropdownLabel>{shell('notifications')}</DropdownLabel>
        <DropdownSeparator />
        {notices.map((notice, index) => (
          <DropdownItem className="items-start py-2.5" key={notice}>
            <span
              aria-hidden="true"
              className={cn(
                'mt-1 size-2 shrink-0 rounded-full',
                index < 2 ? 'bg-blue-600' : 'bg-slate-300',
              )}
            />
            <span className="text-xs leading-relaxed">{shell(notice)}</span>
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}

function ProfileMenu() {
  const { session, logout } = useAuth();
  const router = useRouter();
  const iam = useTranslations('Iam');
  const shell = useTranslations('Shell');
  const nav = useTranslations('Nav');
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button className="gap-2 px-1.5 sm:px-2" variant="ghost">
          <Avatar className="size-7">
            <AvatarFallback className="bg-blue-600 text-[10px] text-white">AK</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-24 truncate text-xs sm:block">
            {session?.session.user.displayName}
          </span>
          <ChevronDown className="hidden size-3 sm:block" />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end" className="w-52">
        <DropdownLabel>
          <span className="block truncate text-foreground">
            {session?.session.user.displayName}
          </span>
          <span className="mt-0.5 block truncate font-normal">{session?.session.tenant.name}</span>
        </DropdownLabel>
        <DropdownSeparator />
        <DropdownItem asChild>
          <Link href="/profile">
            <UsersRound />
            {shell('profile')}
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/design-system">
            <FileText />
            {nav('designSystem')}
          </Link>
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem
          onSelect={() => {
            void logout()
              .then(() => router.push('/login'))
              .catch(() => toast.error(iam('AUTH_UNAVAILABLE')));
          }}
        >
          <LogOut />
          {shell('logout')}
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

function Topbar() {
  const shell = useTranslations('Shell');
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:px-4">
      <MobileNavigation />
      <div className="hidden min-w-0 items-center gap-2 xl:flex">
        <Building2 aria-hidden="true" className="size-4 text-muted-foreground" />
        <Select
          aria-label={shell('currentSchool')}
          className="w-52 border-0 bg-transparent font-semibold shadow-none"
        >
          <SelectItem>Lycée Moderne Victor Hugo</SelectItem>
          <SelectItem>Collège Saint-Charles</SelectItem>
          <SelectItem>École Les Flamboyants</SelectItem>
        </Select>
        <Select
          aria-label={shell('academicYear', { year: '2026–2027' })}
          className="w-32 border-0 bg-transparent font-mono text-xs shadow-none"
          dir="ltr"
        >
          <SelectItem>2026–2027</SelectItem>
          <SelectItem>2025–2026</SelectItem>
          <SelectItem>2024–2025</SelectItem>
        </Select>
      </div>
      <SearchDialog />
      <div className="ms-auto flex shrink-0 items-center gap-0.5">
        <NotificationMenu />
        <LocaleSelect />
        <ThemeToggle />
        <ProfileMenu />
      </div>
    </header>
  );
}

export function PortalShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const shell = useTranslations('Shell');

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('gestschool-sidebar') === 'collapsed');
  }, []);

  const toggleSidebar = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem('gestschool-sidebar', next ? 'collapsed' : 'expanded');
      return next;
    });
  };

  const style = { '--sidebar-width': collapsed ? '60px' : '260px' } as CSSProperties;

  return (
    <div className="min-h-screen bg-background" style={style}>
      <a
        className="fixed start-3 top-3 z-100 -translate-y-20 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:translate-y-0"
        href="#main-content"
      >
        {shell('skip')}
      </a>
      <DesktopSidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="min-w-0 transition-[padding] duration-200 lg:ps-[var(--sidebar-width)]">
        <Topbar />
        <div className="border-b border-border bg-blue-50/70 px-4 py-1.5 text-center text-[10px] font-medium text-blue-800 dark:bg-blue-950/25 dark:text-blue-300">
          {shell('demo')}
        </div>
        <main className="min-w-0" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
