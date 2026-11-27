/**
 * Keyword rule of the Animated Army deck (issue 110): Offspring (Prosperous Bandit, CR 702.175a).
 */
import { literal, map, sequence } from '../../combinators';
import type { IrCost, IrKeyword } from '../../ir/types';
import { defineRule, family, node } from '../registry';

const MANA_COST = family<IrCost>('cost', { only: ['cost.mana'] });

/**
 * `keyword.offspring`: "Offspring {1}" (CR 702.175a: "You may pay an additional [cost] as you cast this spell" and "When this permanent enters, if its offspring cost was paid, create a
 * token that's a copy of it, except it's 1/1"). The line is the cost and nothing else; the question while casting and the enters trigger are the engine's. A plain mana cost without {X}.
 * Not read: a cost of another kind after an em dash (the repository holds no real line of it), a second offspring on one line, other words on the line.
 */
export const KEYWORD_OFFSPRING = defineRule<readonly IrKeyword[]>({
  id: 'keyword.offspring',
  family: 'keyword',
  leading: ['offspring'],
  cites: ['CR 702.175a (Offspring)', 'CR 601.2b (Casting Spells)', 'CR 118.8 (Costs)'],
  examples: ['Offspring {1}', 'Offspring {2}', 'Offspring {1}{W}', 'offspring {3}'],
  rejects: [
    'Offspring',
    'Offspring {X}',
    'Offspring—Pay 2 life.',
    'Offspring {2}.',
    'Offspring {2}, haste',
    'Offspring {2} {1}',
    'Offspring {2}, offspring {1}',
    'Offsprings {2}',
    'First strike, offspring {1}',
    'Buyback {2}',
  ],
  parse: map(
    node<readonly IrCost[], IrKeyword>(
      'keyword.offspring',
      map(sequence(literal('offspring '), MANA_COST), ([, cost]): readonly IrCost[] => [cost]),
      (cost) => ({ kind: 'keyword', name: 'offspring', params: [], cost }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const OFFSPRING_KEYWORD_RULES = [KEYWORD_OFFSPRING];
