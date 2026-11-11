/**
 * The keyword lines of the "cast later" family (stage P26; D-128): Suspend (CR 702.62), Madness (CR 702.35) and
 * Foretell (CR 702.143). Madness and Foretell are alternative costs of the face, `{ kind, cost }`, like the
 * named ones of stages P22 and P23 (the engine owns the discard replacement, the cast from exile and the special
 * action that exiles the card face down); Suspend is the keyword `suspend { count, cost }`, whose special action
 * and two abilities the engine runs itself. The reminder text in parentheses is dropped before the line is read.
 *
 * The cost is a plain mana cost, the only one the engine pays for these (`validateCard` refuses any other and an
 * {X}), and the only one the corpus has (`reports/templates.json`: `Suspend N—{M}` 65 cards, `Madness {M}` 56,
 * `Foretell {M}` 50). A cost with an {X}, a hybrid symbol or a non-mana part is not read. Each line stands alone,
 * never in a keyword list.
 */
import { literal, map, sequence } from '../../combinators';
import type { IrAmount, IrCost, IrKeyword } from '../../ir/types';
import { defineRule, family, node } from '../registry';
import { altCostKeyword } from './alt-costs';
import { CREW_POWER } from './ward-crew';

const MANA_COST = family<IrCost>('cost', { only: ['cost.mana'] });

/**
 * `keyword.suspend`: "Suspend 2—{1}{B}" (CR 702.62a: a static special action that pays the cost and exiles the
 * card from the hand with N time counters, and two triggered abilities that work from exile: one removes a
 * counter each upkeep, one casts the card for free when the last is gone). The engine runs all three from the
 * keyword (D-128, `rules/later-triggers.ts`). The number is a positive whole number in digits and is the one
 * parameter; the dash is the long one the Oracle text uses. 65 cards of the owner's run.
 */
export const KEYWORD_SUSPEND = defineRule<readonly IrKeyword[]>({
  id: 'keyword.suspend',
  family: 'keyword',
  leading: ['suspend'],
  cites: ['CR 702.62a (Suspend)', 'CR 116.2f (Special Actions)', 'CR 118.9 (Alternative Costs)'],
  examples: [
    'Suspend 2—{1}{B}',
    'Suspend 4—{0}',
    'Suspend 3—{R}',
    'Suspend 10—{2}{U}{U}',
    'suspend 1—{G}',
  ],
  rejects: [
    'Suspend',
    'Suspend 2',
    'Suspend {1}{B}',
    'Suspend 2 {1}{B}',
    'Suspend 2-{1}{B}',
    'Suspend 0—{1}{B}',
    'Suspend X—{1}{B}',
    'Suspend two—{1}{B}',
    'Suspend 2—{X}{B}',
    'Suspend 2—{W/U}',
    'Suspend 2—Pay 2 life.',
    'Suspend 2—Discard a card.',
    'Suspend 2—{1}{B}.',
    'Suspend 2—{1}{B}, flying',
    'Suspend 2—{1}{B} {1}',
    'Suspend 2—{1}{B}, suspend 1—{R}',
    'Suspended 2—{1}{B}',
    'Flying, suspend 2—{1}{B}',
    'Madness {1}{B}',
  ],
  parse: map(
    node<{ count: IrAmount; cost: IrCost }, IrKeyword>(
      'keyword.suspend',
      map(
        sequence(literal('suspend '), CREW_POWER, literal('—'), MANA_COST),
        ([, count, , cost]) => ({
          count,
          cost,
        }),
      ),
      ({ count, cost }) => ({ kind: 'keyword', name: 'suspend', params: [count], cost: [cost] }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

/**
 * `keyword.madness`: "Madness {1}{B}{B}" (CR 702.35a: a replacement of where the discarded card goes and a
 * trigger that lets its owner cast it from exile for the madness cost; the engine follows the rule's wording,
 * D-128). The line is the cost and nothing else: the replacement and the cast from exile are the engine's.
 * 56 cards of the owner's run.
 */
export const KEYWORD_MADNESS = defineRule<readonly IrKeyword[]>({
  id: 'keyword.madness',
  family: 'keyword',
  leading: ['madness'],
  cites: ['CR 702.35a (Madness)', 'CR 118.9 (Alternative Costs)', 'CR 601.2b (Casting Spells)'],
  examples: ['Madness {1}{B}{B}', 'Madness {R}', 'Madness {2}{G}', 'madness {3}{U}'],
  rejects: [
    'Madness',
    'Madness {X}{B}',
    'Madness {B/R}',
    'Madness—Discard a card.',
    'Madness—Pay 2 life.',
    'Madness {1}{B}.',
    'Madness {1}{B}, madness {R}',
    'Madness {1}{B}, flying',
    'Madness {1}{B} {1}',
    'Madnesses {1}{B}',
    'Foretell {1}{B}',
  ],
  parse: altCostKeyword('keyword.madness', 'madness'),
});

/**
 * `keyword.foretell`: "Foretell {4}{R}{R}" (CR 702.143a: a special action that pays {2} and exiles the card face
 * down, and a cast from exile after that turn for the foretell cost). The cost on the line is the foretell cost,
 * what the cast from exile costs; the {2} and the special action are the engine's. 50 cards of the owner's run.
 */
export const KEYWORD_FORETELL = defineRule<readonly IrKeyword[]>({
  id: 'keyword.foretell',
  family: 'keyword',
  leading: ['foretell'],
  cites: ['CR 702.143a (Foretell)', 'CR 118.9 (Alternative Costs)', 'CR 601.2b (Casting Spells)'],
  examples: ['Foretell {4}{R}{R}', 'Foretell {1}{W}', 'Foretell {U}', 'foretell {2}{G}'],
  rejects: [
    'Foretell',
    'Foretell {X}{R}',
    'Foretell {R/G}',
    'Foretell—Pay 2 life.',
    'Foretell—Sacrifice a creature.',
    'Foretell {4}{R}{R}.',
    'Foretell {4}{R}{R}, foretell {1}',
    'Foretell {4}{R}{R}, haste',
    'Foretell {4}{R}{R} {1}',
    'Foretold {4}{R}{R}',
    'Flying, foretell {4}{R}{R}',
    'Madness {4}{R}{R}',
  ],
  parse: altCostKeyword('keyword.foretell', 'foretell'),
});

export const LATER_KEYWORD_RULES = [KEYWORD_SUSPEND, KEYWORD_MADNESS, KEYWORD_FORETELL];
