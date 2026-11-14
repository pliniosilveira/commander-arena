/**
 * Noun rules of group 8 of the Hashaton deck (issue 31, D-362): "the chosen cards" (Victimize: "Choose two target creature cards in your graveyard. Sacrifice a creature.
 * If you do, return the chosen cards to the battlefield tapped").
 */
import { pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { BOUNDARY } from './phrases';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

/**
 * `noun.the-chosen-cards`: "the chosen cards", "the chosen creature cards" (CR 608.2c: the cards an earlier instruction of the text chose, CR 601.2c: as targets). The binding
 * pass finds the antecedent, the most recent plural noun of the text, as it does for "those cards", and the lowering accepts it only for target cards of a graveyard.
 * Only the plural: "the chosen card" is another sentence.
 */
export const NOUN_THE_CHOSEN_CARDS = defineRule<IrNoun>({
  id: 'noun.the-chosen-cards',
  family: 'noun',
  leading: ['the'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 601.2c (Casting Spells)'],
  examples: ['the chosen cards', 'the chosen creature cards', 'The chosen cards'],
  rejects: [
    'the chosen card',
    'the chosen',
    'the chosen creatures',
    'chosen cards',
    'those cards',
    'the chosen cards from your graveyard',
  ],
  parse: node<RegExpExecArray, IrNoun>(
    'noun.the-chosen-cards',
    pattern(new RegExp(`the chosen (?:[\\p{L}-]+ )?cards${BOUNDARY}`, 'iu')),
    (m): Bare => ({
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: m[0] },
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

export const HASHATON_G8_NOUN_RULES = [NOUN_THE_CHOSEN_CARDS];
