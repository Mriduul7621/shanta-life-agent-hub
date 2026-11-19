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
}

export const MODULES: HubModule[] = [
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
  },
  {
    id: 'sdpp',
    name: 'SDPP Projection',
    group: 'calculators',
    descKey: 'moduleSdppDesc',
    url: 'https://sdpp-value-projection.vercel.app',
    mark: 'SP',
    accent: 'olive',
  },
  {
    id: 'income',
    name: 'Income Calculator',
    group: 'calculators',
    descKey: 'moduleIncomeDesc',
    url: 'https://incomecalculator-delta.vercel.app',
    mark: 'IC',
    accent: 'orange',
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

export const GROUP_ORDER: ModuleGroup[] = ['leads', 'learning', 'calculators', 'dashboard', 'proposals'];

export const GROUP_TITLE_KEY: Record<ModuleGroup, DictKey> = {
  leads: 'groupLeads',
  learning: 'groupLearning',
  calculators: 'groupCalculators',
  dashboard: 'groupDashboard',
  proposals: 'groupProposals',
};
