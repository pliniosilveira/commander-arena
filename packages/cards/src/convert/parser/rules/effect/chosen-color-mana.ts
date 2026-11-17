/**
 * Effect rules of "Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way." (issue 258, D-583, D-584): the second sentence, which
 * names the color the sentence "Choose a color." (`effect.choose-color`) before it chose. The lowering (`lower/chosen-color-mana.ts`) reads the two sentences together.
 */
import { literal, optional, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { FOR_EACH_TAIL } from '../amount/scaled';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.player-adds-chosen-color-mana`: "target player adds three mana of the chosen color for each artifact sacrificed this way", "target player adds two mana of the chosen
 * color" (CR 106.4: mana a player adds goes into their mana pool; CR 105.1: the color was chosen by the sentence before; CR 605.1a: an ability with a target is not a mana ability,
 * so it uses the stack). A target player (the engine's `addMana` of one player, a spell or ability that uses the stack), a whole number of mana of at least one, and optionally a
 * count of "for each" (CR 608.2c). Not read: "you add" (a mana ability's own phrase, `effect.you-add-mana`), a player who is not a target, any color, the color a permanent chose as
 * it entered ("add one mana of the chosen color", `effect.add-mana`), a quantity that is not a number, another instruction after it.
 */
export const EFFECT_PLAYER_ADDS_CHOSEN_COLOR_MANA = defineRule<Clauses>({
  id: 'effect.player-adds-chosen-color-mana',
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 106.4 (Mana)',
    'CR 105.1 (Colors)',
    'CR 605.1a (Mana Abilities)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'target player adds three mana of the chosen color for each artifact sacrificed this way',
    'target player adds three mana of the chosen color',
    'target opponent adds two mana of the chosen color',
    'target player adds one mana of the chosen color for each creature you control',
  ],
  rejects: [
    'target player adds three mana of the chosen color and draws a card',
    'target player adds three mana of any color',
    'target player adds mana of the chosen color',
    'target player adds three mana of the chosen colors',
    'target player adds X mana of the chosen color',
    'target player adds zero mana of the chosen color',
    'target player adds {G}{G}{G}',
    'target creature adds three mana of the chosen color',
    'target player adds three mana of the chosen color for each',
    'you add three mana of the chosen color',
    'target player adds three mana of the chosen type',
    'add three mana of the chosen color',
  ],
  parse: single(
    'effect.player-adds-chosen-color-mana',
    sequence(
      satisfy(family<IrNoun>('noun', { only: ['noun.player'] }), (noun) => noun.det === 'target'),
      literal(' adds '),
      satisfy(
        family<IrAmount>('amount', { only: ['amount.number'] }),
        (amount) => amount.kind === 'number' && amount.value >= 1,
      ),
      literal(' mana of the chosen color'),
      optional(FOR_EACH_TAIL, null),
      pattern(/(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/u),
    ),
    ([player, , quantity, , each]) => ({
      verb: 'addManaChosenColor',
      args: { player, quantity, ...(each === null ? {} : { times: each }) },
    }),
  ),
});

export const CHOSEN_COLOR_MANA_EFFECT_RULES = [EFFECT_PLAYER_ADDS_CHOSEN_COLOR_MANA];
