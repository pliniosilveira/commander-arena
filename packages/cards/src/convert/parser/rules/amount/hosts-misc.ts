/**
 * The amounts of the Hosts of Mordor deck: "equal to the damage dealt to target opponent this turn" (CR 120.3).
 */
import { literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { defineRule, family } from '../registry';

/**
 * `amount.damage-dealt-to-player-this-turn`: "equal to the damage dealt to target opponent this turn", "equal to the damage dealt to that player this turn" (Knollspine
 * Dragon, CR 120.3, 608.2c): all the damage every source has dealt to the player so far this turn, the engine's `damageDealtToThisTurn`. The player is a target player or
 * opponent, or the player the text named before ("that player"). Not read: "this way", a missing "this turn", "the damage dealt to it", a creature or a plural, "combat damage",
 * "the amount of damage".
 */
export const AMOUNT_DAMAGE_DEALT_TO_PLAYER_THIS_TURN = defineRule<IrAmount>({
  id: 'amount.damage-dealt-to-player-this-turn',
  family: 'amount',
  leading: ['equal'],
  cites: ['CR 120.3 (Damage)', 'CR 608.2c (Resolving Spells and Abilities)', 'CR 102.1 (Players)'],
  examples: [
    'equal to the damage dealt to target opponent this turn',
    'equal to the damage dealt to that player this turn',
    'equal to the damage dealt to target player this turn',
  ],
  rejects: [
    'equal to the damage dealt to target opponent',
    'equal to the damage dealt to target opponent this way',
    'equal to the damage dealt to target creature this turn',
    'equal to the damage dealt to target opponents this turn',
    'equal to the damage dealt to it this turn',
    'equal to the combat damage dealt to target opponent this turn',
    'equal to damage dealt to target opponent this turn',
    'equal to the damage dealt this turn',
    'the damage dealt to target opponent this turn',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('equal to the damage dealt to '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.player', 'noun.that-player'] }),
        (noun) =>
          noun.det === 'anaphor' || (noun.det === 'target' && noun.filter.player !== undefined),
      ),
      pattern(/ this turn(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, of] = r.value;
    return {
      ok: true,
      value: { kind: 'damageDealtToThisTurn', of, span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

/**
 * `amount.damage-dealt-to-this-by-their-sources`: "equal to the amount of damage dealt to ~ this turn by sources they controlled" (Grothama, All-Devouring, CR 120.3, 608.2h): the
 * damage the permanent of the ability was dealt this turn by sources the player in question controlled as they dealt it, the engine's `damageToThisThisTurn`. It is read for each
 * player of an "each player" instruction. Not read: another permanent, "you controlled", a missing "this turn", "combat damage".
 */
export const AMOUNT_DAMAGE_TO_THIS_BY_THEIR_SOURCES = defineRule<IrAmount>({
  id: 'amount.damage-dealt-to-this-by-their-sources',
  family: 'amount',
  leading: ['equal'],
  cites: ['CR 120.3 (Damage)', 'CR 608.2h (Resolving Spells and Abilities)'],
  examples: [
    'equal to the amount of damage dealt to ~ this turn by sources they controlled',
    'equal to the amount of damage dealt to ~ this turn by sources they control',
  ],
  rejects: [
    'equal to the amount of damage dealt to target creature this turn by sources they controlled',
    'equal to the amount of damage dealt to ~ this turn by sources you controlled',
    'equal to the amount of damage dealt to ~ by sources they controlled',
    'equal to the amount of combat damage dealt to ~ this turn by sources they controlled',
    'equal to the damage dealt to ~ this turn',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /equal to the amount of damage dealt to ~ this turn by sources they (?:controlled|control)(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'damageToThisThisTurn', span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

export const HOSTS_MISC_AMOUNT_RULES = [
  AMOUNT_DAMAGE_DEALT_TO_PLAYER_THIS_TURN,
  AMOUNT_DAMAGE_TO_THIS_BY_THEIR_SOURCES,
];
