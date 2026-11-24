import { choice, fail, literal, map, optional, pattern, sequence } from '../../combinators';
import type { IrAmount, IrArg, IrCounterSpec, IrKeywordArg, IrTypeList } from '../../ir/types';
import { positiveCount } from '../amount/index';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const RULE = 'effect.next-spell-modifier';
const BOUNDARY = '(?![\\p{L}\\p{N}])';

/** The generic mana taken off: "{1}", "{2}", or "{X}" with the definition of X after it. */
const GENERIC = map(
  spanned(pattern(/\{([1-9]\d*)\}/)),
  ({ value, span }): IrAmount => ({ kind: 'number', value: Number(value[1]), span }),
);

/** "the next instant or sorcery spell you cast this turn": the types the spell has, one or the other. */
const SPELL_TYPES = choice(
  map(literal('instant or sorcery'), () => ['instant', 'sorcery'] as readonly string[]),
  map(literal('instant'), () => ['instant'] as readonly string[]),
  map(literal('sorcery'), () => ['sorcery'] as readonly string[]),
);

type Change = { readonly keyword: string } | { readonly amount: IrAmount };

const KEYWORD = pattern(new RegExp(`(storm|cascade)${BOUNDARY}`, 'iu'));

function typeList(cardTypes: readonly string[], span: { start: number; end: number }): IrTypeList {
  return { kind: 'typeList', subtypes: [], cardTypes, span, rule: RULE } as IrTypeList;
}

function keywordArg(name: string, span: { start: number; end: number }): IrKeywordArg {
  return { kind: 'keywordName', name: name.toLowerCase(), span, rule: RULE };
}

/**
 * `effect.next-spell-modifier`: "the next instant or sorcery spell you cast this turn costs {2} less to cast", "... costs {X} less to cast, where X is the number of Wizards you control as
 * this ability resolves" (Kaza, Roil Chaser, CR 601.2f, 118.7a), "... has storm" (Crackling Spellslinger, CR 702.40a) and "the next instant spell and the next sorcery spell you cast this
 * turn each have cascade" (Smoldering Stagecoach, CR 702.85a). The engine's `nextSpellModifier`: the next spell of its controller that has one of the card types is changed, once, until end of
 * turn. Not read: another keyword, another card type ("the next creature spell"), "the next spell" with no type, another player's spells, "this turn" left out, a reduction of colored mana.
 */
export const EFFECT_NEXT_SPELL_MODIFIER = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['the'],
  cites: [
    'CR 601.2f (Casting Spells)',
    'CR 118.7a (Costs)',
    'CR 702.40a (Storm)',
    'CR 702.85a (Cascade)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'the next instant or sorcery spell you cast this turn costs {2} less to cast',
    'the next instant or sorcery spell you cast this turn costs {X} less to cast, where X is the number of Wizards you control as this ability resolves',
    'the next instant or sorcery spell you cast this turn has storm',
    'the next instant spell you cast this turn has cascade',
    'the next instant spell and the next sorcery spell you cast this turn each have cascade',
  ],
  rejects: [
    'the next creature spell you cast this turn costs {2} less to cast',
    'the next spell you cast this turn costs {2} less to cast',
    'the next instant or sorcery spell you cast costs {2} less to cast',
    'the next instant or sorcery spell you cast this turn has flying',
    'the next instant or sorcery spell an opponent casts this turn has storm',
    'the next instant or sorcery spell you cast this turn costs {R} less to cast',
    'the next instant or sorcery spell you cast this turn costs {X} less to cast',
    'the next instant spell and the next sorcery spell you cast this turn each have storm and cascade',
    'the next instant spell and the next sorcery spell you cast this turn has cascade',
  ],
  parse: (ctx, pos) => {
    // Nothing is read, and no position is reached, unless the words are those of this rule.
    if (!/^the next (?:instant|sorcery)/iu.test(ctx.text.slice(pos, pos + 20)))
      return fail(ctx, pos);
    const both = spanned(
      sequence(
        literal('the next instant spell and the next sorcery spell you cast this turn each have '),
        KEYWORD,
      ),
    )(ctx, pos);
    if (both.ok) {
      const { span } = both.value;
      const name = both.value.value[1][1] ?? '';
      const make = (type: string): Clauses[number] =>
        makeClause(
          RULE,
          'nextSpellModifier',
          { spells: typeList([type], span), keyword: keywordArg(name, span) },
          span,
        );
      return { ok: true, value: [make('instant'), make('sorcery')], pos: both.pos };
    }
    const one = spanned(
      sequence(
        literal('the next '),
        SPELL_TYPES,
        literal(' spell you cast this turn '),
        choice(
          map(sequence(literal('has '), KEYWORD), ([, k]): Change => ({ keyword: k[1] ?? '' })),
          map(
            sequence(literal('costs '), GENERIC, literal(' less to cast')),
            ([, amount]): Change => ({ amount }),
          ),
          map(
            sequence(
              literal('costs {X} less to cast, '),
              family<IrAmount>('amount', { only: ['amount.where-x'] }),
              optional(literal(' as this ability resolves'), null),
            ),
            ([, amount]): Change => ({ amount }),
          ),
        ),
      ),
    )(ctx, pos);
    if (!one.ok) return one;
    const { span } = one.value;
    const [, types, , change] = one.value.value;
    const args: Record<string, IrArg> = { spells: typeList(types, span) };
    if ('keyword' in change) args.keyword = keywordArg(change.keyword, span);
    else args.amount = change.amount;
    return { ok: true, value: [makeClause(RULE, 'nextSpellModifier', args, span)], pos: one.pos };
  },
});

const PAY_LIFE_RULE = 'effect.next-spell-pay-life';

/**
 * `effect.next-spell-pay-life`: "Rather than pay the mana cost of the next spell you cast this turn, you may pay life equal to that spell's mana value" (Marshland Bloodcaster, CR 118.9,
 * 601.2b, 202.3e, 119.4, 611.2a). The engine's `nextSpellPayLife`: until end of turn, the next spell of its controller may be cast by paying life equal to its mana value rather than its mana
 * cost, and the next spell cast uses the permission up. Not read: another kind of spell ("the next creature spell"), a spell that is not the next one, another player's spells, a fixed
 * amount of life, "this turn" left out, the permission as an obligation ("you pay life").
 */
export const EFFECT_NEXT_SPELL_PAY_LIFE = defineRule<Clauses>({
  id: PAY_LIFE_RULE,
  family: 'effect',
  leading: ['rather'],
  cites: [
    'CR 118.9 (Alternative Costs)',
    'CR 601.2b (Casting Spells)',
    'CR 202.3e (Mana Value)',
    'CR 119.4 (Life)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    "rather than pay the mana cost of the next spell you cast this turn, you may pay life equal to that spell's mana value",
  ],
  rejects: [
    "rather than pay the mana cost of the next creature spell you cast this turn, you may pay life equal to that spell's mana value",
    "rather than pay the mana cost of the next spell you cast, you may pay life equal to that spell's mana value",
    "rather than pay the mana cost of the next spell an opponent casts this turn, they may pay life equal to that spell's mana value",
    'rather than pay the mana cost of the next spell you cast this turn, you may pay 3 life',
    "rather than pay the mana cost of the next spell you cast this turn, you pay life equal to that spell's mana value",
  ],
  parse: (ctx, pos) => {
    const read = spanned(
      literal(
        "rather than pay the mana cost of the next spell you cast this turn, you may pay life equal to that spell's mana value",
      ),
    )(ctx, pos);
    if (!read.ok) return read;
    return {
      ok: true,
      value: [makeClause(PAY_LIFE_RULE, 'nextSpellPayLife', {}, read.value.span)],
      pos: read.pos,
    };
  },
});

const ENTERS_COUNTERS_RULE = 'effect.spell-enters-with-counters';

/**
 * `effect.spell-enters-with-counters`: "that creature enters with two additional +1/+1 counters on it", what a delayed trigger of "When you next cast a creature spell this turn, ..." does to the
 * spell cast (Yuna, Grand Summoner, CR 614.1c, 122.6, 603.7). The engine's `spellEntersWithCounters`, the body of a `delayedCast`. Not read: "enters with" counters without "additional" (the
 * entering of the card itself), another creature ("target creature"), a count of zero, no counters ("enters with two additional counters"), a missing "on it".
 */
export const EFFECT_SPELL_ENTERS_WITH_COUNTERS = defineRule<Clauses>({
  id: ENTERS_COUNTERS_RULE,
  family: 'effect',
  leading: ['that'],
  cites: ['CR 614.1c (Replacement Effects)', 'CR 122.6 (Counters)', 'CR 603.7 (Delayed Triggered Abilities)'],
  examples: [
    'that creature enters with two additional +1/+1 counters on it',
    'that creature enters with an additional +1/+1 counter on it',
  ],
  rejects: [
    'that creature enters with two +1/+1 counters on it',
    'target creature enters with two additional +1/+1 counters on it',
    'that creature enters with two additional counters on it',
    'that creature enters with two additional +1/+1 counters',
    'that creature enters with additional +1/+1 counters on it',
    'that creature enters tapped',
  ],
  parse: (ctx, pos) => {
    const head = literal('that creature enters with ')(ctx, pos);
    if (!head.ok) return head;
    const count = positiveCount(ctx, head.pos);
    if (!count.ok) return fail(ctx, pos);
    const counter = pattern(
      / additional ([+-]\d+\/[+-]\d+|[a-z]+) counters? on it(?![\p{L}\p{N}])/iu,
    )(ctx, count.pos);
    if (!counter.ok) return fail(ctx, pos);
    const span = { start: pos, end: counter.pos };
    const spec: IrCounterSpec = {
      kind: 'counterSpec',
      name: (counter.value[1] ?? '').toLowerCase(),
      span: { start: count.pos, end: counter.pos },
      rule: ENTERS_COUNTERS_RULE,
    };
    return {
      ok: true,
      value: [
        makeClause(
          ENTERS_COUNTERS_RULE,
          'spellEntersWithCounters',
          {
            counter: spec,
            count: { kind: 'number', value: count.value, span: { start: head.pos, end: count.pos } },
          },
          span,
        ),
      ],
      pos: counter.pos,
    };
  },
});

export const NEXT_SPELL_EFFECT_RULES = [
  EFFECT_NEXT_SPELL_MODIFIER,
  EFFECT_NEXT_SPELL_PAY_LIFE,
  EFFECT_SPELL_ENTERS_WITH_COUNTERS,
];
