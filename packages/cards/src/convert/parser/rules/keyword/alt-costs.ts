/**
 * The keyword lines of the named alternative costs (stage P22; D-117, D-121): Overload (CR 702.96),
 * Evoke (CR 702.74) and Dash (CR 702.109). Each is one line, "<word> {M}", and lowers to an entry of the
 * face's `alternativeCosts`, not to an ability: the engine owns what the keyword does (the text change of
 * Overload, the sacrifice of Evoke, the haste and the return of Dash), so the parser reads the cost and
 * nothing else. The reminder text in parentheses is dropped before the line is read.
 *
 * Stage P23 (D-117, D-124) adds Spectacle (CR 702.137, "Spectacle {R}", the same shape and the same face field;
 * the engine reads the condition "an opponent lost life this turn"), Escape (CR 702.138, "Escape—{G}{G}{U}{U},
 * Exile five other cards from your graveyard.", a face field with the number of cards) and Unearth (CR 702.84,
 * "Unearth {R}": not a face field but the keyword, which the engine expands into an ability that works from the
 * graveyard).
 *
 * The cost is a plain mana cost, the only one the engine pays for these (`validateCard` refuses any other
 * and an {X}): the dash form ("Evoke—Exile a white card from your hand.", the real line of Solitude, Fury,
 * Grief, Endurance and Subtlety) is not read, so the line is reported as text the grammar does not read,
 * never half-executed. A hybrid symbol is not read either (`cost.mana` does not read it).
 */
import { literal, map, pattern, sequence } from '../../combinators';
import type { IrCost, IrKeyword, Span } from '../../ir/types';
import { defineRule, family, node, spanned } from '../registry';

const MANA_COST = family<IrCost>('cost', { only: ['cost.mana'] });

/** A plain mana cost, or one with an {X} (`cost.mana-x`): Miracle's cost may have one (CR 107.3a), no other named alternative cost does. */
const MANA_COST_WITH_X = family<IrCost>('cost', { only: ['cost.mana', 'cost.mana-x'] });

/** "<word> {M}": the keyword node with its one mana cost (with an {X} when `x` is set, D-274). */
export function altCostKeyword(id: string, word: string, x = false) {
  return map(
    node<readonly IrCost[], IrKeyword>(
      id,
      map(
        sequence(literal(`${word} `), x ? MANA_COST_WITH_X : MANA_COST),
        ([, cost]): readonly IrCost[] => [cost],
      ),
      (cost) => ({ kind: 'keyword', name: word, params: [], cost }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  );
}

/**
 * `keyword.overload`: "Overload {6}{U}" (CR 702.96a: "You may cast this spell by paying [cost] rather than
 * its mana cost. If you do, change its text by replacing all instances of 'target' with 'each'"). Read on
 * any face: only an instant or a sorcery with spell text the engine can change (D-121) can have it, and
 * `validateCard` says why a card cannot ("Winds of Abandon", a modal spell). 26 cards of the owner's run.
 */
export const KEYWORD_OVERLOAD = defineRule<readonly IrKeyword[]>({
  id: 'keyword.overload',
  family: 'keyword',
  leading: ['overload'],
  cites: ['CR 702.96a (Overload)', 'CR 118.9 (Alternative Costs)', 'CR 601.2b (Casting Spells)'],
  examples: ['Overload {6}{U}', 'Overload {2}{R}', 'Overload {G}', 'overload {1}{U}'],
  rejects: [
    'Overload',
    'Overload {X}{U}',
    'Overload {W/U}',
    'Overload {2}.',
    'Overload—Discard a card.',
    'Overload {2}{R}, overload {3}',
    'Overload {2}{R} and flying',
    'Overloaded {2}',
    'Evoke {2}{U}',
  ],
  parse: altCostKeyword('keyword.overload', 'overload'),
});

/**
 * `keyword.evoke`: "Evoke {2}{U}" (CR 702.74a: "You may cast this card by paying [cost] rather than its mana
 * cost. When this permanent enters, if its evoke cost was paid, its controller sacrifices it"). The engine
 * gives the evoked permanent the sacrifice trigger. "Evoke—Exile a white card from your hand." is not read.
 * 30 cards of the owner's run.
 */
export const KEYWORD_EVOKE = defineRule<readonly IrKeyword[]>({
  id: 'keyword.evoke',
  family: 'keyword',
  leading: ['evoke'],
  cites: ['CR 702.74a (Evoke)', 'CR 118.9 (Alternative Costs)', 'CR 601.2b (Casting Spells)'],
  examples: ['Evoke {2}{U}', 'Evoke {1}{B}', 'Evoke {R}', 'evoke {3}{G}{G}'],
  rejects: [
    'Evoke',
    'Evoke {X}',
    'Evoke {W/U}',
    'Evoke {2}{U}.',
    'Evoke—Exile a white card from your hand.',
    'Evoke—Pay 2 life.',
    'Evoke {2}{U}, evoke {1}',
    'Evoke {2}{U} and flying',
    'Evoked {2}{U}',
    'Dash {2}{U}',
  ],
  parse: altCostKeyword('keyword.evoke', 'evoke'),
});

/**
 * `keyword.dash`: "Dash {1}{R}" (CR 702.109a: "You may cast this card by paying [cost] rather than its mana
 * cost. If this spell's dash cost was paid, return the permanent this spell becomes to its owner's hand at
 * the beginning of the next end step", and haste while the dash cost was paid). The engine owns the haste and
 * the delayed return. 22 cards of the owner's run.
 */
export const KEYWORD_DASH = defineRule<readonly IrKeyword[]>({
  id: 'keyword.dash',
  family: 'keyword',
  leading: ['dash'],
  cites: ['CR 702.109a (Dash)', 'CR 118.9 (Alternative Costs)', 'CR 601.2b (Casting Spells)'],
  examples: ['Dash {1}{R}', 'Dash {2}{R}{R}', 'Dash {B}', 'dash {1}{R}'],
  rejects: [
    'Dash',
    'Dash {X}{R}',
    'Dash {R/G}',
    'Dash {1}{R}.',
    'Dash—Pay 3 life.',
    'Dash {1}{R}, dash {2}',
    'Dash {1}{R}, haste',
    'Dashed {1}{R}',
    'Evoke {1}{R}',
  ],
  parse: altCostKeyword('keyword.dash', 'dash'),
});

/**
 * `keyword.spectacle`: "Spectacle {R}" (CR 702.137a: "You may cast this spell by paying [cost] rather than its
 * mana cost if an opponent lost life this turn"). The engine reads the condition, at the first casting step, so
 * the line is the cost and nothing else. 11 cards of the owner's run.
 */
export const KEYWORD_SPECTACLE = defineRule<readonly IrKeyword[]>({
  id: 'keyword.spectacle',
  family: 'keyword',
  leading: ['spectacle'],
  cites: ['CR 702.137a (Spectacle)', 'CR 118.9 (Alternative Costs)', 'CR 601.2b (Casting Spells)'],
  examples: ['Spectacle {R}', 'Spectacle {1}{R}', 'Spectacle {B}', 'spectacle {2}{B}{B}'],
  rejects: [
    'Spectacle',
    'Spectacle {X}{R}',
    'Spectacle {R/W}',
    'Spectacle {R}.',
    'Spectacle—Pay 2 life.',
    'Spectacle {R}, spectacle {1}',
    'Spectacle {R} and haste',
    'Spectacled {R}',
    'Dash {R}',
  ],
  parse: altCostKeyword('keyword.spectacle', 'spectacle'),
});

/**
 * `keyword.unearth`: "Unearth {R}" (CR 702.84a: "[Cost]: Return this card from your graveyard to the battlefield.
 * It gains haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it
 * instead of putting it anywhere else. Activate only as a sorcery"). Not an alternative cost: it lowers to the
 * keyword of the engine, which expands it into the activated ability that works from the graveyard. 55 cards of
 * the owner's run. The cost is a plain mana cost; a line is read on its own, never in a keyword list.
 */
export const KEYWORD_UNEARTH = defineRule<readonly IrKeyword[]>({
  id: 'keyword.unearth',
  family: 'keyword',
  leading: ['unearth'],
  cites: ['CR 702.84a (Unearth)', 'CR 602.2 (Activating Activated Abilities)'],
  examples: ['Unearth {R}', 'Unearth {2}{B}', 'Unearth {1}{R}{R}', 'unearth {W}'],
  rejects: [
    'Unearth',
    'Unearth {X}',
    'Unearth {B/R}',
    'Unearth—Pay 2 life.',
    'Unearth {R}.',
    'Unearth {R}, haste',
    'Unearth {R} {1}',
    'Unearthed {R}',
    'Flying, unearth {R}',
    'Dash {R}',
  ],
  parse: altCostKeyword('keyword.unearth', 'unearth'),
});

/**
 * `keyword.encore`: "Encore {3}{R}" (CR 702.141a: "[Cost], Exile this card from your graveyard: For each opponent, create a token that's a copy of
 * this card that attacks that opponent this turn if able. The tokens gain haste. Sacrifice them at the beginning of the next end step. Activate only as
 * a sorcery"). Like Unearth it lowers to the keyword of the engine, which expands it into the activated ability that works from the graveyard (D-185).
 * The cost is a plain mana cost; a line is read on its own, never in a keyword list. The card the owner's run reports it for: Impulsive Pilferer.
 */
export const KEYWORD_ENCORE = defineRule<readonly IrKeyword[]>({
  id: 'keyword.encore',
  family: 'keyword',
  leading: ['encore'],
  cites: ['CR 702.141a (Encore)', 'CR 602.2 (Activating Activated Abilities)'],
  examples: ['Encore {3}{R}', 'Encore {2}{B}{B}', 'Encore {4}', 'encore {1}{W}'],
  rejects: [
    'Encore',
    'Encore {X}',
    'Encore {B/R}',
    'Encore—Pay 2 life.',
    'Encore {3}{R}.',
    'Encore {3}{R}, haste',
    'Encore {3}{R} {1}',
    'Encored {3}{R}',
    'Flying, encore {3}{R}',
    'Unearth {3}{R}',
  ],
  parse: altCostKeyword('keyword.encore', 'encore'),
});

/**
 * `keyword.eternalize`: "Eternalize {5}{U}{U}" (CR 702.129a: "[Cost], Exile this card from your graveyard: Create a token that's a copy of this card, except it's black, it's 4/4, it has no
 * mana cost, and it's a Zombie in addition to its other types. Activate only as a sorcery"). Like Encore it lowers to the keyword of the engine, which expands it into the activated
 * ability that works from the graveyard (D-384, provisional number). The cost is a plain mana cost; a line is read on its own, never in a keyword list. The reminder text of the real
 * cards is dropped before the line is read. The card the Hashaton deck brings: Champion of Wits.
 */
export const KEYWORD_ETERNALIZE = defineRule<readonly IrKeyword[]>({
  id: 'keyword.eternalize',
  family: 'keyword',
  leading: ['eternalize'],
  cites: ['CR 702.129a (Eternalize)', 'CR 602.2 (Activating Activated Abilities)'],
  examples: ['Eternalize {5}{U}{U}', 'Eternalize {4}{B}', 'Eternalize {2}', 'eternalize {1}{W}'],
  rejects: [
    'Eternalize',
    'Eternalize {X}',
    'Eternalize {B/R}',
    'Eternalize—Pay 2 life.',
    'Eternalize {5}{U}{U}.',
    'Eternalize {5}{U}{U}, haste',
    'Eternalize {5}{U}{U} {1}',
    'Eternalized {5}{U}{U}',
    'Flying, eternalize {5}{U}{U}',
    'Encore {5}{U}{U}',
  ],
  parse: altCostKeyword('keyword.eternalize', 'eternalize'),
});

const ESCAPE_COUNTS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** "one other card" or "three other cards": the cards of the graveyard an escape cost exiles (one to nine). */
const ESCAPE_CARDS = map(
  pattern(
    /(?:(one) other card|(two|three|four|five|six|seven|eight|nine) other cards) from your graveyard\./iu,
  ),
  (m): number => ESCAPE_COUNTS.indexOf((m[1] ?? m[2] ?? '').toLowerCase()) + 1,
);

/**
 * `keyword.escape`: "Escape—{G}{G}{U}{U}, Exile five other cards from your graveyard." (CR 702.138a: "You may
 * cast this card from your graveyard by paying [cost] rather than paying its mana cost", the cost here being
 * mana and the exile of other cards of the graveyard). The cost is plain mana and the exile one count of
 * other cards from your graveyard written as a word, one to nine (the real line has "five"; "one" takes the
 * singular noun, SYNTHETIC, no real line is known); the line ends with a period. Any other component of the cost,
 * a digit, X or ten cards stays unread. The count is the one parameter. 30 cards of the owner's run.
 */
export const KEYWORD_ESCAPE = defineRule<readonly IrKeyword[]>({
  id: 'keyword.escape',
  family: 'keyword',
  leading: [],
  cites: ['CR 702.138a (Escape)', 'CR 118.9 (Alternative Costs)', 'CR 601.2b (Casting Spells)'],
  examples: [
    'Escape—{G}{G}{U}{U}, Exile five other cards from your graveyard.',
    'Escape—{B}{B}, Exile three other cards from your graveyard.',
    'Escape—{3}{R}, Exile two other cards from your graveyard.',
    'Escape—{2}{B}, Exile one other card from your graveyard.',
    'escape—{R}{R}, exile eight other cards from your graveyard.',
  ],
  rejects: [
    'Escape',
    'Escape—{B}{B}',
    'Escape—{B}{B}, Exile three other cards from your graveyard',
    'Escape—{B}{B}, Exile 3 other cards from your graveyard.',
    'Escape—{X}{B}, Exile three other cards from your graveyard.',
    'Escape—{B/G}, Exile three other cards from your graveyard.',
    'Escape—Pay 3 life, Exile three other cards from your graveyard.',
    'Escape—{B}{B}, Pay 3 life, Exile three other cards from your graveyard.',
    'Escape—{B}{B}, Exile ten other cards from your graveyard.',
    'Escape—{B}{B}, Exile zero other cards from your graveyard.',
    'Escape—{B}{B}, Exile three cards from your graveyard.',
    'Escape—{B}{B}, Exile three other creature cards from your graveyard.',
    'Escape—{B}{B}, Exile one other cards from your graveyard.',
    'Escape—{B}{B}, Exile three other card from your graveyard.',
    'Escaped—{B}{B}, Exile three other cards from your graveyard.',
  ],
  parse: map(
    node<{ cost: IrCost; count: { value: number; span: Span } }, IrKeyword>(
      'keyword.escape',
      map(
        sequence(literal('escape—'), MANA_COST, literal(', exile '), spanned(ESCAPE_CARDS)),
        ([, cost, , count]) => ({ cost, count }),
      ),
      ({ cost, count }) => ({
        kind: 'keyword',
        name: 'escape',
        params: [{ kind: 'number', value: count.value, span: count.span }],
        cost: [cost],
      }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const ALT_COST_KEYWORD_RULES = [
  KEYWORD_OVERLOAD,
  KEYWORD_EVOKE,
  KEYWORD_DASH,
  KEYWORD_SPECTACLE,
  KEYWORD_UNEARTH,
  KEYWORD_ENCORE,
  KEYWORD_ETERNALIZE,
  KEYWORD_ESCAPE,
];
