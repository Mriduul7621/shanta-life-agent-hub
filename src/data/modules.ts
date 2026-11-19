/**
 * Module tiles — URLs from INVENTORY.md (verified 2026-11-20). Do not guess URLs.
 * - Proposals (official agent portal): only the UAT URL exists in the
 *   exploration report, no production URL — tile disabled, "link to confirm
 *   with IT". Never link the UAT portal from the Hub.
 */
import type { DictKey } from '../i18n/dictionary';

export type ModuleGroup = 'leads' | 'learning' | 'calculators' | 'dashboard' | 'proposals';

export interface HubModule {
  id: string;
  name: string;
  group: ModuleGroup;
  descKey: DictKey;
  url: string | null;
  /** When set, the tile renders disabled with this reason key. */
  disabledReasonKey?: DictKey;
  /** Short label shown on the tile (initials, not a logo). */
  mark: string;
  accent: 'orange' | 'olive' | 'charcoal';
  /**
   * Live icon URL — the app's own deployed icon (e.g. its /icon.svg).
   * The tile loads it live, so when the app ships a new icon at the same
   * URL the Hub tile shows it automatically on next visit. Plain <img>
   * needs no CORS, and a cross-origin SVG in <img> cannot run scripts.
   * Takes precedence over `icon`.
   */
  iconUrl?: string;
  /**
   * Local tile icon (public/icons/modules/<id>.svg), used while the app
   * has no stable live icon URL yet. Relative path (no leading slash) so
   * both file:// QA runs and root-served deployments resolve it — the Hub
   * has no nested routes. Flip to `iconUrl` when the app's live URL exists.
   */
  icon?: string;
  /**
   * True when the module has joined Hub SSO (Milestone 2): its tile links
   * to the module URL with the SSO token in the fragment
   * (src/sso/handoff.ts) instead of a plain link. Absent/false for
   * everything else — LeadFlow, Learning Hub and the Retail Sales Dashboard
   * join in a later milestone, and disabled tiles never open at all.
   */
  ssoJoined?: boolean;
}

/**
 * QA-only URL overrides: VITE_MODULE_URL_OVERRIDES is a JSON map of module
 * id → URL (e.g. {"premiumpulse":"http://127.0.0.1:PORT/stub-module.html"}).
 * `npm run qa` sets it to point a tile at a local stub module so the SSO
 * handoff can be tested without any live URL. Never set in a real build.
 */
function moduleUrlOverrides(): Record<string, string> {
  try {
    const raw = import.meta.env.VITE_MODULE_URL_OVERRIDES as string | undefined;
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.length > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

const MODULE_DEFS: HubModule[] = [
  {
    id: 'leadflow',
    name: 'LeadFlow',
    group: 'leads',
    descKey: 'moduleLeadsDesc',
    url: 'https://lead-flow-jet.vercel.app',
    mark: 'LF',
    accent: 'orange',
    // Local copy until LeadFlow ships its icon (branding handoff pending);
    // flip to its live /icon.svg then.
    icon: 'icons/modules/leadflow.svg',
  },
  {
    id: 'learning-hub',
    name: 'Learning Hub',
    group: 'learning',
    descKey: 'moduleLearningDesc',
    url: 'https://shanta-life-learning-hub.vercel.app',
    mark: 'LH',
    accent: 'olive',
    // Local copy of the Hub's own icon (public/assets/img/hub-icon.svg in
    // its repo); flip to the live URL
    // https://shanta-life-learning-hub.vercel.app/assets/img/hub-icon.svg
    // if a stable live reference is wanted later.
    icon: 'icons/modules/learning-hub.svg',
  },
  {
    id: 'premiumpulse',
    name: 'PremiumPulse',
    group: 'calculators',
    descKey: 'modulePremiumDesc',
    url: 'https://premium-illustrator.vercel.app',
    mark: 'PP',
    accent: 'orange',
    ssoJoined: true,
    iconUrl: 'https://premium-illustrator.vercel.app/icon.svg',
  },
  {
    id: 'sdpp',
    name: 'SDPP Projection',
    group: 'calculators',
    descKey: 'moduleSdppDesc',
    url: 'https://sdpp-value-projection.vercel.app',
    mark: 'SP',
    accent: 'olive',
    ssoJoined: true,
    iconUrl: 'https://sdpp-value-projection.vercel.app/icon.svg',
  },
  {
    id: 'income',
    name: 'Income Calculator',
    group: 'calculators',
    descKey: 'moduleIncomeDesc',
    url: 'https://incomecalculator-delta.vercel.app',
    mark: 'IC',
    accent: 'orange',
    ssoJoined: true,
    iconUrl: 'https://incomecalculator-delta.vercel.app/icon.svg',
  },
  {
    id: 'retail-dashboard',
    name: 'Retail Sales Dashboard',
    group: 'dashboard',
    descKey: 'moduleDashboardDesc',
    url: 'https://retail-dashboard-zeta.vercel.app',
    mark: 'RD',
    accent: 'olive',
    // Local family-style icon (olive tile, chart motif): the app has no SVG
    // icon of its own — only Shanta logo PNGs. Flip to a live URL if the app
    // ships an /icon.svg later.
    icon: 'icons/modules/retail-dashboard.svg',
  },
  {
    id: 'proposals',
    name: 'Proposals',
    group: 'proposals',
    descKey: 'moduleProposalsDesc',
    url: null,
    disabledReasonKey: 'proposalsSoon',
    mark: 'PR',
    accent: 'charcoal',
  },
];

const URL_OVERRIDES = moduleUrlOverrides();

/** Module tiles, with any QA-only URL overrides applied. */
export const MODULES: HubModule[] = MODULE_DEFS.map((m) =>
  URL_OVERRIDES[m.id] ? { ...m, url: URL_OVERRIDES[m.id] } : m,
);

export const GROUP_ORDER: ModuleGroup[] = ['leads', 'learning', 'calculators', 'dashboard', 'proposals'];

export const GROUP_TITLE_KEY: Record<ModuleGroup, DictKey> = {
  leads: 'groupLeads',
  learning: 'groupLearning',
  calculators: 'groupCalculators',
  dashboard: 'groupDashboard',
  proposals: 'groupProposals',
};
