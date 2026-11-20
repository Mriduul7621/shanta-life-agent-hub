import type { ReactNode } from 'react';
import { useI18n } from '../i18n/I18nContext';

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

/**
 * Loading skeleton in the WidgetCard shell: the title + icon stay,
 * the figure is a pulsing placeholder — NO fake numbers while a
 * feed loads (no placeholder figures, not even briefly).
 */
export function WidgetSkeleton({
  title,
  accent,
  icon,
}: {
  title: string;
  accent: 'orange' | 'olive' | 'charcoal';
  icon: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      aria-busy="true"
      className="relative overflow-hidden rounded-2xl border border-cream-dark bg-white p-4 shadow-sm sm:p-5"
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${ACCENT_BAR[accent]}`} />
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-charcoal/80">{title}</h3>
        <span className="shrink-0 text-charcoal/50">{icon}</span>
      </div>
      <div aria-hidden className="mt-3 h-9 w-24 animate-pulse rounded-lg bg-cream-dark/70" />
      <div aria-hidden className="mt-2 h-4 w-40 max-w-full animate-pulse rounded bg-cream-dark/50" />
    </section>
  );
}

/**
 * Feed error card in the WidgetCard shell: an honest error + a
 * retry action when a feed fails.
 */
export function FeedErrorCard({
  title,
  accent,
  icon,
  onRetry,
}: {
  title: string;
  accent: 'orange' | 'olive' | 'charcoal';
  icon: ReactNode;
  onRetry: () => void;
}) {
  const { t } = useI18n();
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
      <p className="mt-3 text-base font-medium text-charcoal/70">{t('feedLoadError')}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 min-h-10 rounded-xl bg-charcoal px-4 text-sm font-semibold text-white transition-colors hover:bg-charcoal/90"
      >
        {t('feedRetry')}
      </button>
    </section>
  );
}
