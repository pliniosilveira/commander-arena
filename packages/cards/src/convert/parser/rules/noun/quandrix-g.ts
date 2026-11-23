/**
 * Noun rules of the Quandrix Unlimited deck, group G: "commanders you control" (CR 903.3: a commander is a card a player designated as one; the ones on the
 * battlefield are permanents) and "target creature token" (CR 111.1).
 */
import { map, pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { BOUNDARY } from './phrases';

/**
 * `noun.commanders-you-control`: "commanders you control", the subject of "Commanders you control have hexproof." (CR 611.3a). Every permanent its controller
 * designated as a commander counts, whatever its types. Not read: "commander creatures you control" (`noun.plain-permanents`), "target commanders", "commanders your
 * opponents control", "commander you control" and a lone "commanders".
 */
export const NOUN_COMMANDERS_YOU_CONTROL = defineRule<IrNoun>({
  id: 'noun.commanders-you-control',
  family: 'noun',
  leading: ['commanders'],
  cites: ['CR 903.3 (Commander)', 'CR 611.3a (Continuous Effects)'],
  examples: ['commanders you control', 'Commanders you control'],
  rejects: [
    'commander you control',
    'commanders',
    'commanders your opponents control',
    'commander creatures you control',
    'target commanders you control',
    'commanders you controlling',
  ],
  parse: node<string, IrNoun>(
    'noun.commanders-you-control',
    map(pattern(new RegExp(`commanders you control${BOUNDARY}`, 'iu')), (m) => m[0]),
    (raw) => ({
      kind: 'noun',
      det: 'each',
      filter: { zone: 'battlefield', commander: true, controller: 'you', raw },
      upTo: false,
      plural: true,
      other: false,
    }),
  ),
});

/**
 * `noun.other-commanders-you-control`: "other commanders you control", the subject of the ability Dancer's Chakrams gives, "Other commanders you control get +2/+2 and have lifelink."
 * (CR 903.3, 611.3a): every permanent its controller designated as a commander but the one that has the ability. Not read: "other commander you control", "other commanders",
 * "other commanders your opponents control", "other commander creatures you control" (`noun.other-permanents`) and "another commander you control".
 */
export const NOUN_OTHER_COMMANDERS_YOU_CONTROL = defineRule<IrNoun>({
  id: 'noun.other-commanders-you-control',
  family: 'noun',
  leading: ['other'],
  cites: [
    'CR 903.3 (Commander)',
    'CR 611.3a (Continuous Effects)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: ['other commanders you control', 'Other commanders you control'],
  rejects: [
    'other commander you control',
    'other commanders',
    'other commanders your opponents control',
    'other commander creatures you control',
    'another commander you control',
    'commanders you control',
    'other commanders you controlling',
  ],
  parse: node<string, IrNoun>(
    'noun.other-commanders-you-control',
    map(pattern(new RegExp(`other commanders you control${BOUNDARY}`, 'iu')), (m) => m[0]),
    (raw) => ({
      kind: 'noun',
      det: 'each',
      filter: { zone: 'battlefield', commander: true, controller: 'you', raw },
      upTo: false,
      plural: true,
      other: true,
    }),
  ),
});

/**
 * `noun.target-creature-token`: "target creature token" (CR 111.1, 115.1: a token that is a creature, on the battlefield; one target), read by `effect.restrict` only. Not
 * read: "target creature tokens", "target token", "target nontoken creature", "target creature token you control", "another target creature token".
 */
export const NOUN_TARGET_CREATURE_TOKEN = defineRule<IrNoun>({
  id: 'noun.target-creature-token',
  family: 'noun',
  leading: ['target'],
  cites: ['CR 111.1 (Tokens)', 'CR 115.1 (Targets)'],
  examples: ['target creature token', 'Target creature token'],
  rejects: [
    'target creature tokens',
    'target token',
    'target nontoken creature',
    'target creature token you control',
    'another target creature token',
    'target creature',
    'target creature tokenizer',
  ],
  parse: node<string, IrNoun>(
    'noun.target-creature-token',
    map(
      pattern(new RegExp(`target creature token${BOUNDARY}(?!s| you control)`, 'iu')),
      (m) => m[0],
    ),
    (raw) => ({
      kind: 'noun',
      det: 'target',
      filter: { zone: 'battlefield', types: ['creature'], token: true, raw },
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

export const QUANDRIX_G_NOUN_RULES = [
  NOUN_COMMANDERS_YOU_CONTROL,
  NOUN_OTHER_COMMANDERS_YOU_CONTROL,
];

/** Before `noun.target-permanent`, whose phrase would stop at "target creature". */
export const QUANDRIX_G_TARGET_NOUN_RULES = [NOUN_TARGET_CREATURE_TOKEN];
