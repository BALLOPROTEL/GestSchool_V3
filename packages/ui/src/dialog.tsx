'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';

import { cn } from './lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...properties }, reference) {
  return (
    <DialogPrimitive.Overlay
      ref={reference}
      className={cn(
        'fixed inset-0 z-70 bg-slate-950/55 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...properties}
    />
  );
});

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    closeLabel?: string;
    hideClose?: boolean;
  }
>(function DialogContent(
  { children, className, closeLabel = 'Close', hideClose = false, ...properties },
  reference,
) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={reference}
        className={cn(
          'fixed start-1/2 top-1/2 z-70 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-background p-6 text-foreground shadow-xl outline-none rtl:translate-x-1/2 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          className,
        )}
        {...properties}
      >
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="absolute end-4 top-4 rounded-md p-1 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

export function DialogHeader({ className, ...properties }: React.ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('space-y-1.5 text-start', className)} {...properties} />;
}

export function DialogFooter({ className, ...properties }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...properties}
    />
  );
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...properties }, reference) {
  return (
    <DialogPrimitive.Title
      ref={reference}
      className={cn('text-lg font-semibold', className)}
      {...properties}
    />
  );
});

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...properties }, reference) {
  return (
    <DialogPrimitive.Description
      ref={reference}
      className={cn('text-sm leading-relaxed text-muted-foreground', className)}
      {...properties}
    />
  );
});
