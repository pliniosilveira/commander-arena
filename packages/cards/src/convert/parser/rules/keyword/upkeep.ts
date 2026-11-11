/**
 * The two keyword lines of the upkeep (stage P25; D-127): Echo (CR 702.30) and Cumulative upkeep (CR 702.24).
 * Each is one line, "<word> {M}", and lowers to the engine's keyword with its cost, which the engine expands
 * into the triggered ability of the upkeep (what the trigger asks and what it sacrifices are the engine's).
 * The reminder text in parentheses is dropped before the line is read.
 *
 * The cost is a plain mana cost, the only one the corpus has for either keyword (`reports/templates.json`:
 * `Echo {M}` 47 cards, `Cumulative upkeep {M}` 57). The dash forms of Cumulative upkeep that the engine
 * could pay ("Cumulative upkeep—Pay 1 life.", "Cumulative upkeep—Discard a card.") are not read: no real line
 * of them is in the repository's reports, so their wording is unverified and the line stays text the grammar
 * does not read. An {X} or a hybrid symbol is not read either (`cost.mana` does not read them).
 */
import { literal, map, sequence } from '../../combinators';
import type { IrCost, IrKeyword } from '../../ir/types';
import { defineRule, family, node } from '../registry';

const MANA_COST = family<IrCost>('cost', { only: ['cost.mana'] });

/** "<words> {M}": the keyword node with its one mana cost. */
export function upkeepKeyword(id: string, words: string, name: string) {
  return map(
    node<readonly IrCost[], IrKeyword>(
      id,
      map(sequence(literal(`${words} `), MANA_COST), ([, cost]): readonly IrCost[] => [cost]),
      (cost) => ({ kind: 'keyword', name, params: [], cost }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  );
}

/**
 * `keyword.echo`: "Echo {3}{W}{W}" (CR 702.30a: "At the beginning of your upkeep, if this permanent came under
 * your control since the beginning of your last upkeep, sacrifice it unless you pay [cost]"). The engine
 * expands the keyword into that trigger. 47 cards of the owner's run. A line is read on its own, never in a
 * keyword list.
 */
export const KEYWORD_ECHO = defineRule<readonly IrKeyword[]>({
  id: 'keyword.echo',
  family: 'keyword',
  leading: ['echo'],
  cites: ['CR 702.30a (Echo)', 'CR 603.4 (Triggered Abilities)'],
  examples: ['Echo {3}{W}{W}', 'Echo {2}{R}', 'Echo {G}', 'echo {1}{B}'],
  rejects: [
    'Echo',
    'Echo {X}',
    'Echo {X}{R}',
    'Echo {W/U}',
    'Echo—Pay 2 life.',
    'Echo {2}{R}.',
    'Echo {2}{R}, haste',
    'Echo {2}{R} {1}',
    'Echo {2}{R}, echo {1}',
    'Echoes {2}{R}',
    'Flying, echo {2}{R}',
    'Cumulative upkeep {1}',
  ],
  parse: upkeepKeyword('keyword.echo', 'echo', 'echo'),
});

/**
 * `keyword.cumulative-upkeep`: "Cumulative upkeep {1}" (CR 702.24a: "At the beginning of your upkeep, put an age
 * counter on this permanent. Then you may pay [cost] for each age counter on it. If you don't, sacrifice it").
 * The engine expands the keyword into that trigger and repeats the cost for each age counter. 57 cards of the
 * owner's run. A line is read on its own, never in a keyword list; the dash forms (a payment of life or a
 * discard) are not read, see the head of this file.
 */
export const KEYWORD_CUMULATIVE_UPKEEP = defineRule<readonly IrKeyword[]>({
  id: 'keyword.cumulative-upkeep',
  family: 'keyword',
  leading: ['cumulative'],
  cites: ['CR 702.24a (Cumulative Upkeep)', 'CR 702.24b (Cumulative Upkeep)'],
  examples: [
    'Cumulative upkeep {1}',
    'Cumulative upkeep {G}',
    'Cumulative upkeep {2}{U}',
    'cumulative upkeep {W}',
  ],
  rejects: [
    'Cumulative upkeep',
    'Cumulative upkeep {X}',
    'Cumulative upkeep {W/U}',
    'Cumulative upkeep—Pay 1 life.',
    'Cumulative upkeep—Discard a card.',
    'Cumulative upkeep—Sacrifice a creature.',
    'Cumulative upkeep {1}.',
    'Cumulative upkeep {1}, flying',
    'Cumulative upkeep {1}{W} or {U}',
    'Cumulative {1}',
    'Cumulative upkeeps {1}',
    'Flying, cumulative upkeep {1}',
    'Echo {1}',
  ],
  parse: upkeepKeyword('keyword.cumulative-upkeep', 'cumulative upkeep', 'cumulativeUpkeep'),
});

export const UPKEEP_KEYWORD_RULES = [KEYWORD_ECHO, KEYWORD_CUMULATIVE_UPKEEP];
