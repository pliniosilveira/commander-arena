/**
 * The keyword lines that change how a spell is cast: Kicker (CR 702.33) and Flashback (CR 702.34).
 * Each carries its cost in the IR; the engine runs the keyword itself (the kicker question before
 * targets, the flashback cast from the graveyard), so the lowering only builds the keyword node.
 *
 * Multikicker (CR 702.33c) is read with a plain mana cost and lowered since stage P17 (the engine
 * asks how many times to pay it, D-110). The forms the engine cannot run are still read, as their
 * own rules or as costs the lowering refuses, so the report says "the grammar reads this, but the
 * engine cannot run it yet" and names the rule: "Kicker {A} and/or {B}" (CR 702.33b, two kicker
 * costs), and a cost other than mana (flashback) or mana and life (kicker), written after an em
 * dash. Those have no `FeatureRef`, so `needs` stays empty and the rule id is the diagnostic.
 */
import {
  fail,
  literal,
  map,
  optional,
  type Parser,
  separatedBy1,
  sequence,
} from '../../combinators';
import type { IrCost, IrKeyword } from '../../ir/types';
import { defineRule, family, node } from '../registry';

const MANA_COST = family<IrCost>('cost', { only: ['cost.mana'] });

/** "Kicker—Pay 3 life", "Flashback—{1}{U}, Pay 3 life": one or more costs after an em dash. */
const DASH_COSTS = separatedBy1(family<IrCost>('cost'), literal(', '));

function keyword(
  id: string,
  name: string,
  cost: Parser<readonly IrCost[]>,
): Parser<readonly IrKeyword[]> {
  return map(
    node<readonly IrCost[], IrKeyword>(id, cost, (costs) => ({
      kind: 'keyword',
      name,
      params: [],
      cost: costs,
    })),
    (k): readonly IrKeyword[] => [k],
  );
}

/** "<word> {M}" (a plain mana cost) or "<word>—<costs>". */
function costed(word: string): Parser<readonly IrCost[]> {
  const plain = map(sequence(literal(`${word} `), MANA_COST), ([, cost]): readonly IrCost[] => [
    cost,
  ]);
  // A keyword whose cost is an action ends like a sentence: "Flashback—Sacrifice three creatures."
  // (the backlog's real text), where "Flashback {2}{R}" has no period.
  const dashed = map(
    sequence(literal(`${word}—`), DASH_COSTS, optional(literal('.'), null)),
    ([, costs]) => costs,
  );
  return (ctx, pos) => {
    const r = plain(ctx, pos);
    // "Kicker {W} and/or {B}" is `keyword.kicker-and-or`, so the two never both read a line.
    if (r.ok && ctx.text.startsWith(' and/or ', r.pos)) return fail(ctx, r.pos);
    return r.ok ? r : dashed(ctx, pos);
  };
}

/**
 * `keyword.kicker-and-or`: "Kicker {W} and/or {B}" means "Kicker {W}, kicker {B}" (CR 702.33b): two
 * kicker costs, each paid or not, which the engine does not model (one kicker cost per card). Read
 * so that it is refused by name. `keyword.kicker` refuses a line that goes on with " and/or", so
 * the order of the two does not matter.
 */
export const KEYWORD_KICKER_AND_OR = defineRule<readonly IrKeyword[]>({
  id: 'keyword.kicker-and-or',
  family: 'keyword',
  leading: ['kicker'],
  cites: ['CR 702.33b (Kicker)', 'CR 702.33f (Kicker)'],
  examples: ['Kicker {W} and/or {B}', 'Kicker {1}{G} and/or {2}{U}', 'kicker {R} and/or {G}'],
  rejects: [
    'Kicker {W}',
    'Kicker {W} and/or',
    'Kicker {W} and {B}',
    'Kicker {W} and/or {B} and/or {R}',
    'Kicker {W} and/or {X}',
    'Kicker {W} and/or {B}.',
  ],
  parse: keyword(
    'keyword.kicker-and-or',
    'kicker and/or',
    map(
      sequence(literal('kicker '), MANA_COST, literal(' and/or '), MANA_COST),
      ([, first, , second]): readonly IrCost[] => [first, second],
    ),
  ),
});

/**
 * `keyword.multikicker`: "Multikicker {1}{G}" (CR 702.33c): the kicker cost may be paid any number
 * of times. A plain mana cost, as the 19 cards of the owner's run write it ("Multikicker {2}"); the
 * engine also pays a cost of life for it (D-110), but no printed card is known to have one, so
 * "Multikicker—Pay 2 life" stays unread (UNVERIFIED: no network to look). X and hybrid costs are
 * not read.
 */
export const KEYWORD_MULTIKICKER = defineRule<readonly IrKeyword[]>({
  id: 'keyword.multikicker',
  family: 'keyword',
  leading: ['multikicker'],
  cites: ['CR 702.33c (Kicker)', 'CR 702.33d (Kicker)'],
  examples: ['Multikicker {1}', 'Multikicker {1}{G}', 'multikicker {B}'],
  rejects: [
    'Multikicker',
    'Multikicker {X}',
    'Multikicker {W/U}',
    'Multikicker—Pay 2 life',
    'Multikicker {1}.',
    'Kicker {1}',
    'Multikicker {1}, multikicker {2}',
  ],
  parse: keyword(
    'keyword.multikicker',
    'multikicker',
    map(sequence(literal('multikicker '), MANA_COST), ([, cost]): readonly IrCost[] => [cost]),
  ),
});

/**
 * `keyword.kicker`: "Kicker {2}" and "Kicker—Pay 3 life" (CR 702.33a: "You may pay an additional
 * [cost] as you cast this spell"). A cost after an em dash is any cost the grammar reads; the
 * lowering accepts mana and life, which the engine pays, and refuses the rest (a sacrifice, a
 * discard). "Kicker {X}" and hybrid costs are not read.
 */
export const KEYWORD_KICKER = defineRule<readonly IrKeyword[]>({
  id: 'keyword.kicker',
  family: 'keyword',
  leading: [],
  cites: ['CR 702.33a (Kicker)', 'CR 118.8 (Costs)', 'CR 601.2b (Casting Spells)'],
  examples: [
    'Kicker {2}',
    'Kicker {G}',
    'Kicker {1}{U}',
    'Kicker—Pay 3 life',
    'Kicker—Pay 3 life.',
    'Kicker—Sacrifice a creature',
    'kicker {3}',
  ],
  rejects: [
    'Kicker',
    'Kicker {X}',
    'Kicker {W/U}',
    'Kicker {2}.',
    'Kicker—Pay 0 life',
    'Kicker—',
    'Kicker—Pay 3 life..',
    'Kicker {W} and/or {B}',
    'Kicker {1}, kicker {2}',
    'Kicker {2} and flying',
    'Multikicker {2}',
  ],
  parse: keyword('keyword.kicker', 'kicker', costed('kicker')),
});

/**
 * `keyword.flashback`: "Flashback {2}{B}" (CR 702.34a: cast this card from your graveyard by
 * paying [cost] rather than its mana cost, and exile it instead of putting it anywhere else when
 * it leaves the stack). The engine pays a mana cost for it, so a cost after an em dash ("Flashback—
 * {1}{U}, Pay 3 life", "Flashback—Sacrifice a creature") is read and refused by the lowering.
 * "Flashback {X}" and hybrid costs are not read. The dash form ends with a period, as the corpus's
 * real text does ("Flashback—Sacrifice three creatures."); the plain form does not. Read on any face: on a card that is not an instant
 * or a sorcery the engine's own check says why it cannot work.
 */
export const KEYWORD_FLASHBACK = defineRule<readonly IrKeyword[]>({
  id: 'keyword.flashback',
  family: 'keyword',
  leading: [],
  cites: ['CR 702.34a (Flashback)', 'CR 118.9 (Costs)', 'CR 601.2b (Casting Spells)'],
  examples: [
    'Flashback {2}{B}',
    'Flashback {W}',
    'Flashback {4}{U}',
    'Flashback—Pay 3 life',
    'Flashback—{1}{U}, Pay 3 life.',
    'Flashback—Sacrifice three creatures.',
    'flashback {3}',
  ],
  rejects: [
    'Flashback',
    'Flashback {X}',
    'Flashback {W/U}',
    'Flashback {2}.',
    'Flashback—',
    'Flashback—Pay 0 life',
    'Flashback—Pay 3 life..',
    'Flashback {1}, flashback {2}',
    'Flashback {2}{R} and flying',
  ],
  parse: keyword('keyword.flashback', 'flashback', costed('flashback')),
});

export const CASTING_KEYWORD_RULES = [
  KEYWORD_KICKER,
  KEYWORD_KICKER_AND_OR,
  KEYWORD_MULTIKICKER,
  KEYWORD_FLASHBACK,
];
