import type { LucideIcon } from 'lucide-react';
import { ArrowDown, ArrowUp } from 'lucide-react';

import { Card, CardContent } from './display';
import { cn } from './lib/cn';

export type KpiCardProperties = {
  change?: string;
  changeDirection?: 'down' | 'neutral' | 'up';
  helper?: string;
  icon: LucideIcon;
  label: string;
  value: string;
};

export function KpiCard({
  change,
  changeDirection = 'neutral',
  helper,
  icon: Icon,
  label,
  value,
}: KpiCardProperties) {
  const ChangeIcon = changeDirection === 'up' ? ArrowUp : ArrowDown;
  return (
    <Card className="min-h-36">
      <CardContent className="flex h-full flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <Icon aria-hidden="true" className="size-4 text-slate-400" />
        </div>
        <div className="mt-6">
          <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
          {change ? (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
              {changeDirection === 'neutral' ? null : (
                <ChangeIcon
                  aria-hidden="true"
                  className={cn(
                    'size-3.5',
                    changeDirection === 'up' ? 'text-success' : 'text-destructive',
                  )}
                />
              )}
              <span
                className={cn(
                  'font-semibold',
                  changeDirection === 'up' && 'text-success',
                  changeDirection === 'down' && 'text-destructive',
                  changeDirection === 'neutral' && 'text-muted-foreground',
                )}
              >
                {change}
              </span>
              {helper ? <span className="text-muted-foreground">{helper}</span> : null}
            </div>
          ) : helper ? (
            <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
