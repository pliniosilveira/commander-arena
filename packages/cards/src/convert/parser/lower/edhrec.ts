/**
 * Lowerings of the Vraska EDHREC deck (stage P64, D-217): the delayed draw of the player who controlled a countered spell and the delayed mana of Mana Sculpt.
 */
import type { ManaColor } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { amountArg, arg, type Effects, failure } from './clauses';
import { objectRefOf, playerSelectorOf } from './nouns';
import type { Lowering } from './types';

/**
 * "Its controller may draw up to two cards at the beginning of the next turn's upkeep" (CR 603.7, 603.7c, 121.1): the engine's `delayedTrigger` at the upkeep of
 * the next turn, whoever's it is, whose effect is the draw of up to that many cards by the controller of the spell the ability targeted.
 */
const DELAYED_DRAW_UP_TO: Lowering<IrClause, Effects> = {
  head: 'delayedDrawUpTo',
  id: 'lower.delayed-draw-up-to',
  needs: ['effect:delayedTrigger', 'effect:draw'],
  lower(clause, ctx) {
    const who = arg(clause, 'player');
    if (who?.kind !== 'noun') return failure(clause);
    const player = playerSelectorOf(who, ctx);
    if (!player.ok) return player;
    // The player is a target's controller, said by the engine as it resolves; "you" or any other is not this reading.
    if (player.value.kind !== 'controllerOf') return failure(clause);
    const amount = amountArg(clause, 'amount', ctx);
    if (!amount.ok) return amount;
    if (
      typeof amount.value !== 'number' ||
      !Number.isSafeInteger(amount.value) ||
      amount.value < 1
    ) {
      return failure(clause);
    }
    return {
      ok: true,
      value: [
        {
          kind: 'delayedTrigger',
          at: { step: 'upkeep', whose: 'each' },
          effect: { kind: 'draw', player: player.value, count: amount.value, upTo: true },
        },
      ],
      rule: clause.rule,
    };
  },
};

/**
 * "Add an amount of {C} equal to the amount of mana spent to cast that spell at the beginning of your next main phase" (CR 603.7, 601.2h): the engine's
 * `delayedTrigger` at the controller's next main phase whose effect adds that mana, the amount read from the spell the ability targeted as it resolves.
 */
const DELAYED_MANA: Lowering<IrClause, Effects> = {
  head: 'delayedMana',
  id: 'lower.delayed-mana',
  needs: ['effect:delayedTrigger', 'effect:addMana', 'amount:manaSpent'],
  lower(clause, ctx) {
    const spec = arg(clause, 'mana');
    const spell = arg(clause, 'spell');
    if (spec?.kind !== 'manaSpec' || spell?.kind !== 'noun') return failure(clause);
    const ref = objectRefOf(spell, ctx);
    if (!ref.ok) return ref;
    if (ref.value.kind !== 'target') return failure(clause);
    // D-985: "your next main phase" is the controller's, not that of a player asked who does the instruction (`ctx.askedPlayerActs`).
    if (ctx.askedPlayerActs) return failure(clause);
    if (spec.what.kind !== 'symbols') return failure(clause);
    const mana = { kind: 'fixed' as const, mana: spec.what.symbols as ManaColor[] };
    return {
      ok: true,
      value: [
        {
          kind: 'delayedTrigger',
          at: { step: 'nextMain', whose: 'you' },
          effect: {
            kind: 'addMana',
            mana: {
              ...mana,
              times: { kind: 'manaSpent', of: { kind: 'target', id: ref.value.id } },
            },
          },
        },
      ],
      rule: clause.rule,
    };
  },
};

export const EDHREC_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  DELAYED_DRAW_UP_TO,
  DELAYED_MANA,
];
