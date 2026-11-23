/**
 * Lowerings of Kefka, Dancing Mad (deck support issue 97): the exile of one card at random from each opponent's graveyard, and the life each owner of a spell cast this way loses.
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { type Effects, failure } from './clauses';
import type { Lowering } from './types';

/** "Exile a card at random from each opponent's graveyard": one pick for each opponent, owners in APNAP order. */
const EXILE_AT_RANDOM_EACH_OPPONENT: Lowering<IrClause, Effects> = {
  head: 'exileAtRandomEachOpponent',
  id: 'lower.exile-at-random-each-opponent',
  needs: ['effect:exile'],
  lower(clause) {
    const effect: Effect = {
      kind: 'exile',
      objects: {
        kind: 'each',
        filter: { zone: 'graveyard', owner: { kind: 'eachOpponent' } },
      },
      atRandom: true,
      perOwner: true,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "Each player who owns a spell you cast this way loses life equal to its mana value": only right after a cast that remembers its spells. */
const OWNERS_LOSE_LIFE_CAST_SPELLS: Lowering<IrClause, Effects> = {
  head: 'ownersLoseLifeCastSpells',
  id: 'lower.owners-lose-life-cast-spells',
  needs: ['effect:loseLifeManaValue', 'selector:moved'],
  lower(clause, ctx) {
    if (!ctx.lastCastRemembered) return failure(clause);
    const effect: Effect = { kind: 'loseLifeManaValue', spells: { kind: 'moved' } };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const KEFKA_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EXILE_AT_RANDOM_EACH_OPPONENT,
  OWNERS_LOSE_LIFE_CAST_SPELLS,
];
