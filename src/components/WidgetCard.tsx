import { useI18n } from '../i18n/I18nContext';

interface WidgetCardProps {
  title: string;
  /** Main figure, e.g. "3" or "৳1,85,000". Null renders the empty state. */
  value: string | null;
  sub: string;
  /** Plain-language empty state — the "never empty" rule: a zero says so. */
  emptyText: string;
  accent: 'orange' | 'olive' | 'charcoal';
}

const ACCENT_BAR: Record<WidgetCardProps['accent'], string> = {
  orange: 'bg-sunset',
  olive: 'bg-olive',
  charcoal: 'bg-charcoal',
};

/**
 * Widget card (board-exact, hb04): no icon — the board's cards show
 * title, figure and sub only. Tightened for the 2-column phone grid:
 * smaller padding and a smaller figure on phones (text-2xl, back to
 * text-3xl from sm up); the figure wraps instead of clipping on a
 * long org-wide amount (break-words is a last resort — a figure
 * that fits stays on one line).
 */
export function WidgetCard({ title, value, sub, emptyText, accent }: WidgetCardProps) {
  const isEmpty = value === null;
  return (
    <section
      aria-label={title}
      className="relative overflow-hidden rounded-2xl border border-cream-dark bg-white p-3 shadow-sm sm:p-5"
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${ACCENT_BAR[accent]}`} />
      <h3 className="text-sm font-semibold leading-snug text-charcoal/80">{title}</h3>
      {isEmpty ? (
        <p className="mt-3 text-base font-medium text-charcoal/70">{emptyText}</p>
      ) : (
        <>
          <p className="mt-2 break-words text-2xl font-bold leading-tight tracking-tight text-charcoal sm:text-3xl">
            {value}
          </p>
          <p className="mt-1 text-sm text-charcoal/60">{sub}</p>
        </>
      )}
    </section>
  );
}

/**
 * Loading skeleton in the WidgetCard shell: the title stays,
 * the figure is a pulsing placeholder — NO fake numbers while a
 * feed loads (no placeholder figures, not even briefly).
 */
export function WidgetSkeleton({
  title,
  accent,
}: {
  title: string;
  accent: 'orange' | 'olive' | 'charcoal';
}) {
  return (
    <section
      aria-label={title}
      aria-busy="true"
      className="relative overflow-hidden rounded-2xl border border-cream-dark bg-white p-3 shadow-sm sm:p-5"
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${ACCENT_BAR[accent]}`} />
      <h3 className="text-sm font-semibold leading-snug text-charcoal/80">{title}</h3>
      <div aria-hidden className="mt-3 h-8 w-24 animate-pulse rounded-lg bg-cream-dark/70" />
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
  onRetry,
}: {
  title: string;
  accent: 'orange' | 'olive' | 'charcoal';
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <section
      aria-label={title}
      className="relative overflow-hidden rounded-2xl border border-cream-dark bg-white p-3 shadow-sm sm:p-5"
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${ACCENT_BAR[accent]}`} />
      <h3 className="text-sm font-semibold leading-snug text-charcoal/80">{title}</h3>
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
