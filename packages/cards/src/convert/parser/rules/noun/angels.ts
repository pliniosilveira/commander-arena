/**
 * Noun rules of stage P33 (D-149, D-150): "that nonland permanent card" (a card an earlier instruction of the text named, CR 608.2c) and
 * "this card" (the card of the source of the ability, wherever it is, CR 400.7: the Aura that went to the graveyard as the creature it
 * enchanted died).
 */
import { pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { BOUNDARY } from './phrases';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

/**
 * `noun.that-card`: "that card", "that creature card", "that nonland permanent card" (CR 608.2c: the object an earlier instruction chose or
 * moved). The binding pass finds the antecedent, a single object of the text, and the lowering accepts it only for a target card of a
 * graveyard; the words before "card" are what the text says the card is, and are not read again.
 */
export const NOUN_THAT_CARD = defineRule<IrNoun>({
  id: 'noun.that-card',
  family: 'noun',
  leading: ['that'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 109.1 (Objects)'],
  examples: ['that card', 'that creature card', 'that nonland permanent card', 'that Angel card'],
  rejects: [
    'that',
    'that creature',
    'that cards',
    'those cards',
    'that card from your graveyard',
    'that card or that creature',
    'target card',
    'that nonland permanent',
  ],
  parse: node<RegExpExecArray, IrNoun>(
    'noun.that-card',
    pattern(new RegExp(`that (?:[\\p{L}-]+ )*card${BOUNDARY}`, 'iu')),
    (m): Bare => ({
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: m[0] },
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

/**
 * `noun.this-card`: "this card" (CR 400.7, 113.6: the card the ability belongs to; an Aura is in its owner's graveyard when "When enchanted
 * creature dies, return this card to its owner's hand" resolves). `~` and the other "this" words are the permanent, which is another noun.
 */
export const NOUN_THIS_CARD = defineRule<IrNoun>({
  id: 'noun.this-card',
  family: 'noun',
  leading: ['this'],
  cites: ['CR 400.7 (General)', 'CR 113.6 (Abilities)'],
  examples: ['this card', 'This card'],
  rejects: ['this cards', 'this', 'this creature', 'that card', 'this card from your graveyard'],
  parse: node<RegExpExecArray, IrNoun>(
    'noun.this-card',
    pattern(new RegExp(`this card${BOUNDARY}`, 'iu')),
    (m): Bare => ({
      kind: 'noun',
      det: 'thisCard',
      filter: { raw: m[0] },
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

export const ANGEL_NOUN_RULES = [NOUN_THAT_CARD, NOUN_THIS_CARD];
