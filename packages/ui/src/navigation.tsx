import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import * as React from 'react';

import { Button } from './button';
import { cn } from './lib/cn';

export function Breadcrumb({ className, ...properties }: React.ComponentPropsWithoutRef<'nav'>) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('text-sm text-muted-foreground', className)}
      data-slot="breadcrumb"
      {...properties}
    />
  );
}

export function BreadcrumbList({ className, ...properties }: React.ComponentPropsWithoutRef<'ol'>) {
  return <ol className={cn('flex flex-wrap items-center gap-2', className)} {...properties} />;
}

export function BreadcrumbItem({ className, ...properties }: React.ComponentPropsWithoutRef<'li'>) {
  return <li className={cn('inline-flex items-center gap-2', className)} {...properties} />;
}

export function BreadcrumbSeparator({
  children,
  className,
  ...properties
}: React.ComponentPropsWithoutRef<'li'>) {
  return (
    <li
      aria-hidden="true"
      className={cn('[&_svg]:size-3.5 rtl:[&_svg]:rotate-180', className)}
      role="presentation"
      {...properties}
    >
      {children ?? <ChevronRight />}
    </li>
  );
}

export function BreadcrumbPage({
  className,
  ...properties
}: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      aria-current="page"
      className={cn('font-medium text-foreground', className)}
      {...properties}
    />
  );
}

export type PaginationProperties = {
  currentPage: number;
  labels: { next: string; previous: string };
  onPageChange?: (page: number) => void;
  totalPages: number;
};

export function Pagination({
  currentPage,
  labels,
  onPageChange,
  totalPages,
}: PaginationProperties) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
  return (
    <nav aria-label="Pagination" className="flex max-w-full items-center justify-center gap-1">
      <Button
        aria-label={labels.previous}
        disabled={currentPage === 1}
        onClick={() => onPageChange?.(currentPage - 1)}
        size="icon-sm"
        variant="outline"
      >
        <ChevronLeft className="rtl:rotate-180" />
      </Button>
      {pages.map((page) => (
        <Button
          aria-current={page === currentPage ? 'page' : undefined}
          aria-label={`${page}`}
          key={page}
          onClick={() => onPageChange?.(page)}
          size="icon-sm"
          variant={page === currentPage ? 'default' : 'outline'}
        >
          {page}
        </Button>
      ))}
      {totalPages > 4 ? <MoreHorizontal aria-hidden="true" className="mx-1 size-4" /> : null}
      <Button
        aria-label={labels.next}
        disabled={currentPage === totalPages}
        onClick={() => onPageChange?.(currentPage + 1)}
        size="icon-sm"
        variant="outline"
      >
        <ChevronRight className="rtl:rotate-180" />
      </Button>
    </nav>
  );
}
