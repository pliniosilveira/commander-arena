/**
 * Lowering of Vial Smasher the Fierce: "choose an opponent at random" (the engine's `choosePlayer` with `random`) and "~ deals damage equal to that spell's mana value to that player or a
 * planeswalker that player controls" (`dealDamageToChosenPlayerOrPlaneswalker`).
 */
import type { Effect } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { amountArg, type Effects, failure } from './clauses';
import type { Lowering } from './types';

/** "Choose an opponent at random." (CR 701.13, 102.2): the opponent is "that player" of the sentences after it. */
const CHOOSE_OPPONENT_AT_RANDOM: Lowering<IrClause, Effects> = {
  head: 'chooseOpponentAtRandom',
  id: 'lower.choose-opponent-at-random',
  needs: ['effect:choosePlayer'],
  lower(clause, ctx) {
    ctx.choseAPlayer = true;
    const effect: Effect = { kind: 'choosePlayer', among: 'opponent', random: true };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

/** "~ deals damage equal to that spell's mana value to that player or a planeswalker that player controls." (CR 120.2, 608.2d): only after a choice of a player in the same text. */
const DAMAGE_CHOSEN_PLAYER_OR_PLANESWALKER: Lowering<IrClause, Effects> = {
  head: 'dealDamageChosenPlayerOrPlaneswalker',
  id: 'lower.damage-chosen-player-or-planeswalker',
  needs: ['effect:dealDamageToChosenPlayerOrPlaneswalker'],
  lower(clause, ctx) {
    if (!ctx.choseAPlayer) return failure(clause);
    const amount = amountArg(clause, 'amount', ctx);
    if (!amount.ok) return amount;
    const effect: Effect = {
      kind: 'dealDamageToChosenPlayerOrPlaneswalker',
      amount: amount.value,
    };
    return { ok: true, value: [effect], rule: clause.rule };
  },
};

export const RANDOM_OPPONENT_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  CHOOSE_OPPONENT_AT_RANDOM,
  DAMAGE_CHOSEN_PLAYER_OR_PLANESWALKER,
];
