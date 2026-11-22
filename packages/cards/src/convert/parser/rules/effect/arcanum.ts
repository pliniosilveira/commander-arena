/**
 * Effect rules of Urianger Augurelt: "Look at the top card of your library. You may exile it face down." (Draw Arcanum) and "Until end of turn, you may play cards exiled with ~. Spells you cast
 * this way cost {2} less to cast." (Play Arcanum). The engine's `lookAtTop` taking the card into exile face down (remembered by the permanent) and `mayPlay` of `linkedExile` with `lessGeneric`.
 */
import { pattern } from '../../combinators';
import type { IrDuration } from '../../ir/types';
import { defineRule, quietly } from '../registry';
import { number } from './dragons';
import { type Clauses, makeClause } from './operands';

const BOUNDARY = '(?![\\p{L}\\p{N}])';

/**
 * `effect.look-top-may-exile-face-down`: "look at the top card of your library. you may exile it face down" (CR 701.20 Reveal, 406.3, 607.2a: the controller looks at the top card of their
 * library and may exile it face down; the permanent whose ability it is remembers the card). The engine's `lookAtTop` of one card with the take `exileFaceDown` and the card staying on top
 * when it is not taken. Only in an ability of a permanent (the engine's validation asks for it). Not read: more than the top card, another library, the card face up, "you must", a trailing
 * instruction in the same sentence.
 */
export const EFFECT_LOOK_TOP_MAY_EXILE_FACE_DOWN = defineRule<Clauses>({
  id: 'effect.look-top-may-exile-face-down',
  family: 'effect',
  leading: ['look'],
  cites: [
    'CR 701.20 (Reveal)',
    'CR 406.3 (Exile)',
    'CR 607.2a (Linked Abilities)',
    'CR 401.1 (Library)',
  ],
  examples: ['look at the top card of your library. you may exile it face down'],
  rejects: [
    'look at the top card of your library. you may exile it',
    'look at the top card of your library. exile it face down',
    "look at the top card of target opponent's library. you may exile it face down",
    'look at the top two cards of your library. you may exile one of them face down',
    'look at the top card of your library. you may exile it face down and draw a card',
    'look at the top card of your library. you may exile it face down, then',
    'look at the top card of your library',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.look-top-may-exile-face-down';
    const body = pattern(
      new RegExp(
        `look at the top card of your library\\. you may exile it face down${BOUNDARY}(?!,| and\\b| then\\b)`,
        'iu',
      ),
    )(ctx, pos);
    if (!body.ok) return body;
    return {
      ok: true,
      value: [makeClause(id, 'lookTopMayExileFaceDown', {}, { start: pos, end: body.pos })],
      pos: body.pos,
    };
  },
});

/**
 * `effect.may-play-exiled-with-self-less`: "until end of turn, you may play cards exiled with ~. spells you cast this way cost {2} less to cast" (CR 607.2a, 601.2, 305.1, 601.2f, 118.7a,
 * 611.2a: until the end of the turn the player may cast the cards the permanent exiled with its linked ability, at the timing of their type, or play the lands; a spell cast with this
 * permission costs that much generic mana less). The engine's `mayPlay` of `linkedExile` with `lessGeneric`. Not read: another length, no length, "cast", a card exiled with another
 * permanent ("exiled with it"), a reduction in colored mana, "more", another group of spells ("spells you cast"), a trailing instruction.
 */
export const EFFECT_MAY_PLAY_EXILED_WITH_SELF_LESS = defineRule<Clauses>({
  id: 'effect.may-play-exiled-with-self-less',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 607.2a (Linked Abilities)',
    'CR 601.2 (Casting Spells)',
    'CR 601.2f (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 118.7a (Costs)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'until end of turn, you may play cards exiled with ~. spells you cast this way cost {2} less to cast',
    'until end of turn, you may play cards exiled with ~. spells you cast this way cost {1} less to cast',
  ],
  rejects: [
    'until end of turn, you may play cards exiled with ~',
    'until end of turn, you may play cards exiled with ~. spells you cast this way cost {2} more to cast',
    'until end of turn, you may play cards exiled with ~. spells you cast this way cost {R} less to cast',
    'until end of turn, you may play cards exiled with ~. spells you cast cost {2} less to cast',
    'until end of turn, you may cast cards exiled with ~. spells you cast this way cost {2} less to cast',
    'until end of turn, you may play cards exiled with it. spells you cast this way cost {2} less to cast',
    'until your next turn, you may play cards exiled with ~. spells you cast this way cost {2} less to cast',
    'until end of turn, you may play cards exiled with ~. spells you cast this way cost {0} less to cast',
    'until end of turn, you may play cards exiled with ~. spells you cast this way cost {2} less to cast and draw a card',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.may-play-exiled-with-self-less';
    const body = pattern(
      new RegExp(
        `until end of turn, you may play cards exiled with ~\\. spells you cast this way cost \\{([1-9][0-9]?)\\} less to cast${BOUNDARY}(?!,| and\\b| then\\b)`,
        'iu',
      ),
    )(ctx, pos);
    if (!body.ok) return body;
    const less = Number(body.value[1]);
    const whole = { start: pos, end: body.pos };
    const duration: IrDuration = {
      kind: 'duration',
      scope: 'untilEndOfTurn',
      span: whole,
      rule: id,
    };
    return {
      ok: true,
      value: [
        { ...makeClause(id, 'mayPlayLinkedLess', { less: number(less, whole) }, whole), duration },
      ],
      pos: body.pos,
    };
  },
});

/** Quiet: they start like other rules ("look", "until"), and must leave the diagnostics of the lines they do not read where they were. */
export const ARCANUM_EFFECT_RULES = [
  quietly(EFFECT_LOOK_TOP_MAY_EXILE_FACE_DOWN),
  quietly(EFFECT_MAY_PLAY_EXILED_WITH_SELF_LESS),
];
