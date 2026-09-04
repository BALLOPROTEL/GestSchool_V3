import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from './lib/cn';

export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type BadgeProperties = React.ComponentPropsWithoutRef<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean };

export function Badge({ asChild = false, className, variant, ...properties }: BadgeProperties) {
  const Component = asChild ? Slot : 'span';
  return (
    <Component
      className={cn(badgeVariants({ className, variant }))}
      data-slot="badge"
      {...properties}
    />
  );
}

export type StatusTone = 'danger' | 'info' | 'neutral' | 'success' | 'violet' | 'warning';

const statusToneClasses: Record<StatusTone, string> = {
  danger: 'bg-red-100 text-red-700 dark:bg-red-950/45 dark:text-red-300',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-950/45 dark:text-blue-300',
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950/45 dark:text-violet-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950/45 dark:text-amber-300',
};

export function StatusBadge({
  children,
  className,
  dot = false,
  tone = 'neutral',
  ...properties
}: React.ComponentPropsWithoutRef<'span'> & { dot?: boolean; tone?: StatusTone }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        statusToneClasses[tone],
        className,
      )}
      data-slot="status-badge"
      {...properties}
    >
      {dot ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function Card({ className, ...properties }: React.ComponentPropsWithoutRef<'section'>) {
  return (
    <section
      className={cn('rounded-xl border border-border bg-card text-card-foreground', className)}
      data-slot="card"
      {...properties}
    />
  );
}

export function CardHeader({ className, ...properties }: React.ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('p-5 pb-0', className)} data-slot="card-header" {...properties} />;
}

export function CardTitle({ className, ...properties }: React.ComponentPropsWithoutRef<'h2'>) {
  return (
    <h2 className={cn('text-base font-semibold text-foreground', className)} {...properties} />
  );
}

export function CardDescription({ className, ...properties }: React.ComponentPropsWithoutRef<'p'>) {
  return <p className={cn('mt-1 text-sm text-muted-foreground', className)} {...properties} />;
}

export function CardContent({ className, ...properties }: React.ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('p-5', className)} data-slot="card-content" {...properties} />;
}

export function CardFooter({ className, ...properties }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('flex items-center border-t border-border p-5', className)}
      data-slot="card-footer"
      {...properties}
    />
  );
}

export const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(function Avatar({ className, ...properties }, reference) {
  return (
    <AvatarPrimitive.Root
      ref={reference}
      className={cn('relative flex size-10 shrink-0 overflow-hidden rounded-full', className)}
      data-slot="avatar"
      {...properties}
    />
  );
});

export const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(function AvatarImage({ className, ...properties }, reference) {
  return (
    <AvatarPrimitive.Image
      ref={reference}
      className={cn('aspect-square size-full object-cover', className)}
      {...properties}
    />
  );
});

export const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(function AvatarFallback({ className, ...properties }, reference) {
  return (
    <AvatarPrimitive.Fallback
      ref={reference}
      className={cn(
        'flex size-full items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary',
        className,
      )}
      {...properties}
    />
  );
});

export function Skeleton({ className, ...properties }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      data-slot="skeleton"
      {...properties}
    />
  );
}

export function Separator({
  className,
  orientation = 'horizontal',
  ...properties
}: React.ComponentPropsWithoutRef<'div'> & { orientation?: 'horizontal' | 'vertical' }) {
  return (
    <div
      aria-orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      role="separator"
      {...properties}
    />
  );
}
