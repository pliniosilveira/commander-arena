/**
 * Lowerings of group 8 of the Ahoy Mateys deck (graveyard and library effects): the escape an effect gives to the cards of a graveyard until end of turn.
 */
import type { Cost, ObjectFilter } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure, operand } from './clauses';
import { lowerCost } from './costs';
import { missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

/**
 * "Until end of turn, each creature card in your graveyard gains "Escape-{3}{B}, Exile four other cards from your graveyard."" (CR 702.138a, 611.2a, 611.2c): the engine's `gainEscape`, the
 * cards fixed as the effect resolves. The cost is mana only; the cards that `what` describes are named by what they are (no zone, controller or owner: they are the cards of the graveyard).
 */
const GAIN_ESCAPE: Lowering<IrClause, Effects> = {
  head: 'gainEscape',
  id: 'lower.gain-escape',
  needs: ['effect:gainEscape', 'duration:untilEndOfTurn'],
  takesDuration: true,
  lower(clause) {
    const cards = operand(clause, 'cards');
    const costs = arg(clause, 'cost');
    const exile = arg(clause, 'exile');
    if (
      cards?.kind !== 'noun' ||
      costs?.kind !== 'costList' ||
      exile?.kind !== 'number' ||
      clause.duration?.scope !== 'untilEndOfTurn'
    ) {
      return failure(clause);
    }
    const blocked = missingFeatures(['effect:gainEscape']);
    if (blocked.length > 0) return failure(clause, blocked);
    const filter = lowerFilter(cards);
    if (!filter.ok) return filter;
    const { zone, controller, owner, ...what } = filter.value as ObjectFilter;
    void zone;
    void controller;
    void owner;
    const lowered: Cost[] = [];
    for (const c of costs.costs) {
      const one = lowerCost(c);
      if (!one.ok) return one;
      lowered.push(one.value);
    }
    return {
      ok: true,
      value: [
        {
          kind: 'gainEscape',
          what,
          cost: lowered,
          exile: exile.value,
          duration: 'untilEndOfTurn',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const AHOY_G8_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [GAIN_ESCAPE];
