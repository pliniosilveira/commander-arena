/**
 * Keyword rule of Ninjutsu (CR 702.49a, UNVERIFIED rule number: the CR text is not in the repository): "Ninjutsu {1}{R}".
 */
import { literal, map, sequence } from '../../combinators';
import type { IrCost, IrKeyword } from '../../ir/types';
import { defineRule, family, node } from '../registry';

const MANA_COST = family<IrCost>('cost', { only: ['cost.mana'] });

/**
 * `keyword.ninjutsu`: "Ninjutsu {1}{R}" (an activated ability that works from the hand: pay the cost and return an unblocked attacker you control to its owner's hand, and the card enters
 * the battlefield tapped and attacking the same defender). The line is the cost and nothing else; the return of the attacker, the timing and the attack target are the engine's. A plain
 * mana cost without {X}. Not read: another kind of cost (the "Commander ninjutsu" form is another keyword), a second ninjutsu on one line, other words on the line.
 */
export const KEYWORD_NINJUTSU = defineRule<readonly IrKeyword[]>({
  id: 'keyword.ninjutsu',
  family: 'keyword',
  leading: ['ninjutsu'],
  cites: ['CR 702.49a (Ninjutsu)', 'CR 509.1h (Unblocked)'],
  examples: ['Ninjutsu {1}{R}', 'Ninjutsu {U}', 'Ninjutsu {2}{B}{B}', 'ninjutsu {1}{G}'],
  rejects: [
    'Ninjutsu',
    'Ninjutsu {X}',
    'Ninjutsu {R/G}',
    'Ninjutsu—Pay 2 life.',
    'Ninjutsu {1}{R}.',
    'Ninjutsu {1}{R}, haste',
    'Ninjutsu {1}{R} {1}',
    'Ninjutsu {1}{R}, ninjutsu {2}',
    'Ninjutsus {1}{R}',
    'Flying, ninjutsu {1}{R}',
    'Commander ninjutsu {1}{R}',
    'Plot {1}{R}',
  ],
  parse: map(
    node<readonly IrCost[], IrKeyword>(
      'keyword.ninjutsu',
      map(sequence(literal('ninjutsu '), MANA_COST), ([, cost]): readonly IrCost[] => [cost]),
      (cost) => ({ kind: 'keyword', name: 'ninjutsu', params: [], cost }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const NINJUTSU_KEYWORD_RULES = [KEYWORD_NINJUTSU];
