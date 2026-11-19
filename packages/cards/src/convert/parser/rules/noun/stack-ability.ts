/**
 * Noun rule of the Sublime Epiphany group (issue 100): "target activated or triggered ability".
 */
import { literal, map } from '../../combinators';
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

export const STACK_ABILITY_NOUN_RULES = [NOUN_TARGET_ACTIVATED_OR_TRIGGERED_ABILITY];
