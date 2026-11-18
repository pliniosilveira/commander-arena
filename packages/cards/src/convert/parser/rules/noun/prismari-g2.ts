/**
 * Noun rules of group 2 of the Prismari deck (issue 87, D-642, D-643): "creatures named ~" (CR 201.2: the objects that have the name of the card the text is on, whoever controls
 * them) and "any number of targets" (CR 115.1, 601.2d: any target, from none to as many as the damage can be divided among).
 */
import { map, pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { BOUNDARY } from './phrases';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

/**
 * `noun.creatures-named-self`: "creatures named ~" (CR 201.2: a name is a characteristic, and the name of a creature is the one its card, token or copy has now). Every creature on the
 * battlefield with the card's own name, whoever controls it, as the effect that names them begins (CR 611.2c). The tilde is the card's name (normalization writes it). Not read: another
 * name, a controller ("you control"), the singular, a creature type or a color before or after it.
 */
export const NOUN_CREATURES_NAMED_SELF = defineRule<IrNoun>({
  id: 'noun.creatures-named-self',
  family: 'noun',
  leading: ['creatures'],
  cites: ['CR 201.2 (Name)', 'CR 611.2c (Continuous Effects)'],
  examples: ['creatures named ~', 'Creatures named ~'],
  rejects: [
    'creature named ~',
    'creatures named Bob',
    'creatures named ~ you control',
    'creatures named',
    'creatures named ~s',
    'creatures not named ~',
    'artifact creatures named ~',
    'other creatures named ~',
    'permanents named ~',
    'creatures that are named ~',
  ],
  parse: node<string, IrNoun>(
    'noun.creatures-named-self',
    map(pattern(new RegExp(`creatures named ~${BOUNDARY}`, 'iu')), (m) => m[0]),
    (raw): Bare => ({
      kind: 'noun',
      det: 'each',
      filter: { types: ['creature'], namedSelf: true, raw },
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

/**
 * `noun.any-number-of-targets`: "any number of targets" (CR 115.1, 115.4, 601.2d: any target is a creature, a player, a planeswalker or a battle; no fewest and no most, which only a
 * divided damage reads, `effect.damage-divided`, as it needs a total to share). Not read: "any number of target" with a kind, the singular, a controller.
 */
export const NOUN_ANY_NUMBER_OF_TARGETS = defineRule<IrNoun>({
  id: 'noun.any-number-of-targets',
  family: 'noun',
  leading: ['any'],
  cites: ['CR 115.1 (Targets)', 'CR 115.4 (Targets)', 'CR 601.2d (Casting Spells)'],
  examples: ['any number of targets'],
  rejects: [
    'any number of target',
    'any number of target creatures',
    'any number of other targets',
    'any number of targets you control',
    'any number of',
    'any target',
    'any numbers of targets',
    'any number of targets.',
  ],
  parse: node<string, IrNoun>(
    'noun.any-number-of-targets',
    map(pattern(new RegExp(`any number of targets${BOUNDARY}`, 'iu')), (m) => m[0]),
    (raw): Bare => ({
      kind: 'noun',
      det: 'target',
      filter: { anyTarget: true, raw },
      upTo: false,
      plural: true,
      other: false,
      anyNumber: true,
    }),
  ),
});

export const PRISMARI_G2_NOUN_RULES = [NOUN_CREATURES_NAMED_SELF, NOUN_ANY_NUMBER_OF_TARGETS];
