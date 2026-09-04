import { cn } from '@gestschool/ui';

export function ProgressBar({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: number;
}) {
  const boundedValue = Math.max(0, Math.min(value, 100));
  return (
    <div
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={boundedValue}
      aria-label={label}
      className={cn('h-1.5 overflow-hidden rounded-full bg-secondary', className)}
      role="progressbar"
    >
      <div
        className={cn('h-full rounded-full bg-primary', boundedValue === 100 && 'bg-warning')}
        style={{ width: `${boundedValue}%` }}
      />
    </div>
  );
}
