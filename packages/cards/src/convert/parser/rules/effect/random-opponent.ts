/**
 * Effect rules of Vial Smasher the Fierce: "choose an opponent at random" (CR 701.13, 102.2: the seeded generator picks one opponent) and "~ deals damage equal to that spell's mana
 * value to that player or a planeswalker that player controls" (CR 120.2, 608.2d: the controller chooses where the damage goes as it resolves). The engine runs `choosePlayer` with
 * `random` and `dealDamageToChosenPlayerOrPlaneswalker`; what can be lowered is the lowering's business (`lower/random-opponent.ts`).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, quietly } from '../registry';
import { DAMAGE_AMOUNT } from './bite';
import { type Clauses, single } from './operands';

/**
 * `effect.choose-opponent-at-random`: "choose an opponent at random" (CR 701.13, 102.2, 608.2d): one opponent still in the game, picked at random; the sentences after it say "that
 * player". Not read: "choose an opponent" (the controller chooses), "choose a player at random", "choose two opponents at random", a missing "at random", any words after it.
 */
export const EFFECT_CHOOSE_OPPONENT_AT_RANDOM = defineRule<Clauses>({
  id: 'effect.choose-opponent-at-random',
  family: 'effect',
  leading: ['choose'],
  cites: [
    'CR 701.13 (Randomize)',
    'CR 102.2 (Players and Opponents)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: ['choose an opponent at random', 'Choose an opponent at random'],
  rejects: [
    'choose an opponent',
    'choose a player at random',
    'choose two opponents at random',
    'choose an opponent at random and draw a card',
    'choose an opponents at random',
    'choose opponent at random',
  ],
  parse: single(
    'effect.choose-opponent-at-random',
    pattern(new RegExp(`choose an opponent at random${BOUNDARY}`, 'iu')),
    () => ({ verb: 'chooseOpponentAtRandom', args: {} }),
  ),
});

/**
 * `effect.damage-chosen-player-or-planeswalker`: "~ deals damage equal to that spell's mana value to that player or a planeswalker that player controls" (CR 120.2, 608.2d): the
 * player an earlier "choose an opponent at random" named, or a planeswalker they control, as the controller chooses as it resolves. The amount is any amount of a damage clause ("3 damage",
 * "damage equal to ..."). Not read: another recipient ("to any target", "to that player" alone, "to target player or planeswalker"), a missing "that player controls", any words after it.
 */
export const EFFECT_DAMAGE_CHOSEN_PLAYER_OR_PLANESWALKER = defineRule<Clauses>({
  id: 'effect.damage-chosen-player-or-planeswalker',
  family: 'effect',
  leading: ['~'],
  cites: [
    'CR 120.2 (Damage)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 306.8 (Planeswalkers)',
  ],
  examples: [
    "~ deals damage equal to that spell's mana value to that player or a planeswalker that player controls",
    '~ deals 3 damage to that player or a planeswalker that player controls',
  ],
  rejects: [
    '~ deals 3 damage to that player',
    '~ deals 3 damage to target player or planeswalker',
    '~ deals 3 damage to that player or a planeswalker',
    '~ deals 3 damage to any target',
    '~ deals 3 damage to that player or a planeswalker that player controls and draw a card',
    '~ deals 3 damage to that player or a creature that player controls',
    '~ deals 3 damage to each opponent or a planeswalker that player controls',
  ],
  parse: single(
    'effect.damage-chosen-player-or-planeswalker',
    sequence(
      literal('~ deals '),
      DAMAGE_AMOUNT,
      pattern(
        new RegExp(` to that player or a planeswalker that player controls${BOUNDARY}`, 'iu'),
      ),
    ),
    ([, amount]: readonly [string, IrAmount, unknown]) => ({
      verb: 'dealDamageChosenPlayerOrPlaneswalker',
      args: { amount },
    }),
  ),
});

/** Quiet: they start like rules that read other lines ("choose ...", "~ deals ...") and must leave those where they were. */
export const RANDOM_OPPONENT_EFFECT_RULES = [quietly(EFFECT_CHOOSE_OPPONENT_AT_RANDOM)];

/** The damage rule is tried before the plain damage rule, which would stop at "that player". */
export const RANDOM_OPPONENT_DAMAGE_RULE = quietly(EFFECT_DAMAGE_CHOSEN_PLAYER_OR_PLANESWALKER);
