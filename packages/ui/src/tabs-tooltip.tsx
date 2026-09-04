'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

import { cn } from './lib/cn';

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...properties }, reference) {
  return (
    <TabsPrimitive.List
      ref={reference}
      className={cn(
        'inline-flex min-h-9 w-fit items-center rounded-xl bg-muted p-[3px] text-muted-foreground',
        className,
      )}
      {...properties}
    />
  );
});

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...properties }, reference) {
  return (
    <TabsPrimitive.Trigger
      ref={reference}
      className={cn(
        'inline-flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs',
        className,
      )}
      {...properties}
    />
  );
});

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...properties }, reference) {
  return (
    <TabsPrimitive.Content
      ref={reference}
      className={cn('mt-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/40', className)}
      {...properties}
    />
  );
});

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ children, className, sideOffset = 6, ...properties }, reference) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={reference}
        className={cn(
          'z-80 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          className,
        )}
        sideOffset={sideOffset}
        {...properties}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
});
