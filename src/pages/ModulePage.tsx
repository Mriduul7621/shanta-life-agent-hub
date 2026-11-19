import { useI18n } from '../i18n/I18nContext';
import { GROUP_TITLE_KEY, MODULES } from '../data/modules';
import type { ModuleGroup } from '../data/modules';
import { ModuleTile } from '../components/ModuleTile';
import type { DictKey } from '../i18n/dictionary';
import type { View } from '../components/Layout';

const INTRO_KEY: Partial<Record<ModuleGroup, DictKey>> = {
  leads: 'pageLeadsIntro',
  learning: 'pageLearningIntro',
  calculators: 'pageCalculatorsIntro',
  proposals: 'pageProposalsIntro',
};

const VIEW_TO_GROUP: Partial<Record<View, ModuleGroup>> = {
  leads: 'leads',
  learning: 'learning',
  calculators: 'calculators',
  proposals: 'proposals',
};

export function ModulePage({ view }: { view: View }) {
  const { t } = useI18n();
  const group = VIEW_TO_GROUP[view];
  if (!group) return null;
  const tiles = MODULES.filter((m) => m.group === group);
  const introKey = INTRO_KEY[group];

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">
          {t(GROUP_TITLE_KEY[group])}
        </h1>
        {introKey && <p className="mt-1 text-sm text-charcoal/60">{t(introKey)}</p>}
        {group === 'proposals' && (
          <p className="mt-3 rounded-xl bg-olive/10 px-4 py-3 text-sm font-medium text-charcoal">
            {t('pageProposalsNote')}
          </p>
        )}
      </section>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {tiles.map((m) => (
          <ModuleTile key={m.id} module={m} />
        ))}
      </div>
    </div>
  );
}
