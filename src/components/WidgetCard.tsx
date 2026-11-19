import type { ReactNode } from 'react';

interface WidgetCardProps {
  title: string;
  /** Main figure, e.g. "3" or "৳1,85,000". Null renders the empty state. */
  value: string | null;
  sub: string;
  /** Plain-language empty state — the "never empty" rule: a zero says so. */
  emptyText: string;
  accent: 'orange' | 'olive' | 'charcoal';
  icon: ReactNode;
}

const ACCENT_BAR: Record<WidgetCardProps['accent'], string> = {
  orange: 'bg-sunset',
  olive: 'bg-olive',
  charcoal: 'bg-charcoal',
};

export function WidgetCard({ title, value, sub, emptyText, accent, icon }: WidgetCardProps) {
  const isEmpty = value === null;
  return (
    <section
      aria-label={title}
      className="relative overflow-hidden rounded-2xl border border-cream-dark bg-white p-4 shadow-sm sm:p-5"
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${ACCENT_BAR[accent]}`} />
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-charcoal/80">{title}</h3>
        <span className="shrink-0 text-charcoal/50">{icon}</span>
      </div>
      {isEmpty ? (
        <p className="mt-3 text-base font-medium text-charcoal/70">{emptyText}</p>
      ) : (
        <>
          <p className="mt-2 text-3xl font-bold tracking-tight text-charcoal">{value}</p>
          <p className="mt-1 text-sm text-charcoal/60">{sub}</p>
        </>
      )}
    </section>
  );
}
