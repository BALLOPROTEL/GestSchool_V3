import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Button } from './button';
import { DataTable } from './data-table';
import { Card, CardContent, StatusBadge } from './display';
import { Input, Select, SelectItem, Textarea } from './forms';
import { cn } from './lib/cn';
import { EmptyState } from './states';
import { Pagination } from './navigation';

describe('UI foundation components', () => {
  it('bounds pagination controls independently of the SQL result size', () => {
    const markup = renderToStaticMarkup(
      <Pagination
        currentPage={5000}
        totalPages={10000}
        labels={{ next: 'Next', previous: 'Previous' }}
      />,
    );
    expect(markup.match(/<button/g)).toHaveLength(5);
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('5000');
  });
  it('merges Tailwind classes predictably', () => {
    expect(cn('px-2 text-sm', false, 'px-4')).toBe('text-sm px-4');
  });

  it('renders button and card semantics without client-only assumptions', () => {
    const markup = renderToStaticMarkup(
      <Card>
        <CardContent>
          <Button type="submit">Save</Button>
        </CardContent>
      </Card>,
    );

    expect(markup).toContain('<section');
    expect(markup).toContain('type="submit"');
    expect(markup).toContain('Save');
  });

  it('renders accessible native form controls', () => {
    const markup = renderToStaticMarkup(
      <form>
        <Input aria-label="Name" />
        <Textarea aria-label="Notes" />
        <Select aria-label="Class" defaultValue="tc">
          <SelectItem value="tc">Terminale C</SelectItem>
        </Select>
      </form>,
    );

    expect(markup).toContain('aria-label="Name"');
    expect(markup).toContain('<textarea');
    expect(markup).toContain('<select');
    expect(markup).toContain('value="tc" selected=""');
  });

  it('renders table captions, rows and statuses', () => {
    const rows = [{ id: 'EL-001', name: 'Aminata Diallo' }] as const;
    const markup = renderToStaticMarkup(
      <DataTable
        caption="Students"
        columns={[
          { cell: (row) => row.id, header: 'ID', id: 'id' },
          { cell: (row) => row.name, header: 'Student', id: 'student' },
        ]}
        getRowId={(row) => row.id}
        rows={rows}
      />,
    );

    expect(markup).toContain('<caption class="sr-only">Students</caption>');
    expect(markup).toContain('Aminata Diallo');
    expect(renderToStaticMarkup(<StatusBadge tone="success">Active</StatusBadge>)).toContain(
      'Active',
    );
  });

  it('renders an explicit empty state', () => {
    const markup = renderToStaticMarkup(
      <EmptyState description="No matching record" title="No results" />,
    );
    expect(markup).toContain('No results');
    expect(markup).toContain('No matching record');
  });
});
