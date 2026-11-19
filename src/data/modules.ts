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
   * True when the module has joined Hub SSO (Milestone 2): its tile opens
   * via the postMessage handoff in src/sso/handoff.ts instead of a plain
   * link. Absent/false for everything else — LeadFlow, Learning Hub and
   * the Sales Command Center join in a later milestone, and disabled tiles
   * never open at all.
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
  },
  {
    id: 'learning-hub',
    name: 'Learning Hub',
    group: 'learning',
    descKey: 'moduleLearningDesc',
    url: 'https://shanta-life-learning-hub.vercel.app',
    mark: 'LH',
    accent: 'olive',
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
  },
  {
    id: 'sales-command-center',
    name: 'Sales Command Center',
    group: 'dashboard',
    descKey: 'moduleDashboardDesc',
    url: 'https://training-dashboard-shanta-life.vercel.app',
    mark: 'SC',
    accent: 'olive',
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
