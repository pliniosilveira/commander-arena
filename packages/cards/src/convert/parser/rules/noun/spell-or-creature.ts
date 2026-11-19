/**
 * Noun rule of the Multiverse Reforged deck (issue 81, Fatehold Charm): a target that is a spell on the stack or a creature on the battlefield.
 */
import { literal, map } from '../../combinators';
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

export const SPELL_OR_CREATURE_NOUN_RULES = [NOUN_TARGET_SPELL_OR_CREATURE];
