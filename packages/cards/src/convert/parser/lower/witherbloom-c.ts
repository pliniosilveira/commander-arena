/**
 * Lowerings of group C of the Witherbloom Witchcraft deck (issue 190): the instructions the grammar reads for it that no other file lowers.
 */
import type { CardType, Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

/** The six permanent types, in the order CR 110.4 gives them. */
const PERMANENT_TYPES: readonly CardType[] = [
  'artifact',
  'battle',
  'creature',
  'enchantment',
  'land',
  'planeswalker',
];

/**
 * "For each permanent type, return up to one card of that type from your graveyard to the battlefield" (CR 608.2d, 110.2a): for each permanent type, the controller chooses none or
 * one card of that type among their graveyard and it is put onto the battlefield under their control. The choices are made one type after the other; a card that is two types and was
 * returned for the first is no longer there for the second.
 */
const RETURN_ONE_PER_PERMANENT_TYPE: Lowering<IrClause, Effects> = {
  head: 'returnOnePerPermanentType',
  id: 'lower.return-one-per-permanent-type',
  needs: ['effect:moveToZone', 'selector:choose'],
  lower: (clause) => ({
    ok: true,
    value: PERMANENT_TYPES.map(
      (type): Effect => ({
        kind: 'moveToZone',
        objects: {
          kind: 'choose',
          filter: { zone: 'graveyard', types: [type], controller: 'you' },
          optional: true,
        },
        to: 'battlefield',
      }),
    ),
    rule: clause.rule,
  }),
};

export const WITHERBLOOM_C_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  RETURN_ONE_PER_PERMANENT_TYPE,
];
