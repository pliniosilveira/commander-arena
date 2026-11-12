/**
 * Lowerings of the Niv-Mizzet deck (issue 25): "shuffle ~ and your graveyard into their owner's library".
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

/**
 * "Shuffle ~ and your graveyard into their owner's library" (CR 701.24c, 701.24d, 400.3, 108.3): the engine's `moveToZone` of the source (`this`) and of
 * `each` card of the controller's graveyard to the library, each into the library of its owner, then `shuffle` of every player whose library received
 * one: the controller, whose graveyard it was, and the owner of the source, who is another player when the controller took it from them (CR 701.24c: the
 * library is shuffled whether or not the object got there). The two are named together once (`all` names a player once). The shuffle is the owner's even if
 * the source left the battlefield first: `ownerOf` reads last-known information.
 */
const SHUFFLE_SELF_AND_GRAVEYARD_IN: Lowering<IrClause, Effects> = {
  head: 'shuffleSelfAndGraveyardIn',
  id: 'lower.shuffle-self-and-graveyard-in',
  needs: [
    'effect:moveToZone',
    'effect:shuffle',
    'selector:each',
    'selector:all',
    'selector:ownerOf',
  ],
  lower(clause, ctx) {
    const objects = arg(clause, 'objects');
    if (objects?.kind !== 'noun' || objects.det !== 'each') return failure(clause);
    // The source is on the battlefield (or on the stack) where the ability works; an ability of a card that is gone by now has nothing to move.
    if (ctx.selfGone) return failure(clause);
    const filter = lowerFilter(objects);
    if (!filter.ok) return filter;
    const effects: Effect[] = [
      { kind: 'moveToZone', objects: { kind: 'this' }, to: 'library' },
      { kind: 'moveToZone', objects: { kind: 'each', filter: filter.value }, to: 'library' },
      {
        kind: 'shuffle',
        player: { kind: 'all', of: [{ kind: 'you' }, { kind: 'ownerOf', of: { kind: 'this' } }] },
      },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};

export const NIV_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  SHUFFLE_SELF_AND_GRAVEYARD_IN,
];
