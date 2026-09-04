'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';

import { DialogOverlay } from './dialog';
import { cn } from './lib/cn';

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;
export const DrawerTitle = DialogPrimitive.Title;
export const DrawerDescription = DialogPrimitive.Description;

export const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    closeLabel?: string;
    side?: 'end' | 'start';
  }
>(function DrawerContent(
  { children, className, closeLabel = 'Close', side = 'start', ...properties },
  reference,
) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={reference}
        className={cn(
          'fixed inset-y-0 z-70 w-[min(88vw,320px)] overflow-y-auto bg-sidebar text-sidebar-foreground shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out',
          side === 'start'
            ? 'start-0 border-e border-sidebar-border'
            : 'end-0 border-s border-sidebar-border',
          className,
        )}
        {...properties}
      >
        {children}
        <DialogPrimitive.Close
          aria-label={closeLabel}
          className="absolute end-3 top-3 rounded-md p-2 text-sidebar-foreground outline-none hover:bg-sidebar-accent hover:text-white focus-visible:ring-3 focus-visible:ring-sidebar-primary/50"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
