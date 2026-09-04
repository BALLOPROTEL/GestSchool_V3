'use client';

import {
  Button,
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from '@gestschool/ui';
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useMockAction } from './mock-action';

export function RowActions({ destructive = false }: { destructive?: boolean }) {
  const common = useTranslations('Common');
  const mockAction = useMockAction();
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button aria-label={common('more')} size="icon-sm" variant="ghost">
          <MoreHorizontal />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end">
        <DropdownItem onSelect={() => mockAction(common('view'))}>
          <Eye />
          {common('view')}
        </DropdownItem>
        <DropdownItem onSelect={() => mockAction(common('edit'))}>
          <Pencil />
          {common('edit')}
        </DropdownItem>
        {destructive ? (
          <>
            <DropdownSeparator />
            <DropdownItem destructive onSelect={() => mockAction(common('delete'))}>
              <Trash2 />
              {common('delete')}
            </DropdownItem>
          </>
        ) : null}
      </DropdownContent>
    </Dropdown>
  );
}
