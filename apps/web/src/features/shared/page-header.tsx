import type { ReactNode } from 'react';

export type PageHeaderProperties = {
  actions?: ReactNode;
  description: ReactNode;
  eyebrow?: ReactNode;
  headingLevel?: 1 | 2;
  title: ReactNode;
};

export function PageHeader({
  actions,
  description,
  eyebrow,
  headingLevel = 1,
  title,
}: PageHeaderProperties) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <Heading className="text-2xl font-bold tracking-tight text-foreground">{title}</Heading>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
