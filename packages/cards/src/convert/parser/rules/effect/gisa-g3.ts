/**
 * Effect rules of group 3 of the Gisa deck (issue 41, D-484 and later): "Each opponent chooses a permanent they control of each permanent type and sacrifices the rest."
 * (Liliana, Dreadhorde General) and the other words of the sacrifice cards of the group.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrArg } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

/** The six permanent types, in the order CR 110.4 gives them. */
const PERMANENT_TYPES = [
  'artifact',
  'battle',
  'creature',
  'enchantment',
  'land',
  'planeswalker',
] as const;

/**
 * `effect.each-opponent-choose-keep`: "each opponent chooses a permanent they control of each permanent type and sacrifices the rest" (Liliana, Dreadhorde General; CR 608.2d,
 * 701.21a, 101.4, 110.4: each opponent chooses, among the permanents they control, one of each of the six permanent types, and sacrifices every other permanent they control,
 * lands included). The engine's `sparePermanents` with the six types and `own` for each opponent. Not read: another player word (a choice by each player, by you), another set
 * of types, one type, "the rest" with other words, a second instruction on the sentence.
 */
export const EFFECT_EACH_OPPONENT_CHOOSE_KEEP = defineRule<Clauses>({
  id: 'effect.each-opponent-choose-keep',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.21a (Sacrifice)',
    'CR 101.4 (Handling Simultaneous Decisions)',
    'CR 110.4 (Permanents)',
  ],
  examples: [
    'each opponent chooses a permanent they control of each permanent type and sacrifices the rest',
    'Each opponent chooses a permanent they control of each permanent type and sacrifices the rest',
  ],
  rejects: [
    'each opponent chooses a permanent they control of each permanent type',
    'each opponent chooses a permanent they control of each permanent type and sacrifices the rest and draws a card',
    'each player chooses a permanent they control of each permanent type and sacrifices the rest',
    'each opponent chooses a permanent you control of each permanent type and sacrifices the rest',
    'each opponent chooses a permanent they control of each card type and sacrifices the rest',
    'each opponent chooses a creature they control of each permanent type and sacrifices the rest',
    'each opponent chooses a permanent they control of each permanent type and sacrifices the others',
    'each opponent chooses two permanents they control of each permanent type and sacrifices the rest',
    'an opponent chooses a permanent they control of each permanent type and sacrifices the rest',
    'each opponent chooses a permanent they control of each permanent type and sacrifices the rest.',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.each-opponent-choose-keep';
    const r = spanned(
      pattern(
        /each opponent chooses a permanent they control of each permanent type and sacrifices the rest(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    const span = r.value.span;
    const types: IrArg = {
      kind: 'typeList',
      subtypes: [],
      cardTypes: [...PERMANENT_TYPES],
      span,
      rule: id,
    };
    return {
      ok: true,
      value: [
        makeClause(id, 'sparePermanents', { types, eachOpponent: flag(id, true, span) }, span),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.you-add-mana`: "you add {B}{B}" (CR 106.1, 106.4: the player adds mana to their mana pool; "you add" and "add" say the same, the explicit "You" being what Oracle text
 * writes when the instruction follows another one of the ability, as in "Any number of target players each lose 2 life and sacrifice a creature of their choice. You add {B}{B} and
 * draw a card."). Fixed mana only: the words after "add" are those of `effect.add-mana`, and the lowering refuses what a spell or ability has no way to choose. Not read: another
 * player ("target player adds {B}", which is `effect.player-adds-mana`'s phrase for one mana of any color), "you may add".
 */
export const EFFECT_YOU_ADD_MANA = defineRule<Clauses>({
  id: 'effect.you-add-mana',
  family: 'effect',
  leading: ['you'],
  cites: ['CR 106.1 (Mana)', 'CR 106.4 (Mana)', 'CR 605.1a (Mana Abilities)'],
  examples: ['you add {B}{B}', 'You add {G}', 'you add {R}{G}'],
  rejects: [
    'you add',
    'you add one mana of any color',
    'you add {B} or {R}',
    'you add {X}',
    'you adds {B}{B}',
    'you may add {B}{B}',
    'target player adds {B}{B}',
    'each player adds {B}{B}',
    'you add {B}{B} for each creature you control',
    'add {B}{B}',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.you-add-mana';
    const r = sequence(literal('you '), family<Clauses>('effect', { only: ['effect.add-mana'] }))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    const [, clauses] = r.value;
    const [clause] = clauses;
    const mana = clause?.args.mana;
    // Fixed symbols only, once: no choice of colors and no "for each".
    if (
      clauses.length !== 1 ||
      clause === undefined ||
      mana?.kind !== 'manaSpec' ||
      mana.what.kind !== 'symbols' ||
      clause.args.times !== undefined
    ) {
      return fail(ctx, pos);
    }
    return {
      ok: true,
      value: [{ ...clause, rule: id, span: { start: pos, end: r.pos } }],
      pos: r.pos,
    };
  },
});

/**
 * `effect.each-player-counter-keep-cant-attack`: "each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or
 * planeswalkers you control for as long as it has a vow counter on it" (Promise of Loyalty; CR 608.2d, 701.21a, 122.1, 508.1a, 611.2b: each player chooses one creature they control,
 * which gets the counter, and sacrifices their other creatures; the creatures that got the counter can't attack the controller of the spell or their planeswalkers while they keep
 * it). Two sentences that `splitSentences` keeps together. The engine's `sparePermanents` of the creature type with `own`, `typesOnly`, the counter and `cantAttackYou`. Not read:
 * another player word, another type, another counter in the second sentence, a different restriction or duration, "the rest" without the second sentence.
 */
export const EFFECT_EACH_PLAYER_COUNTER_KEEP_CANT_ATTACK = defineRule<Clauses>({
  id: 'effect.each-player-counter-keep-cant-attack',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.21a (Sacrifice)',
    'CR 122.1 (Counters)',
    'CR 508.1a (Declare Attackers Step)',
    'CR 611.2b (Continuous Effects from Resolving Spells and Abilities)',
  ],
  examples: [
    "each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it",
  ],
  rejects: [
    'each player puts a vow counter on a creature they control and sacrifices the rest',
    "each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you for as long as it has a vow counter on it",
    "each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control for as long as it has a oath counter on it",
    "each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control",
    "each opponent puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it",
    "each player puts a vow counter on a land they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it",
    "each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't block you or planeswalkers you control for as long as it has a vow counter on it",
    "each player puts a vow counter on a creature they control and sacrifices the others. Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.each-player-counter-keep-cant-attack';
    const r = spanned(
      pattern(
        /each player puts an? ([a-z]+) counter on a creature they control and sacrifices the rest\. Each of those creatures can['’]t attack you or planeswalkers you control for as long as it has an? \1 counter on it(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    const span = r.value.span;
    const types: IrArg = {
      kind: 'typeList',
      subtypes: [],
      cardTypes: ['creature'],
      span,
      rule: id,
    };
    const counter: IrArg = {
      kind: 'counterSpec',
      name: (r.value.value[1] ?? '').toLowerCase(),
      span,
      rule: id,
    };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'sparePermanents',
          { types, eachPlayer: flag(id, true, span), counter },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const GISA_G3_EFFECT_RULES = [
  EFFECT_EACH_OPPONENT_CHOOSE_KEEP,
  EFFECT_EACH_PLAYER_COUNTER_KEEP_CANT_ATTACK,
  EFFECT_YOU_ADD_MANA,
].map(quietly);
