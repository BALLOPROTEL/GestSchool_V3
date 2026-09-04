import { cn } from '@gestschool/ui';

type MiniChartProperties = {
  ariaLabel: string;
  className?: string;
  labels: readonly string[];
  primary: readonly number[];
  secondary?: readonly number[];
};

function points(values: readonly number[]): string {
  const maximum = Math.max(...values);
  const minimum = Math.min(...values);
  const range = Math.max(maximum - minimum, 1);
  const denominator = Math.max(values.length - 1, 1);
  return values
    .map(
      (value, index) => `${(index / denominator) * 100},${92 - ((value - minimum) / range) * 76}`,
    )
    .join(' ');
}

export function MiniChart({
  ariaLabel,
  className,
  labels,
  primary,
  secondary,
}: MiniChartProperties) {
  return (
    <figure className={cn('w-full', className)}>
      <svg
        aria-label={ariaLabel}
        className="h-56 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        viewBox="0 0 100 100"
      >
        {[16, 35, 54, 73, 92].map((y) => (
          <line
            className="stroke-border"
            key={y}
            strokeDasharray="2 2"
            strokeWidth="0.35"
            x1="0"
            x2="100"
            y1={y}
            y2={y}
          />
        ))}
        {secondary ? (
          <polyline
            className="fill-none stroke-slate-400"
            points={points(secondary)}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.3"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        <polyline
          className="fill-none stroke-primary"
          points={points(primary)}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="mt-2 grid grid-flow-col justify-between gap-2 text-[11px] text-muted-foreground">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </figcaption>
    </figure>
  );
}
