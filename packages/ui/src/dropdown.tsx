'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight, Circle } from 'lucide-react';
import * as React from 'react';

import { cn } from './lib/cn';

export const Dropdown = DropdownPrimitive.Root;
export const DropdownTrigger = DropdownPrimitive.Trigger;
export const DropdownGroup = DropdownPrimitive.Group;
export const DropdownRadioGroup = DropdownPrimitive.RadioGroup;
export const DropdownSub = DropdownPrimitive.Sub;

export const DropdownContent = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(function DropdownContent({ className, sideOffset = 6, ...properties }, reference) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        ref={reference}
        className={cn(
          'z-60 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-44 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          className,
        )}
        sideOffset={sideOffset}
        {...properties}
      />
    </DropdownPrimitive.Portal>
  );
});

export const DropdownItem = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & {
    destructive?: boolean;
    inset?: boolean;
  }
>(function DropdownItem({ className, destructive, inset, ...properties }, reference) {
  return (
    <DropdownPrimitive.Item
      ref={reference}
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4',
        inset && 'ps-8',
        destructive && 'text-destructive focus:bg-destructive/10 focus:text-destructive',
        className,
      )}
      {...properties}
    />
  );
});

export const DropdownCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.CheckboxItem>
>(function DropdownCheckboxItem({ checked, children, className, ...properties }, reference) {
  return (
    <DropdownPrimitive.CheckboxItem
      ref={reference}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-md py-2 pe-2 ps-8 text-sm outline-none focus:bg-accent',
        className,
      )}
      {...(checked === undefined ? {} : { checked })}
      {...properties}
    >
      <span className="absolute start-2 flex size-4 items-center justify-center">
        <DropdownPrimitive.ItemIndicator>
          <Check className="size-4" />
        </DropdownPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownPrimitive.CheckboxItem>
  );
});

export const DropdownRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.RadioItem>
>(function DropdownRadioItem({ children, className, ...properties }, reference) {
  return (
    <DropdownPrimitive.RadioItem
      ref={reference}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-md py-2 pe-2 ps-8 text-sm outline-none focus:bg-accent',
        className,
      )}
      {...properties}
    >
      <span className="absolute start-2 flex size-4 items-center justify-center">
        <DropdownPrimitive.ItemIndicator>
          <Circle className="size-2 fill-current" />
        </DropdownPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownPrimitive.RadioItem>
  );
});

export const DropdownLabel = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>
>(function DropdownLabel({ className, ...properties }, reference) {
  return (
    <DropdownPrimitive.Label
      ref={reference}
      className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground', className)}
      {...properties}
    />
  );
});

export const DropdownSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>
>(function DropdownSeparator({ className, ...properties }, reference) {
  return (
    <DropdownPrimitive.Separator
      ref={reference}
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...properties}
    />
  );
});

export const DropdownSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.SubTrigger>
>(function DropdownSubTrigger({ children, className, ...properties }, reference) {
  return (
    <DropdownPrimitive.SubTrigger
      ref={reference}
      className={cn(
        'flex cursor-default select-none items-center rounded-md px-2 py-2 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent',
        className,
      )}
      {...properties}
    >
      {children}
      <ChevronRight className="ms-auto size-4 rtl:rotate-180" />
    </DropdownPrimitive.SubTrigger>
  );
});

export const DropdownSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.SubContent>
>(function DropdownSubContent({ className, ...properties }, reference) {
  return (
    <DropdownPrimitive.SubContent
      ref={reference}
      className={cn(
        'z-60 min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none',
        className,
      )}
      {...properties}
    />
  );
});
