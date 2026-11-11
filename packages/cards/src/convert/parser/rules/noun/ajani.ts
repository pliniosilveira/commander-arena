/**
 * Noun rules of the Ajani, Strength of the Pride card (stage P70, D-913): "each artifact and creature your opponents control" (CR 110.1, 205.2a).
 */
import { literal, map, optional, sequence } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { CONTROL_SUFFIX, NO_PARTS, PERMANENT_TYPES, toFilter, typeChoice } from './phrases';

/**
 * `noun.each-type-union`: "each artifact and creature your opponents control", "each artifact, creature, and enchantment you control": every permanent that
 * has any one of the card types named, each once (an artifact creature is one permanent, not two).
 * The words after the types say who controls them and apply to all of them. Not read here: "or" (`noun.each-permanent` reads that, with the same meaning), "other", a type named twice or one that is not a
 * card type of a permanent, a modifier before a type word, the plural and "each of".
 */
export const NOUN_EACH_TYPE_UNION = defineRule<IrNoun>({
  id: 'noun.each-type-union',
  family: 'noun',
  leading: ['each'],
  cites: ['CR 110.1 (Permanents)', 'CR 205.2a (Card Types)'],
  examples: [
    'each artifact and creature your opponents control',
    'each artifact and creature an opponent controls',
    'each artifact and creature you control',
    'each artifact and creature',
    'each artifact, creature, and enchantment you control',
  ],
  rejects: [
    'each artifact or creature your opponents control',
    'each artifact and artifact',
    'each artifact and creatures',
    'each artifacts and creatures',
    'each other artifact and creature',
    'each artifact and Goblin',
    'each tapped artifact and creature',
    'each artifact, creature and enchantment',
    'each artifact, creature, enchantment',
    'each artifact and',
    'each artifact',
    'all artifact and creature',
    'each artifact and creature of your opponents',
  ],
  parse: node<IrFilter, IrNoun>(
    'noun.each-type-union',
    map(
      sequence(
        literal('each '),
        typeChoice(PERMANENT_TYPES, false, 'and'),
        optional(CONTROL_SUFFIX, undefined),
      ),
      ([, types, controller]) => ({
        ...toFilter('battlefield', { ...NO_PARTS, controller }, ''),
        anyOf: types.map((t): IrFilter => ({ types: [t], raw: t })),
      }),
    ),
    (filter) => ({
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

export const AJANI_NOUN_RULES = [NOUN_EACH_TYPE_UNION];
