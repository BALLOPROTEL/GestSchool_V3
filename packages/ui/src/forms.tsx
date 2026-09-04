'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check, ChevronDown, Circle } from 'lucide-react';
import * as React from 'react';

import { cn } from './lib/cn';

export const Input = React.forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<'input'>>(
  function Input({ className, type, ...properties }, reference) {
    return (
      <input
        ref={reference}
        className={cn(
          'flex h-9 w-full min-w-0 rounded-md border border-input bg-input-background px-3 py-1 text-base text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/25 md:text-sm',
          className,
        )}
        data-slot="input"
        type={type}
        {...properties}
      />
    );
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentPropsWithoutRef<'textarea'>
>(function Textarea({ className, ...properties }, reference) {
  return (
    <textarea
      ref={reference}
      className={cn(
        'flex min-h-24 w-full resize-y rounded-md border border-input bg-input-background px-3 py-2 text-base text-foreground shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/25 md:text-sm',
        className,
      )}
      data-slot="textarea"
      {...properties}
    />
  );
});

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(function Label({ className, ...properties }, reference) {
  return (
    <LabelPrimitive.Root
      ref={reference}
      className={cn(
        'text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
        className,
      )}
      data-slot="label"
      {...properties}
    />
  );
});

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...properties }, reference) {
  return (
    <CheckboxPrimitive.Root
      ref={reference}
      className={cn(
        'peer size-4 shrink-0 rounded-[4px] border border-input bg-input-background shadow-xs outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        className,
      )}
      data-slot="checkbox"
      {...properties}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <Check className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

export function Radio({
  className,
  ...properties
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      className={cn('grid gap-3', className)}
      data-slot="radio"
      {...properties}
    />
  );
}

export const RadioItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(function RadioItem({ className, ...properties }, reference) {
  return (
    <RadioGroupPrimitive.Item
      ref={reference}
      className={cn(
        'aspect-square size-4 shrink-0 rounded-full border border-input bg-input-background text-primary shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      data-slot="radio-item"
      {...properties}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="size-2 fill-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
});

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...properties }, reference) {
  return (
    <SwitchPrimitive.Root
      ref={reference}
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-switch-background outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary',
        className,
      )}
      data-slot="switch"
      {...properties}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-card shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0 rtl:data-[state=checked]:-translate-x-4" />
    </SwitchPrimitive.Root>
  );
});

export const Select = React.forwardRef<HTMLSelectElement, React.ComponentPropsWithoutRef<'select'>>(
  function Select({ className, children, ...properties }, reference) {
    return (
      <span className="relative block">
        <select
          ref={reference}
          className={cn(
            'h-9 w-full appearance-none rounded-md border border-input bg-input-background py-1.5 pe-9 ps-3 text-sm text-foreground shadow-xs outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          data-slot="select"
          {...properties}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </span>
    );
  },
);

export const SelectItem = React.forwardRef<
  HTMLOptionElement,
  React.ComponentPropsWithoutRef<'option'>
>(function SelectItem({ className, ...properties }, reference) {
  return (
    <option
      ref={reference}
      className={cn('bg-popover text-popover-foreground', className)}
      {...properties}
    />
  );
});
