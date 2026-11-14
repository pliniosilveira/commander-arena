/**
 * The keyword lines of ward (CR 702.21a) and crew (CR 702.122a). Both carry their operand in the
 * IR (a cost, a number); the engine expands them into the triggered and activated abilities the
 * rules define (`rules/derive-keywords.ts`), so the lowering only builds the keyword node.
 */
import {
  literal,
  map,
  optional,
  type Parser,
  pattern,
  quiet,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrAmount, IrCost, IrKeyword } from '../../ir/types';
import { defineRule, family, node, spanned } from '../registry';

const WARD_COST = family<IrCost>('cost', { only: ['cost.mana'] });
const WARD_DASH_COST = family<IrCost>('cost', {
  only: ['cost.pay-life', 'cost.sacrifice', 'cost.discard'],
});

/** The ward keyword node: `cost` is the one cost of the keyword. */
const wardNode = (rule: string, start: number, end: number, cost: IrCost): IrKeyword => ({
  kind: 'keyword',
  name: 'ward',
  params: [],
  cost: [cost],
  span: { start, end },
  rule,
});

/**
 * "Ward {2}" as a keyword node carrying the id of the rule that reads it: `keyword.ward` for a line
 * of its own, `keyword.line` when it ends a list of keywords ("Flying, ward {2}").
 */
export function plainWard(rule: string): Parser<IrKeyword> {
  return (ctx, pos) => {
    const r = sequence(literal('ward '), WARD_COST)(ctx, pos);
    return r.ok ? { ok: true, value: wardNode(rule, pos, r.pos, r.value[1]), pos: r.pos } : r;
  };
}

const WARD_LINE: Parser<readonly IrKeyword[]> = (ctx, pos) => {
  const plain = plainWard('keyword.ward')(ctx, pos);
  if (plain.ok) return { ok: true, value: [plain.value], pos: plain.pos };
  // D-467 (CR 702.21a, 118.1): a mana cost and a payment of life, "Ward—{2}, Pay 2 life."
  const both = quiet(
    sequence(
      literal('ward—'),
      WARD_COST,
      literal(', '),
      family<IrCost>('cost', { only: ['cost.pay-life'] }),
      optional(literal('.'), null),
    ),
  )(ctx, pos);
  if (both.ok) {
    const [, mana, , life] = both.value;
    return {
      ok: true,
      value: [{ ...wardNode('keyword.ward', pos, both.pos, mana), cost: [mana, life] }],
      pos: both.pos,
    };
  }
  const dashed = sequence(literal('ward—'), WARD_DASH_COST, optional(literal('.'), null))(ctx, pos);
  if (!dashed.ok) return dashed;
  return {
    ok: true,
    value: [wardNode('keyword.ward', pos, dashed.pos, dashed.value[1])],
    pos: dashed.pos,
  };
};

/**
 * `keyword.ward`: "Ward {2}", "Ward—Pay 3 life.", "Ward—Sacrifice a permanent." and "Ward—Discard a
 * card." (CR 702.21a:
 * "Whenever this permanent becomes the target of a spell or ability an opponent controls, counter
 * that spell or ability unless that player pays [cost]"). The cost is a plain mana cost, or after
 * an em dash a payment of life or a sacrifice; the dash form ends with a period like the other dash
 * keywords (Kicker, Flashback; the real "Ward—Pay N life." line of the backlog has it, the plain
 * `{M}` form has none). The engine pays mana and life when the ward ability resolves, so the
 * lowering builds the keyword for a sacrifice too and `validateCard` says the engine does not pay
 * it; the discard is run since D-095 ("discard a card" costs of Ward and of activated abilities). "Ward
 * {X}" (CR 702.21b) and hybrid costs stay unread.
 * "Flying, ward {2}" (22 cards in the backlog) is read by `keyword.line`, which takes a ward
 * with a plain mana cost at the end of its list.
 */
export const KEYWORD_WARD = defineRule<readonly IrKeyword[]>({
  id: 'keyword.ward',
  family: 'keyword',
  // D-467: "Ward—{2}, Pay 2 life." starts with its cost, whose words vary: tried at every keyword line (it fails at its first literal), as `keyword.equip` is.
  leading: [],
  cites: ['CR 702.21a (Ward)', 'CR 702.21b (Ward)', 'CR 118.1 (Costs)'],
  examples: [
    'Ward {2}',
    'Ward {W}',
    'Ward {1}{U}',
    'Ward—Pay 2 life',
    'Ward—Pay 3 life.',
    'Ward—Sacrifice a permanent.',
    'Ward—Discard a card.',
    'Ward—Discard two cards.',
    'ward {1}',
    // D-467 (CR 702.21a, 118.1): the two costs the engine pays for a ward ability, together.
    'Ward—{2}, Pay 2 life.',
    'Ward—{1}{U}, Pay 3 life',
  ],
  rejects: [
    'Ward',
    'Ward {X}',
    'Ward {R/W}',
    'Ward {2}.',
    'Ward—Pay 0 life.',
    'Ward—Pay 3 life..',
    'Ward—Discard a creature card.',
    'Ward—Discard your hand.',
    'Ward—Discard this card.',
    'Ward—{2}, Pay 0 life.',
    'Ward—{2}, Pay 2 life, Pay 1 life',
    'Ward—{2}, Pay 2 life..',
    'Ward—Pay 2 life, {2}',
    'Ward—{2}, Sacrifice a creature',
    'Ward—{2}, Discard a card.',
    'Ward—{2}',
    'Ward {2}, Pay 2 life',
    'Ward {2}, flying',
    'Ward {2}, ward {1}',
    'Ward {2} {1}',
    'Flying, ward {2}',
    'Flying, ward',
    'Flying, ward {X}',
    'Flying, ward—Pay 2 life.',
    'Flying, ward—Discard a card.',
    'Flying ward {2}',
    'Flying, protection from red',
    'Flying,',
  ],
  parse: WARD_LINE,
});

/** A whole number of at least one, written in digits as Oracle text does ("Crew 3"). */
export const CREW_POWER: Parser<IrAmount> = map(
  spanned(
    satisfy(
      map(pattern(/[1-9]\d*(?![\p{L}\p{N}])/u), (m) => Number(m[0])),
      Number.isSafeInteger,
    ),
  ),
  ({ value, span }): IrAmount => ({ kind: 'number', value, span }),
);

/**
 * `keyword.crew`: "Crew 3" (CR 702.122a: "Tap any number of other untapped creatures you control
 * with total power N or greater: This permanent becomes an artifact creature until end of turn").
 * N is a positive whole number in digits; "Crew X" and "Crew 0" are not read. A face must be a
 * Vehicle for the lowering to build it (CR 301.7: the ability is the Vehicle's).
 */
export const KEYWORD_CREW = defineRule<readonly IrKeyword[]>({
  id: 'keyword.crew',
  family: 'keyword',
  leading: ['crew'],
  cites: ['CR 702.122a (Crew)', 'CR 301.7 (Artifacts)'],
  examples: ['Crew 1', 'Crew 3', 'Crew 10', 'crew 2'],
  rejects: [
    'Crew',
    'Crew 0',
    'Crew X',
    'Crew two',
    'Crew 1.',
    'Crew 1, flying',
    'Crew 01',
    'Crew 1 2',
    'Crew 2, crew 3',
    'Crewed 1',
  ],
  parse: map(
    node<IrAmount, IrKeyword>(
      'keyword.crew',
      map(sequence(literal('crew '), CREW_POWER), ([, power]) => power),
      (power) => ({ kind: 'keyword', name: 'crew', params: [power] }),
    ),
    (keyword): readonly IrKeyword[] => [keyword],
  ),
});

export const WARD_CREW_RULES = [KEYWORD_WARD, KEYWORD_CREW];
