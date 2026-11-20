/**
 * Shared display formatting for money figures.
 *
 * formatBdt lived in the old demo data module (src/data/demoData.ts);
 * the demo data was removed entirely (Mahadi 2026-11-20), and the
 * formatter moved here because the Dashboard, Home and the Due
 * widget all still format live taka figures with it.
 */
export function formatBdt(amount: number): string {
  // Whole taka — live sheet values can carry decimals (e.g. lifetime
  // premium), and the Hub displays rounded figures.
  return `৳${Math.round(amount).toLocaleString('en-IN')}`;
}
