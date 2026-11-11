/**
 * The Aura keyword (CR 702.5a): "Enchant creature" lowers to `{ kind: 'enchant', filter }`. The
 * filter is read on the battlefield relative to the Aura's controller, so it carries no zone. Equip
 * is a keyword with a cost and lowers with Cycling (abilities.ts).
 *
 * An enchant ability on a card that is not an Aura is lowered as written: the engine's
 * `validateCard` refuses it ("only an Aura has an enchant ability", CR 702.5a), and that reason is
 * what the import reports, so the face's subtype is not checked twice.
 */
import type { Ability } from '@commander-arena/engine';
import type { IrFilter, IrKeyword } from '../ir/types';
import { type FeatureRef, missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { LowerResult } from './types';

/** The same filter with no zone: an enchant filter says what, not where. */
export function withoutZone(filter: IrFilter): IrFilter {
  const { zone, ...rest } = filter;
  void zone;
  return rest;
}

export function lowerEnchant(ability: IrKeyword): LowerResult<readonly Ability[]> {
  const [what, ...more] = ability.params;
  if (what?.kind !== 'noun' || more.length > 0 || what.det !== 'a') {
    return { ok: false, needs: [], at: ability.span, rule: ability.rule };
  }
  const missing = missingFeatures(['ability:keyword', 'keyword:enchant']);
  if (missing.length > 0) {
    return { ok: false, needs: missing, at: ability.span, rule: ability.rule };
  }
  const filter = lowerFilter({ ...what, filter: withoutZone(what.filter) });
  if (!filter.ok) return filter;
  return {
    ok: true,
    value: [{ kind: 'keyword', keyword: { kind: 'enchant', filter: filter.value } }],
    rule: 'keyword.enchant',
  };
}

/** Features the attachment lowerings can name, for the dimension test. */
export const ATTACHMENT_NEEDS: readonly FeatureRef[] = ['ability:keyword', 'keyword:enchant'];
