/**
 * Effect rule of the Riders of Rohan deck (Champions of Minas Tirith): "that opponent may pay {X}, where X is the number of cards in their hand. If they don't, they can't attack you this
 * combat."
 */
import { literal, pattern, sequence } from '../../combinators';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const ID = 'effect.pay-hand-or-cant-attack-you';

/**
 * `effect.pay-hand-or-cant-attack-you`: "that opponent may pay {X}, where X is the number of cards in their hand. If they don't, they can't attack you this combat" (CR 118.12a, 107.3,
 * 508.1a, 511.3): the opponent the trigger is about (the player whose combat it is) is asked to pay as much as they have cards in hand; one who does not pay can't attack the controller
 * as a player until the end of combat. The engine's `unlessPays` of the trigger's player with `xIsHandSize`, and `creaturesCantAttackYou` of the creatures that player controls for this
 * combat. Only this wording: another amount, another duration, "you" or "each opponent" as the payer, and a restriction on planeswalkers are not read.
 */
export const EFFECT_PAY_HAND_OR_CANT_ATTACK_YOU = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['that'],
  cites: [
    'CR 118.12a (Costs)',
    'CR 107.3 (Mana Symbols)',
    'CR 508.1a (Declare Attackers Step)',
    'CR 511.3 (End of Combat Step)',
  ],
  examples: [
    "that opponent may pay {X}, where X is the number of cards in their hand. If they don't, they can't attack you this combat",
    'That opponent may pay {X}, where X is the number of cards in their hand. If they don’t, they can’t attack you this combat',
  ],
  rejects: [
    "that opponent may pay {X}, where X is the number of cards in their hand. If they don't, they can't attack you this turn",
    "that opponent may pay {X}, where X is the number of cards in their hand. If they don't, they can't attack you",
    "that opponent may pay {X}, where X is the number of cards in your hand. If they don't, they can't attack you this combat",
    "that opponent may pay {X}, where X is the number of cards in their hand. If you don't, they can't attack you this combat",
    "that opponent may pay {2}, where X is the number of cards in their hand. If they don't, they can't attack you this combat",
    "that opponent may pay {X}, where X is the number of cards in their graveyard. If they don't, they can't attack you this combat",
    "that opponent may pay {X}, where X is the number of cards in their hand. If they don't, creatures they control can't attack you this combat",
    "each opponent may pay {X}, where X is the number of cards in their hand. If they don't, they can't attack you this combat",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        literal('that opponent may pay {X}, where X is the number of cards in their hand. '),
        pattern(/if they don['’]t, they can['’]t attack you this combat(?![\p{L}\p{N}])/iu),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(ID, 'payHandOrCantAttackYou', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

export const PAY_HAND_OR_CANT_ATTACK_EFFECT_RULES = [EFFECT_PAY_HAND_OR_CANT_ATTACK_YOU].map(
  quietly,
);
