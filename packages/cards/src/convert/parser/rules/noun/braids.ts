/**
 * Noun rules of the Meren deck, group Braids (CR 205.2a, 701.21a, 608.2d): "a permanent of their choice that shares a card type with it", the permanent an opponent may sacrifice
 * after the sacrifice of the sentence before it.
 */
import { map, pattern } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';

/**
 * `noun.a-permanent-sharing-type`: "a permanent of their choice that shares a card type with it" (CR 205.2a: a card type is a word of the type line; CR 701.21a: the player chooses
 * among the permanents they control; "it" is the permanent that was just sacrificed, as it last was on the battlefield, CR 113.7a). The engine's `sharesCardTypeWith` of
 * `sacrificed`: a permanent with ANY card type the sacrificed permanent had. Only after a sacrifice of the same text (the engine refuses it anywhere else). Not read: another
 * noun than "permanent", no "of their choice", "shares" for a type other than card type, "them", a controller.
 */
export const NOUN_A_PERMANENT_SHARING_TYPE = defineRule<IrNoun>({
  id: 'noun.a-permanent-sharing-type',
  family: 'noun',
  leading: ['a'],
  cites: [
    'CR 205.2a (Card Types)',
    'CR 701.21a (Sacrifice)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'a permanent of their choice that shares a card type with it',
    'A permanent of their choice that shares a card type with it',
  ],
  rejects: [
    'a permanent',
    'a permanent of their choice',
    'a creature of their choice that shares a card type with it',
    'a permanent of their choice that shares a creature type with it',
    'a permanent of their choice that shares a card type with them',
    'a permanent they control that shares a card type with it',
    'two permanents of their choice that share a card type with it',
    'a permanent of your choice that shares a card type with it',
  ],
  parse: node<string, IrNoun>(
    'noun.a-permanent-sharing-type',
    map(
      pattern(/a permanent of their choice that shares a card type with it(?![\p{L}\p{N}])/iu),
      (m) => m[0],
    ),
    (raw) => ({
      kind: 'noun',
      det: 'a',
      filter: { raw, sharesCardTypeWithSacrificed: true } satisfies IrFilter,
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

export const BRAIDS_NOUN_RULES = [NOUN_A_PERMANENT_SHARING_TYPE];
