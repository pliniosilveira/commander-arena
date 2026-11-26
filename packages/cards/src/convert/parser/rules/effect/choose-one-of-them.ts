/**
 * Effect rule of the Exit from Exile deck (Tectonic Giant): "Choose one of them." after "Exile the top two cards of your library." (CR 608.2d, 701.13). The controller chooses one of the cards
 * the instruction before it exiled; what "that card" names afterwards is the card chosen.
 */
import { pattern } from '../../combinators';
import { defineRule } from '../registry';
import { type Clauses, single } from './operands';

const ID = 'effect.choose-one-of-them';

/**
 * `effect.choose-one-of-them`: "Choose one of them" (CR 608.2d: the player chooses as the effect resolves). Only after an instruction that exiled cards, which the lowering requires. Not
 * read: "choose two of them", "choose one of those cards" (another wording), "an opponent chooses", a second instruction in the sentence.
 */
export const EFFECT_CHOOSE_ONE_OF_THEM = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['choose'],
  cites: ['CR 608.2d (Resolving Spells and Abilities)', 'CR 701.13 (Exile)'],
  examples: ['Choose one of them', 'choose one of them'],
  rejects: [
    'Choose two of them',
    'Choose one of those',
    'Choose one',
    'Choose one of them and draw a card',
    'An opponent chooses one of them',
    'Choose any of them',
  ],
  parse: single(ID, pattern(/choose one of them(?![\p{L}\p{N}])(?! and\b| then\b|,)/iu), () => ({
    verb: 'chooseOneOfThem',
    args: {},
  })),
});

export const CHOOSE_ONE_OF_THEM_EFFECT_RULES = [EFFECT_CHOOSE_ONE_OF_THEM];
