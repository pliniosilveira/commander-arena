/**
 * Lowering of the Counter Blitz deck, group G (Sin, Unending Cataclysm; CR 614.12, 122.1, 122.6): "As ~ enters, remove all counters from any number of artifacts, creatures, and
 * enchantments. ~ enters with X +1/+1 counters on it, where X is twice the number of counters removed this way." The engine's `asEntersRemoveCounters` and an `entersWithCounters`
 * of `countersRemovedAsEntered`: two abilities of the face from the one line.
 */
import type { Ability, Effect, ObjectFilter } from '@commander-arena/engine';
import type { IrAbility, IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { type FeatureRef, missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { Lowering, LowerResult } from './types';

type Replacement = Extract<IrAbility, { kind: 'replacement' }>;

/** The two replacement abilities of "As ~ enters, remove all counters from any number of ...". */
export function lowerEntersRemoveCounters(ability: Replacement): LowerResult<readonly Ability[]> {
  const { event } = ability;
  const what = arg(event, 'what');
  const times = arg(event, 'times');
  if (what?.kind !== 'noun' || times?.kind !== 'number') return failure(event);
  const blocked = missingFeatures(['ability:replacement', 'replacement:asEntersRemoveCounters']);
  if (blocked.length > 0) return failure(event, blocked);
  const filter = lowerFilter(what);
  if (!filter.ok) return filter;
  // The permanents are those of the battlefield, of any player: the noun names neither a zone nor a controller.
  const { zone, controller, ...rest } = filter.value as ObjectFilter;
  if (zone !== undefined || controller !== undefined) return failure(event);
  return {
    ok: true,
    value: [
      { kind: 'replacement', replacement: { kind: 'asEntersRemoveCounters', filter: rest } },
      {
        kind: 'replacement',
        replacement: {
          kind: 'entersWithCounters',
          counter: '+1/+1',
          count: {
            kind: 'countersRemovedAsEntered',
            ...(times.value > 1 ? { times: times.value } : {}),
          },
        },
      },
    ],
    rule: ability.rule,
  };
}

/**
 * "Shuffle this card into its owner's library" (CR 701.24, 701.24c, 400.3, 108.3): the engine's `moveToZone` of the card the permanent with the ability became (`thisCard`) to its owner's
 * library, then `shuffle` of its owner: the library is shuffled whether or not the card got there (CR 701.24c). Read only in an ability of a permanent that has left the battlefield (a
 * "dies" trigger of `~`), where the card is the one object it can still be.
 */
const SHUFFLE_THIS_CARD_INTO_LIBRARY: Lowering<IrClause, Effects> = {
  head: 'shuffleThisCardIntoLibrary',
  id: 'lower.shuffle-this-card-into-library',
  needs: [
    'effect:moveToZone',
    'effect:shuffle',
    'selector:thisCard',
    'selector:ownerOf',
    'selector:this',
  ],
  lower(clause, ctx) {
    if (ctx.owner !== 'ability' || !ctx.selfGone) return failure(clause);
    const effects: Effect[] = [
      { kind: 'moveToZone', objects: { kind: 'thisCard' }, to: 'library' },
      { kind: 'shuffle', player: { kind: 'ownerOf', of: { kind: 'this' } } },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

export const COUNTER_BLITZ_G_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  SHUFFLE_THIS_CARD_INTO_LIBRARY,
];

/** Features the lowerings of this file can name, for the dimension test. */
export const COUNTER_BLITZ_G_NEEDS: readonly FeatureRef[] = [
  'ability:replacement',
  'replacement:asEntersRemoveCounters',
  'effect:moveToZone',
  'effect:shuffle',
  'selector:thisCard',
  'selector:ownerOf',
  'selector:this',
];
