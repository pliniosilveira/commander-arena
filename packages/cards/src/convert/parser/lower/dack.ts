/**
 * Lowerings of the Multiverse Reforged deck (issue 81, Dack Fayden): a creature for each opponent, goaded for good and given away. Same contract as effects.ts: each declares the engine
 * features it needs and is checked before it runs. "Those creature cards", "they" and "those permanents" are the engine's `moved`, the permanents the reveal put onto the battlefield.
 */
import type { IrClause } from '../ir/types';
import { amountArg, type Effects, failure } from './clauses';
import type { Lowering } from './types';

/** "Reveal cards ... until you reveal X creature cards, where X is the number of opponents you have. Put those creature cards onto the battlefield, then shuffle." (CR 701.20, 701.24). */
const REVEAL_UNTIL_OPPONENTS: Lowering<IrClause, Effects> = {
  head: 'revealUntilOpponents',
  id: 'lower.reveal-until-opponents',
  needs: [
    'effect:revealUntil',
    'ability:revealUntilCount',
    'effect:shuffle',
    'amount:opponentCount',
  ],
  lower(clause, ctx) {
    const count = amountArg(clause, 'count', ctx);
    if (!count.ok) return count;
    return {
      ok: true,
      value: [
        {
          kind: 'revealUntil',
          filter: { types: ['creature'], card: true },
          count: count.value,
          put: 'battlefield',
          rest: 'stay',
        },
        { kind: 'shuffle', player: { kind: 'you' } },
      ],
      rule: clause.rule,
    };
  },
};

/** "They're goaded for the rest of the game." (CR 701.15a): after the reveal, the permanents it put onto the battlefield. */
const GOAD_MOVED_FOREVER: Lowering<IrClause, Effects> = {
  head: 'goadMovedForever',
  id: 'lower.goad-moved-forever',
  needs: ['effect:goad', 'selector:moved'],
  lower(clause, ctx) {
    if (ctx.lastEffectKind !== 'shuffle') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'goad', objects: { kind: 'moved' }, forTheRestOfTheGame: true }],
      rule: clause.rule,
    };
  },
};

/** "For each of those permanents, choose a different opponent. Each opponent gains control of the permanent for which they were chosen." (CR 613.1b, 101.4). */
const ASSIGN_CONTROL_TO_OPPONENTS: Lowering<IrClause, Effects> = {
  head: 'assignControlToOpponents',
  id: 'lower.assign-control-to-opponents',
  needs: ['effect:assignControlToOpponents', 'selector:moved'],
  lower(clause, ctx) {
    if (ctx.lastEffectKind !== 'goad') return failure(clause);
    return {
      ok: true,
      value: [{ kind: 'assignControlToOpponents', objects: { kind: 'moved' } }],
      rule: clause.rule,
    };
  },
};

export const DACK_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  REVEAL_UNTIL_OPPONENTS,
  GOAD_MOVED_FOREVER,
  ASSIGN_CONTROL_TO_OPPONENTS,
];
