/**
 * Lowering of the Federation Fleet deck (group B), Ambassador K'Ehleyr: "each player reveals the top card of their library, then draws a card. For each nonland card revealed this way, put a
 * +1/+1 counter on ~." (CR 701.20a, 121.1, 608.2c, 122.1).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { missingFeatures } from './features';
import { lowerFilter } from './nouns';
import type { Lowering } from './types';

/**
 * The engine's `revealTopBranches` of every player, one branch for the kind of card, whose `onMatch` puts a +1/+1 counter on the permanent (it runs once for each player whose card is of the
 * kind, as that player), and then a `draw` of one card for every player. The cards are all revealed before any is drawn: the card a player reveals stays on top of their library, and is the
 * one they draw (CR 701.20a).
 */
export const EACH_PLAYER_REVEALS_THEN_DRAWS: Lowering<IrClause, Effects> = {
  head: 'eachPlayerRevealsThenDraws',
  id: 'lower.each-player-reveals-then-draws',
  needs: ['effect:revealTopBranches', 'effect:draw', 'effect:addCounters', 'selector:eachPlayer'],
  lower(clause) {
    const what = arg(clause, 'what');
    if (what?.kind !== 'noun') return failure(clause);
    const filter = lowerFilter(what);
    if (!filter.ok) return filter;
    const blocked = missingFeatures(['selector:this']);
    if (blocked.length > 0) return failure(clause, blocked);
    const everyone = { kind: 'eachPlayer' } as const;
    const effects: Effect[] = [
      {
        kind: 'revealTopBranches',
        player: everyone,
        branches: [
          {
            ifMatches: filter.value,
            onMatch: {
              kind: 'addCounters',
              objects: { kind: 'this' },
              counter: '+1/+1',
              count: 1,
            },
          },
        ],
      },
      { kind: 'draw', player: everyone, count: 1 },
    ];
    return { ok: true, value: effects, rule: clause.rule };
  },
};
