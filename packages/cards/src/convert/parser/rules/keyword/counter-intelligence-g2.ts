/**
 * Keyword rules of the Counter Intelligence deck, group 2 (moving, removing, counting and choosing counters): "Equip—Pay {3} or remove a counter from ~." (Gavel of the Righteous;
 * CR 702.6a, 702.6d, 118.3).
 */
import { literal, map, optional, satisfy, sequence } from '../../combinators';
import type { IrCost, IrKeyword } from '../../ir/types';
import { defineRule, family, node } from '../registry';

/**
 * `keyword.equip-or-remove-counter`: "Equip—Pay {3} or remove a counter from ~." (CR 702.6a: "Equip [cost]" is an activated ability; CR 118.3 and 122.1: a cost of removing a counter; the player
 * pays one of the two as they activate it). The engine's `equip` with `orCost`, which it expands into two equip abilities. Not read: a restriction on the creature, another cost beside
 * mana, a count other than one counter, a kind of counter, counters from another permanent, "and" for "or", a missing "Equip—".
 */
export const KEYWORD_EQUIP_OR_REMOVE_COUNTER = defineRule<readonly IrKeyword[]>({
  id: 'keyword.equip-or-remove-counter',
  family: 'keyword',
  leading: ['equip—pay'],
  cites: ['CR 702.6a (Equip)', 'CR 702.6d (Equip)', 'CR 118.3 (Costs)', 'CR 122.1 (Counters)'],
  examples: [
    'Equip—Pay {3} or remove a counter from ~',
    'Equip—Pay {3} or remove a counter from ~.',
    'Equip—Pay {1}{W} or remove a counter from ~',
  ],
  rejects: [
    'Equip—Pay {3} or remove two counters from ~',
    'Equip—Pay {3} or remove a +1/+1 counter from ~',
    'Equip—Pay {3} and remove a counter from ~',
    'Equip—Pay {3} or remove a counter from target creature',
    'Equip—Pay {3} or remove a counter from a creature you control',
    'Equip—Pay {3} or remove X counters from ~',
    'Equip—Pay {3}',
    'Equip—Pay {3} or remove a counter from ~..',
    'Equip {3} or remove a counter from ~',
    'Equip—Pay 2 life or remove a counter from ~',
    'Equip Wizard—Pay {3} or remove a counter from ~',
  ],
  parse: map(
    node<readonly [IrCost, IrCost], IrKeyword>(
      'keyword.equip-or-remove-counter',
      map(
        sequence(
          literal('equip—pay '),
          family<IrCost>('cost', { only: ['cost.mana'] }),
          literal(' or '),
          // One counter, from the Equipment itself: no X, no other permanent.
          satisfy(
            family<IrCost>('cost', { only: ['cost.remove-any-counters'] }),
            (cost) =>
              cost.kind === 'removeAnyCounters' &&
              cost.count === 1 &&
              !cost.x &&
              cost.what === null,
          ),
          optional(literal('.'), null),
        ),
        ([, mana, , removal]): readonly [IrCost, IrCost] => [mana, removal],
      ),
      ([mana, removal]) => ({
        kind: 'keyword',
        name: 'equip',
        params: [],
        cost: [mana],
        orCost: [removal],
      }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const COUNTER_INTELLIGENCE_G2_KEYWORD_RULES = [KEYWORD_EQUIP_OR_REMOVE_COUNTER];
