/**
 * Noun rule of the Multiverse Reforged deck (issue 81, Fatehold Charm): a target that is a spell on the stack or a creature on the battlefield.
 */
import { literal, map, pattern } from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';
import { NO_PARTS, toFilter } from './phrases';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

const ID = 'noun.target-spell-or-creature';

/**
 * `noun.target-spell-or-creature`: "target spell or creature" (CR 115.1, 601.2c, 405.1: one target, a spell on the stack or a creature on the battlefield, chosen as the spell or
 * ability is put on the stack). The engine's `objectOrSpell` slot. Not read: another order, other types ("or permanent"), a plural, a kind of spell, "target creature or spell".
 */
export const NOUN_TARGET_SPELL_OR_CREATURE = defineRule<IrNoun>({
  id: ID,
  family: 'noun',
  leading: ['target'],
  cites: ['CR 115.1 (Targets)', 'CR 405.1 (Stack)', 'CR 601.2c (Casting Spells)'],
  examples: ['target spell or creature'],
  rejects: [
    'target creature or spell',
    'target spell or permanent',
    'target spells or creatures',
    'target creature spell or creature',
    'target spell',
    'target spell or creatures',
    'spell or creature',
  ],
  parse: node<string, IrNoun>(
    ID,
    map(literal('target spell or creature'), (raw) => raw),
    (raw): Bare => {
      const orSpell: IrFilter = { ...toFilter('stack', NO_PARTS, 'spell'), stackKind: 'spell' };
      return {
        kind: 'noun',
        det: 'target',
        filter: toFilter('battlefield', { ...NO_PARTS, types: ['creature'] }, raw),
        orSpell,
        upTo: false,
        plural: false,
        other: false,
      };
    },
  ),
});

const PERMANENT_ID = 'noun.target-spell-or-permanent';

/**
 * `noun.target-spell-or-permanent`: "target spell or permanent" (Eight-and-a-Half-Tails, CR 115.1, 601.2c, 405.1: one target, a spell on the stack or a permanent on the battlefield, chosen
 * as the ability is put on the stack). The engine's `objectOrSpell` slot with any permanent. Not read: another order, a type ("or creature"), a plural, a kind of spell, "target permanent or spell".
 */
export const NOUN_TARGET_SPELL_OR_PERMANENT = defineRule<IrNoun>({
  id: PERMANENT_ID,
  family: 'noun',
  leading: ['target'],
  cites: ['CR 115.1 (Targets)', 'CR 405.1 (Stack)', 'CR 601.2c (Casting Spells)'],
  examples: ['target spell or permanent'],
  rejects: [
    'target permanent or spell',
    'target spells or permanents',
    'target spell or permanents',
    'target creature spell or permanent',
    'target spell',
    'spell or permanent',
  ],
  parse: node<string, IrNoun>(
    PERMANENT_ID,
    map(literal('target spell or permanent'), (raw) => raw),
    (raw): Bare => {
      const orSpell: IrFilter = { ...toFilter('stack', NO_PARTS, 'spell'), stackKind: 'spell' };
      return {
        kind: 'noun',
        det: 'target',
        filter: toFilter('battlefield', NO_PARTS, raw),
        orSpell,
        upTo: false,
        plural: false,
        other: false,
      };
    },
  ),
});

const LESS_POWER_ID = 'noun.target-creature-power-less-than-source';

/**
 * `noun.target-creature-power-less-than-source`: "target creature with power less than this creature's power" (Firja's Retribution, CR 208.1, 115.1, 702.134a for the same comparison): one
 * target creature whose power is less than the power of the source of the ability, read as the ability is activated and again as it resolves. The engine's `powerLessThanSource`. Not read: another
 * stat, "or equal to", another comparison, a plural, a number, "target attacking creature", "target creature with power less than target creature's power".
 */
export const NOUN_TARGET_CREATURE_POWER_LESS_THAN_SOURCE = defineRule<IrNoun>({
  id: LESS_POWER_ID,
  family: 'noun',
  leading: ['target'],
  cites: ['CR 115.1 (Targets)', 'CR 208.1 (Power/Toughness)'],
  examples: [
    "target creature with power less than this creature's power",
    "target creature with power less than ~'s power",
  ],
  rejects: [
    "target creature with toughness less than this creature's toughness",
    "target creature with power less than or equal to this creature's power",
    "target creature with power greater than this creature's power",
    "target creatures with power less than this creature's power",
    'target creature with power less than 3',
    "target creature with power less than this creature's toughness",
    "target creature with power less than target creature's power",
  ],
  parse: node<string, IrNoun>(
    LESS_POWER_ID,
    map(
      pattern(
        /target creature with power less than (?:this creature|~)['’]s power(?![\p{L}\p{N}])/iu,
      ),
      (m) => m[0],
    ),
    (raw): Bare => ({
      kind: 'noun',
      det: 'target',
      filter: {
        ...toFilter('battlefield', { ...NO_PARTS, types: ['creature'] }, raw),
        powerLessThanSource: true,
      },
      upTo: false,
      plural: false,
      other: false,
    }),
  ),
});

export const SPELL_OR_CREATURE_NOUN_RULES = [
  NOUN_TARGET_CREATURE_POWER_LESS_THAN_SOURCE,
  NOUN_TARGET_SPELL_OR_CREATURE,
  NOUN_TARGET_SPELL_OR_PERMANENT,
];
