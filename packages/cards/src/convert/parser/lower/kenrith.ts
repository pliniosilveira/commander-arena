/**
 * "Until your next turn, instant, sorcery, and planeswalker spells that player casts cost {2} less to cast." (Will Kenrith; CR 601.2f, 118.7a, 611.2a, 500.1): the engine's
 * `playerSpellsCostLess`, for the player the text named (a target of the ability) and the card types of the spells; the generic mana is a number written in the text.
 */
import type { CardType, Effect, ObjectFilter } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure } from './clauses';
import { missingFeatures } from './features';
import { playerSelectorOf } from './nouns';
import type { Lowering } from './types';

const PLAYER_SPELLS_COST_LESS: Lowering<IrClause, Effects> = {
  head: 'playerSpellsCostLess',
  id: 'lower.player-spells-cost-less',
  needs: ['effect:playerSpellsCostLess', 'duration:untilYourNextTurn'],
  takesDuration: true,
  lower(clause, ctx) {
    const named = arg(clause, 'player');
    const types = arg(clause, 'spells');
    const amount = arg(clause, 'amount');
    if (
      named?.kind !== 'noun' ||
      types?.kind !== 'typeList' ||
      types.cardTypes === undefined ||
      types.cardTypes.length === 0 ||
      amount?.kind !== 'number' ||
      clause.duration?.scope !== 'untilYourNextTurn'
    ) {
      return failure(clause);
    }
    const blocked = missingFeatures(['effect:playerSpellsCostLess', 'duration:untilYourNextTurn']);
    if (blocked.length > 0) return failure(clause, blocked);
    const player = playerSelectorOf(named, ctx);
    if (!player.ok) return player;
    const cardTypes = types.cardTypes as readonly CardType[];
    const spells: ObjectFilter =
      cardTypes.length === 1
        ? { types: [...cardTypes] }
        : { anyOf: cardTypes.map((t) => ({ types: [t] })) };
    const effect: Effect = {
      kind: 'playerSpellsCostLess',
      player: player.value,
      spells,
      amount: amount.value,
      duration: 'untilYourNextTurn',
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const KENRITH_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [PLAYER_SPELLS_COST_LESS];
