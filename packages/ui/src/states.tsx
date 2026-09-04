import { AlertCircle, FileQuestion, LockKeyhole, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from './button';
import { cn } from './lib/cn';

type StateProperties = {
  actionLabel?: string;
  className?: string;
  description: string;
  icon?: LucideIcon;
  onAction?: () => void;
  title: string;
};

function StateLayout({
  actionLabel,
  className,
  description,
  icon: Icon = FileQuestion,
  onAction,
  title,
}: StateProperties) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-4 py-12 text-center', className)}
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted">
        <Icon aria-hidden="true" className="size-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {actionLabel ? (
        <Button className="mt-5" onClick={onAction} size="sm" variant="outline">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState(properties: StateProperties) {
  return <StateLayout {...properties} />;
}

export function ErrorState(properties: Omit<StateProperties, 'icon'>) {
  return (
    <StateLayout
      icon={AlertCircle}
      {...properties}
      className={cn(
        '[&_div:first-child]:bg-destructive/10 [&_svg]:text-destructive',
        properties.className,
      )}
    />
  );
}

export function PermissionDenied(properties: Omit<StateProperties, 'icon'>) {
  return (
    <StateLayout
      icon={LockKeyhole}
      {...properties}
      className={cn('[&_div:first-child]:bg-warning/10 [&_svg]:text-warning', properties.className)}
    />
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div
      aria-live="polite"
      className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
    >
      <RefreshCw aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
      {label}
    </div>
  );
}
