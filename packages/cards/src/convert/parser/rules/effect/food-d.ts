/**
 * Effect rules of group D of the Food and Fellowship deck (Lobelia, Defender of Bag End): the cards of each opponent's library exiled face down and remembered by the permanent, and the permission to play
 * one of them without paying its mana cost. The engine's `exileTop` (`linked`, `faceDown`, `lookAt`) and `mayPlay` of `linkedExile` with `free` (`rules/impulse.ts`).
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrDuration, IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.look-exile-top-each-opponent`: "look at the top card of each opponent's library and exile those cards face down" (CR 701.13, 406.3, 607.2a: the controller looks at the top card of every
 * opponent's library and exiles each face down; the permanent remembers the cards, and only the controller may go on looking at them). The engine's `exileTop` with `from` `eachOpponent`, `faceDown`,
 * `linked` and `lookAt`; only in an ability of a permanent (the lowering requires it). Not read: another library ("target opponent's", "your"), more than the top card, "each player's", the cards
 * face up, a trailing instruction in the same sentence.
 */
export const EFFECT_LOOK_EXILE_TOP_EACH_OPPONENT = defineRule<Clauses>({
  id: 'effect.look-exile-top-each-opponent',
  family: 'effect',
  leading: ['look'],
  cites: [
    'CR 701.13 (Exile)',
    'CR 406.3 (Exile)',
    'CR 607.2a (Linked Abilities)',
    'CR 401.1 (Library)',
  ],
  examples: [
    "look at the top card of each opponent's library and exile those cards face down",
    'look at the top card of each opponent’s library and exile those cards face down',
  ],
  rejects: [
    "look at the top card of each opponent's library and exile those cards",
    "look at the top card of target opponent's library and exile that card face down",
    'look at the top card of your library and exile it face down',
    "look at the top card of each player's library and exile those cards face down",
    "look at the top two cards of each opponent's library and exile those cards face down",
    "look at the top card of each opponent's library and exile those cards face down and draw a card",
    "look at the top card of each opponent's library and exile those cards face down, then",
    "look at the top card of each opponent's library",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.look-exile-top-each-opponent';
    const head = literal('look at the top card of ')(ctx, pos);
    if (!head.ok) return head;
    const owner = sequence(
      family<IrNoun>('noun', { only: ['noun.player'] }),
      pattern(
        /['’]s library and exile those cards face down(?![\p{L}\p{N}])(?!,| and\b| then\b)/iu,
      ),
    )(ctx, head.pos);
    if (!owner.ok) return owner;
    const [who] = owner.value;
    if (who.det !== 'eachOpponent') return fail(ctx, pos);
    const span = { start: pos, end: owner.pos };
    return {
      ok: true,
      value: [
        makeClause(
          id,
          'exileTop',
          {
            count: { kind: 'number', value: 1, span },
            from: who,
            faceDown: flag(id, true, span),
            linked: flag(id, true, span),
            lookAt: flag(id, true, span),
          },
          span,
        ),
      ],
      pos: owner.pos,
    };
  },
});

/**
 * `effect.may-play-exiled-with-self-free`: "until end of turn, you may play a card exiled with ~ without paying its mana cost" (CR 607.2a: the cards the permanent exiled with its linked ability;
 * CR 601.2, 305.1, 118.9, 611.2a: until the end of the turn the player may cast one at the timing of its type, for no mana cost, or play it when it is a land). The engine's `mayPlay` of
 * `linkedExile`, `free`. Not read: another length, no length, "cast", a card exiled with another permanent ("exiled with it"), "those cards", "each card", paying its cost.
 */
export const EFFECT_MAY_PLAY_EXILED_WITH_SELF_FREE = defineRule<Clauses>({
  id: 'effect.may-play-exiled-with-self-free',
  family: 'effect',
  leading: ['until', 'you', 'play'],
  cites: [
    'CR 607.2a (Linked Abilities)',
    'CR 601.2 (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 118.9 (Alternative Costs)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'until end of turn, you may play a card exiled with ~ without paying its mana cost',
    'you may play a card exiled with ~ this turn without paying its mana cost',
  ],
  rejects: [
    'you may play a card exiled with ~ without paying its mana cost',
    'until end of turn, you may cast a card exiled with ~ without paying its mana cost',
    'until end of turn, you may play a card exiled with ~',
    'until end of turn, you may play a card exiled with it without paying its mana cost',
    'until end of turn, you may play cards exiled with ~ without paying their mana costs',
    'until your next turn, you may play a card exiled with ~ without paying its mana cost',
    'until end of turn, you may play a card exiled with ~ without paying its mana cost and draw a card',
    'until end of turn, you may play a card exiled with ~ this turn without paying its mana cost',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.may-play-exiled-with-self-free';
    const lead = spanned(pattern(/until end of turn, /iu))(ctx, pos);
    let at = pos;
    let span = { start: pos, end: pos };
    let ahead = false;
    if (lead.ok) {
      at = lead.pos;
      span = lead.value.span;
      ahead = true;
    }
    const body = pattern(
      new RegExp(
        `(?:you may )?play a card exiled with ~( this turn)? without paying its mana cost${BOUNDARY}(?!,| and\\b| then\\b)`,
        'iu',
      ),
    )(ctx, at);
    if (!body.ok) return body;
    const hasTrail = body.value[1] !== undefined;
    // Exactly one length: said first or said last.
    if (ahead === hasTrail) return fail(ctx, pos);
    const whole = { start: pos, end: body.pos };
    const duration: IrDuration = {
      kind: 'duration',
      scope: 'untilEndOfTurn',
      span: ahead ? span : whole,
      rule: id,
    };
    return {
      ok: true,
      value: [{ ...makeClause(id, 'mayPlayLinked', {}, whole), duration }],
      pos: body.pos,
    };
  },
});

/** Quiet: they start like other rules ("look at", "until"), and must leave the diagnostics of the lines they do not read where they were. */
export const FOOD_D_EFFECT_RULES = [
  quietly(EFFECT_LOOK_EXILE_TOP_EACH_OPPONENT),
  quietly(EFFECT_MAY_PLAY_EXILED_WITH_SELF_FREE),
];
