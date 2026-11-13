/**
 * Effect rules of group 8 of the Hashaton deck (issue 31, D-362): "Choose two target creature cards in your graveyard." (Victimize: the first of three sentences, which
 * only choose the targets of the spell; "Sacrifice a creature." and "If you do, return the chosen cards to the battlefield tapped." are read by `effect.sacrifice`, the
 * condition `condition.if-you-do` and `effect.return`).
 */
import { literal, sequence } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, operands, single } from './operands';

const ID = 'effect.choose-graveyard-cards';

/**
 * `effect.choose-graveyard-cards`: "choose two target creature cards in your graveyard" (CR 115.1, 601.2c: the targets are chosen as the spell is cast; the words only name
 * them for the sentences after, which say "the chosen cards"). The engine's targets of the spell, with no effect of its own (as `effect.choose-target`). Cards of your own
 * graveyard, said with "in" (`noun.target-cards-in-your-graveyard`). Not read: "choose" without a target, cards of another graveyard, "up to" a number of them,
 * "choose one", the cards and another instruction in the same sentence.
 */
export const EFFECT_CHOOSE_GRAVEYARD_CARDS = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['choose'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'choose two target creature cards in your graveyard',
    'choose target creature card in your graveyard',
    'choose three target land cards in your graveyard',
    'Choose two target creature cards in your graveyard',
  ],
  rejects: [
    'choose',
    'choose two creature cards in your graveyard',
    'choose two target creature cards from your graveyard',
    'choose two target creature cards in a graveyard',
    "choose two target creature cards in an opponent's graveyard",
    'choose up to two target creature cards in your graveyard',
    'choose two target creatures',
    'choose one',
    'choose two target creature cards in your graveyard and draw a card',
    'choose all creature cards in your graveyard',
  ],
  parse: single(
    ID,
    sequence(
      literal('choose '),
      operands(['noun.target-cards-in-your-graveyard'], ID, {
        accept: (noun) => noun.det === 'target' && !noun.upTo && noun.minTargets === undefined,
        locate: (noun) => noun.span.start,
      }),
    ),
    ([, what]) => ({ verb: 'chooseTarget', args: { what } }),
  ),
});

export const HASHATON_G8_EFFECT_RULES = [EFFECT_CHOOSE_GRAVEYARD_CARDS];
