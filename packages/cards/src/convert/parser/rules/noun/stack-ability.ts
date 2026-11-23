/**
 * Noun rule of the Sublime Epiphany group (issue 100): "target activated or triggered ability".
 */
import { literal, map, pattern } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, node } from '../registry';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

const ID = 'noun.target-activated-or-triggered-ability';

/**
 * `noun.target-activated-or-triggered-ability`: "target activated or triggered ability" (CR 113.3b, 113.3c, 405.1, 701.6a: an activated or triggered ability is an object on the stack
 * and may be countered). The engine's stack filter `stackKind: 'ability'`, which an activated ability and a triggered ability both are (a mana ability never uses the stack, CR 605.3b).
 * Not read: a plural, "target ability", "target triggered ability" alone, the other order, a spell as well.
 */
export const NOUN_TARGET_ACTIVATED_OR_TRIGGERED_ABILITY = defineRule<IrNoun>({
  id: ID,
  family: 'noun',
  leading: ['target'],
  cites: [
    'CR 113.3b (Abilities)',
    'CR 113.3c (Abilities)',
    'CR 405.1 (Stack)',
    'CR 701.6a (Counter)',
    'CR 115.1 (Targets)',
  ],
  examples: ['target activated or triggered ability'],
  rejects: [
    'target activated or triggered abilities',
    'target ability',
    'target triggered ability',
    'target activated ability',
    'target triggered or activated ability',
    'target spell or ability',
    'target activated or triggered',
    'activated or triggered ability',
  ],
  parse: node<Bare, IrNoun>(
    ID,
    map(
      literal('target activated or triggered ability'),
      (raw): Bare => ({
        kind: 'noun',
        det: 'target',
        filter: { zone: 'stack', stackKind: 'ability', raw },
        upTo: false,
        plural: false,
        other: false,
      }),
    ),
    (b) => b,
  ),
});

const SPELL_OR_ABILITY_ID = 'noun.target-spell-activated-or-triggered-ability';

/**
 * `noun.target-spell-activated-or-triggered-ability`: "target spell, activated ability, or triggered ability" (issue 105, Disallow; CR 113.3b, 113.3c, 405.1, 701.6a: a spell and an activated
 * or triggered ability are the objects on the stack, and each may be countered). The engine's stack filter with no kind: any spell or ability on the stack (a mana ability never uses it, CR 605.3b).
 * Not read: a plural, the other order, "target spell or ability", a list that leaves one of the three out or adds a fourth.
 */
export const NOUN_TARGET_SPELL_ACTIVATED_OR_TRIGGERED_ABILITY = defineRule<IrNoun>({
  id: SPELL_OR_ABILITY_ID,
  family: 'noun',
  leading: ['target'],
  cites: [
    'CR 113.3b (Abilities)',
    'CR 113.3c (Abilities)',
    'CR 405.1 (Stack)',
    'CR 701.6a (Counter)',
    'CR 115.1 (Targets)',
  ],
  examples: ['target spell, activated ability, or triggered ability'],
  rejects: [
    'target spells, activated abilities, or triggered abilities',
    'target spell or ability',
    'target spell, triggered ability, or activated ability',
    'target spell, activated ability, or triggered',
    'target spell, activated ability and triggered ability',
    'target spell, activated ability, or triggered ability on the stack',
    'spell, activated ability, or triggered ability',
    'target spell, activated ability, triggered ability, or loyalty ability',
  ],
  parse: node<Bare, IrNoun>(
    SPELL_OR_ABILITY_ID,
    map(
      pattern(/target spell, activated ability, or triggered ability(?![\p{L}\p{N}])/u),
      (m): Bare => ({
        kind: 'noun',
        det: 'target',
        filter: { zone: 'stack', raw: m[0] },
        upTo: false,
        plural: false,
        other: false,
      }),
    ),
    (b) => b,
  ),
});

export const STACK_ABILITY_NOUN_RULES = [NOUN_TARGET_ACTIVATED_OR_TRIGGERED_ABILITY];

/** Before `noun.target-spell`, which would read the prefix "target spell" of the list and leave the rest. */
export const STACK_ABILITY_EARLY_NOUN_RULES = [NOUN_TARGET_SPELL_ACTIVATED_OR_TRIGGERED_ABILITY];
