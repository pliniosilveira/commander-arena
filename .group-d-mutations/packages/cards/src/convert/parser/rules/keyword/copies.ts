/**
 * The two keyword lines that copy the spell being cast (stage P27; D-129): Storm (CR 702.40) and Replicate
 * (CR 702.56). Each is one line and lowers to the engine's keyword, which the engine expands into the trigger of
 * the spell (what is copied, how many times and the question about the new targets are the engine's). The
 * reminder text in parentheses is dropped before the line is read.
 *
 * Replicate's cost is a plain mana cost, the only one the corpus has (`reports/templates.json`: `Replicate {M}`,
 * 16 cards) and the only one `validateCard` accepts; an {X}, a hybrid symbol or a non-mana part is not read. Each
 * line stands alone, never in a keyword list.
 */
import { literal, map, sequence } from '../../combinators';
import type { IrCost, IrKeyword } from '../../ir/types';
import { defineRule, family, node } from '../registry';

const MANA_COST = family<IrCost>('cost', { only: ['cost.mana'] });

/**
 * `keyword.storm`: "Storm" (CR 702.40a: "When you cast this spell, copy it for each other spell that was cast
 * before it this turn"). No parameter; the engine expands the keyword into the cast trigger. 33 cards of the
 * owner's run.
 */
export const KEYWORD_STORM = defineRule<readonly IrKeyword[]>({
  id: 'keyword.storm',
  family: 'keyword',
  leading: ['storm'],
  cites: ['CR 702.40a (Storm)', 'CR 702.40b (Storm)', 'CR 603.3b (Triggered Abilities)'],
  examples: ['Storm', 'storm'],
  rejects: [
    '',
    'Storm 2',
    'Storm {1}',
    'Storm.',
    'Storms',
    'Stormwing',
    'Storm, flying',
    'Flying, storm',
    'Storm, storm',
    'Storm {R}',
    'Replicate {1}',
    'Cascade',
  ],
  parse: map(
    node<null, IrKeyword>(
      'keyword.storm',
      map(literal('storm'), () => null),
      () => ({ kind: 'keyword', name: 'storm', params: [] }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

/**
 * `keyword.replicate`: "Replicate {2}" (CR 702.56a: "As you cast this spell, you may pay [cost] any number of
 * times. When you cast this spell, if a replicate cost was paid for it, copy it for each time its replicate cost
 * was paid."). The line is the cost and nothing else; the question of how many times, the trigger and the copies
 * are the engine's. 16 cards of the owner's run.
 */
export const KEYWORD_REPLICATE = defineRule<readonly IrKeyword[]>({
  id: 'keyword.replicate',
  family: 'keyword',
  leading: ['replicate'],
  cites: ['CR 702.56a (Replicate)', 'CR 702.56b (Replicate)', 'CR 601.2b (Casting Spells)'],
  examples: ['Replicate {2}', 'Replicate {U}', 'Replicate {1}{R}', 'replicate {3}{G}'],
  rejects: [
    'Replicate',
    'Replicate {X}',
    'Replicate {X}{R}',
    'Replicate {R/G}',
    'Replicate—Pay 2 life.',
    'Replicate {2}.',
    'Replicate {2}, haste',
    'Replicate {2} {1}',
    'Replicate {2}, replicate {1}',
    'Replicates {2}',
    'Flying, replicate {2}',
    'Echo {2}',
  ],
  parse: map(
    node<readonly IrCost[], IrKeyword>(
      'keyword.replicate',
      map(sequence(literal('replicate '), MANA_COST), ([, cost]): readonly IrCost[] => [cost]),
      (cost) => ({ kind: 'keyword', name: 'replicate', params: [], cost }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const KEYWORD_GRAVESTORM = defineRule<readonly IrKeyword[]>({
  id: 'keyword.gravestorm',
  family: 'keyword',
  leading: ['gravestorm'],
  cites: ['CR 603.3b (Handling Triggered Abilities)', 'CR 707.10 (Copying Objects)'],
  examples: ['Gravestorm'],
  rejects: ['Gravestorm 2', 'Storm'],
  parse: map(
    node<null, IrKeyword>(
      'keyword.gravestorm',
      map(literal('gravestorm'), () => null),
      () => ({ kind: 'keyword', name: 'gravestorm', params: [] }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const COPY_KEYWORD_RULES = [KEYWORD_STORM, KEYWORD_REPLICATE, KEYWORD_GRAVESTORM];
