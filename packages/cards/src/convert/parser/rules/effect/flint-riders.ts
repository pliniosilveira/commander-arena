/**
 * Effect rules of the Flint deck (issue 685): the sentences that follow a permission to play exiled cards and change how a spell cast with it is paid for (Black Cat, Cunning Thief;
 * Bloodsoaked Insight; Outrageous Robbery; Inside Information; CR 609.4b, 118.9, 601.2f). None is an instruction of its own: each is the rider of the `mayPlay` of the sentence before it,
 * which the lowering (`lower/flint-riders.ts`) completes and refuses everywhere else.
 */
import { fail, literal, pattern, satisfy, sequence } from '../../combinators';
import type { IrArg, IrDuration, IrNoun } from '../../ir/types';
import { possessedNoun } from '../noun/controller';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause } from './operands';

const NOT_MORE = `${BOUNDARY}(?!,| and\\b| then\\b| this\\b)`;

const ANY_TYPE_ID = 'effect.any-type-for-spell-cast-this-way';

/**
 * `effect.any-type-for-spell-cast-this-way`: "If you cast a spell this way, mana of any type can be spent to cast it." (Bloodsoaked Insight) and "If you cast a spell this way, you may spend
 * mana as though it were mana of any type to cast it." (Outrageous Robbery; CR 609.4b, 601.2f): the rider of the permission before it, which sets the engine's `anyManaType` on that
 * `mayPlay` (a land card played that way is played as usual). Not read: "any color" (`effect.any-color-for-spell-cast-this-way`), "cast" of one kind of spell, "that spell", another sentence,
 * a duration, a second instruction.
 */
export const EFFECT_ANY_TYPE_FOR_SPELL_CAST_THIS_WAY = defineRule<Clauses>({
  id: ANY_TYPE_ID,
  family: 'effect',
  leading: ['if'],
  cites: ['CR 609.4b (Effects)', 'CR 601.2f (Casting Spells)'],
  examples: [
    'if you cast a spell this way, mana of any type can be spent to cast it',
    'if you cast a spell this way, you may spend mana as though it were mana of any type to cast it',
  ],
  rejects: [
    'if you cast a spell this way, mana of any color can be spent to cast it',
    'if you cast a spell this way, you may spend mana as though it were mana of any color to cast it',
    'if you cast a spell this way, mana of any type can be spent to cast that spell',
    'if you cast a spell this way',
    'if you cast a spell this way, mana of any type can be spent to cast it this turn',
    'if you cast a spell this way, mana of any type can be spent to cast it and draw a card',
    'if you cast a creature spell this way, mana of any type can be spent to cast it',
    'mana of any type can be spent to cast it',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `if you cast a spell this way, (?:mana of any type can be spent|you may spend mana as though it were mana of any type) to cast it${NOT_MORE}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(ANY_TYPE_ID, 'anyTypeRider', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

const ANY_TYPE_SPELLS_ID = 'effect.any-type-for-spells-cast-this-way';

/**
 * `effect.any-type-for-spells-cast-this-way`: "Mana of any type can be spent to cast spells this way." (Black Cat, Cunning Thief; CR 609.4b, 601.2f): the same rider with no "if", said of the
 * permission to play the cards the sentence before it exiled. Not read: "any color", "cast that spell", "if", another sentence, a duration, a second instruction.
 */
export const EFFECT_ANY_TYPE_FOR_SPELLS_CAST_THIS_WAY = defineRule<Clauses>({
  id: ANY_TYPE_SPELLS_ID,
  family: 'effect',
  leading: ['mana'],
  cites: ['CR 609.4b (Effects)', 'CR 601.2f (Casting Spells)'],
  examples: ['mana of any type can be spent to cast spells this way'],
  rejects: [
    'mana of any color can be spent to cast spells this way',
    'mana of any type can be spent to cast that spell',
    'mana of any type can be spent to cast spells',
    'mana of any type can be spent to cast spells this way this turn',
    'mana of any type can be spent to cast spells this way and draw a card',
    'if you cast a spell this way, mana of any type can be spent to cast it',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(new RegExp(`mana of any type can be spent to cast spells this way${NOT_MORE}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(ANY_TYPE_SPELLS_ID, 'anyTypeRider', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

const LIFE_ID = 'effect.life-for-spell-cast-this-way';

/**
 * `effect.life-for-spell-cast-this-way`: "If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost." (Inside Information; CR 118.9, 119.4, 601.2f): the
 * rider of the permission before it, which sets the engine's `lifeForMana` on that `mayPlay` (a land card played that way is played as usual). Not read: "paying", another cost, "if you
 * cast a creature spell", "that spell", another sentence, a duration, a second instruction.
 */
export const EFFECT_LIFE_FOR_SPELL_CAST_THIS_WAY = defineRule<Clauses>({
  id: LIFE_ID,
  family: 'effect',
  leading: ['if'],
  cites: ['CR 118.9 (Alternative Costs)', 'CR 119.4 (Life)', 'CR 601.2f (Casting Spells)'],
  examples: [
    'if you cast a spell this way, pay life equal to its mana value rather than pay its mana cost',
    'if you cast a spell this way, pay life equal to its mana value rather than paying its mana cost',
  ],
  rejects: [
    'if you cast a spell this way, pay life equal to its mana value',
    'if you cast a spell this way, pay twice its mana value in life rather than pay its mana cost',
    'if you cast a spell this way, pay life equal to that spell’s mana value rather than pay its mana cost',
    'if you cast a creature spell this way, pay life equal to its mana value rather than pay its mana cost',
    'if you cast a spell this way, pay life equal to its mana value rather than pay its mana cost and draw a card',
    'pay life equal to its mana value rather than pay its mana cost',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `if you cast a spell this way, pay life equal to its mana value rather than pay(?:ing)? its mana cost${NOT_MORE}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause(LIFE_ID, 'lifeRider', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

const PLAY_SPEND_ID = 'effect.may-play-exiled-and-spend';

const SCOPES: Readonly<Record<string, IrDuration['scope']>> = {
  'until end of turn': 'untilEndOfTurn',
  'until the end of your next turn': 'untilEndOfNextTurn',
  'until your next end step': 'untilYourNextEndStep',
};

/**
 * `effect.may-play-exiled-and-spend`: "Until end of turn, you may cast spells from among those cards, and mana of any type can be spent to cast those spells." (Laughing Jasper Flint),
 * "Until your next end step, you may play those cards, and mana of any type can be spent to cast those spells." (Rakdos, the Muscle), "Until the end of your next turn, you may play that
 * card, and you may spend mana as though it were mana of any color to cast it." (You Find Some Prisoners) and "Until end of turn, you may play that card and you may spend mana as though it were
 * mana of any color to cast it." (The Ruinous Powers; CR 601.2, 305.1, 609.4b, 611.2a): the controller may play (or only cast) the cards the instruction before it exiled for the length said,
 * and pays for the spells with mana of any type or of any color. The engine's `mayPlay` with `anyManaType` or `anyManaColor` (`castOnly` for "cast spells from among"). Not read: "for as long as
 * they remain exiled" (`effect.may-play-while-exiled-spend`), another length, "cast that card", "any type" for a single "play those cards" for the end of your next turn (the rule of Lidless
 * Gaze), a second instruction.
 */
export const EFFECT_MAY_PLAY_EXILED_AND_SPEND = defineRule<Clauses>({
  id: PLAY_SPEND_ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 601.2 (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 609.4b (Effects)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'until end of turn, you may cast spells from among those cards, and mana of any type can be spent to cast those spells',
    'until your next end step, you may play those cards, and mana of any type can be spent to cast those spells',
    'until the end of your next turn, you may play that card, and you may spend mana as though it were mana of any color to cast it',
    'until end of turn, you may play that card and you may spend mana as though it were mana of any color to cast it',
  ],
  rejects: [
    'until the end of your next turn, you may play those cards, and mana of any type can be spent to cast those spells',
    'until end of turn, you may cast spells from among those cards',
    'until end of turn, you may play those cards, and mana of any color can be spent to cast those spells',
    'this turn, you may play that card, and you may spend mana as though it were mana of any color to cast it',
    'until end of turn, you may cast that card, and you may spend mana as though it were mana of any color to cast it',
    'until end of turn, you may play that card and you may spend mana as though it were mana of any color to cast it and draw a card',
    'until end of turn, you may play that card, and mana of any type can be spent to cast that spells',
    'for as long as they remain exiled, you may play those cards, and mana of any type can be spent to cast those spells',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `(until end of turn|until the end of your next turn|until your next end step), you may (play|cast spells from among) (those cards|that card),? (?:and )?(mana of any type can be spent to cast (?:those spells|that spell)|you may spend mana as though it were mana of any (type|color) to cast (?:those spells|that spell|it))${NOT_MORE}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const m = r.value.value;
    const length = (m[1] ?? '').toLowerCase();
    const cast = (m[2] ?? '').toLowerCase().startsWith('cast');
    const plural = (m[3] ?? '').toLowerCase() === 'those cards';
    const rider = (m[4] ?? '').toLowerCase();
    // "cast spells from among those cards" says "those spells" or "that spell" in step with the cards; "play those cards ... mana of any type" is Lidless Gaze's, for the next turn only.
    const anyType = rider.startsWith('mana of any type') || rider.endsWith('any type to cast it');
    if (plural !== /those spells/u.test(rider) && !rider.endsWith('to cast it'))
      return fail(ctx, pos);
    if (!cast && anyType && plural && length === 'until the end of your next turn') {
      return fail(ctx, pos);
    }
    const scope = SCOPES[length];
    if (scope === undefined) return fail(ctx, pos);
    const duration: IrDuration = { kind: 'duration', scope, span, rule: PLAY_SPEND_ID };
    const args: Record<string, IrArg> = {
      ...(anyType
        ? { anyManaType: flag(PLAY_SPEND_ID, true, span) }
        : { anyManaColor: flag(PLAY_SPEND_ID, true, span) }),
      ...(cast ? { castOnly: flag(PLAY_SPEND_ID, true, span) } : {}),
    };
    return {
      ok: true,
      value: [{ ...makeClause(PLAY_SPEND_ID, 'mayPlay', args, span), duration }],
      pos: r.pos,
    };
  },
});

const EQUAL_ID = 'effect.exile-top-cards-equal-to-its-mana-value';

/**
 * `effect.exile-top-cards-equal-to-its-mana-value`: "exile cards equal to its mana value from the top of target player's library" (Rakdos, the Muscle; CR 701.13, 401.1, 202.3, 608.2h): the
 * cards are exiled one after the other, face up, from the top of the library of a target player, as many as the mana value of the object the sentence is about ("its", the creature that
 * was sacrificed, as it last was). The engine's `exileTop` with `from` and a `manaValueOf` count. Not read: your own library, "the top", another count, "that card's", a trailing instruction.
 */
export const EFFECT_EXILE_TOP_CARDS_EQUAL_TO_ITS_MANA_VALUE = defineRule<Clauses>({
  id: EQUAL_ID,
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 701.13 (Exile)', 'CR 401.1 (Library)', 'CR 202.3 (Mana Value)', 'CR 115.1 (Targets)'],
  examples: ["exile cards equal to its mana value from the top of target player's library"],
  rejects: [
    'exile cards equal to its mana value from the top of your library',
    "exile cards equal to its power from the top of target player's library",
    "exile cards equal to its mana value from the top of each player's library",
    "exile cards equal to its mana value from target player's library",
    "exile cards equal to its mana value from the top of target player's library and draw a card",
    "exile the top card equal to its mana value from the top of target player's library",
  ],
  parse: (ctx, pos) => {
    const head = literal('exile cards equal to its mana value from the top of ')(ctx, pos);
    if (!head.ok) return head;
    const owner = sequence(
      family<IrNoun>('noun', { only: ['noun.player'] }),
      pattern(/['’]s library(?![\p{L}\p{N}])(?!,| face down| and\b| then\b)/iu),
    )(ctx, head.pos);
    if (!owner.ok) return owner;
    const [who] = owner.value;
    if (who.det !== 'target' || who.anyNumber === true) return fail(ctx, pos);
    const start = pos + 'exile cards equal to '.length;
    const of = possessedNoun(EQUAL_ID, 'its', start);
    return {
      ok: true,
      value: [
        makeClause(
          EQUAL_ID,
          'exileTop',
          {
            count: {
              kind: 'manaValueOf',
              of,
              span: { start, end: start + 'its mana value'.length },
            },
            from: who,
          },
          { start: pos, end: owner.pos },
        ),
      ],
      pos: owner.pos,
    };
  },
});

/** "the top nine cards of target opponent's library": the count of cards and the opponent whose library it is (a target, never "each"). */
const TOP_OF_TARGET_LIBRARY = sequence(
  literal('look at the top '),
  satisfy(
    family<IrArg>('amount', { only: ['amount.number'] }),
    (a) => a.kind === 'number' && a.value >= 2,
  ),
  literal(' cards of '),
  satisfy(
    family<IrNoun>('noun', { only: ['noun.player'] }),
    (n) => n.det === 'target' && n.anyNumber !== true,
  ),
);

const LOOK_N_ID = 'effect.look-exile-n-face-down';

const WORD_NUMBERS: Readonly<Record<string, number>> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
};

/**
 * `effect.look-exile-n-face-down`: "look at the top nine cards of target opponent's library, exile two of them face down, then put the rest on the bottom of their library in a random order"
 * (Black Cat, Cunning Thief; CR 401.2, 406.3, 701.20): the controller looks at the cards, exiles a number of them face down (a fixed number, never fewer while there are as many), and the rest
 * go to the bottom of that library in a random order. The engine's `lookAtTop` of the library of the target player with `take.to` `exileFaceDownUnlinked`. The controller looked at the cards
 * they exiled, so the permission after it may look at them (`ctx.exiledLookedAt`). Not read: your own library, "each opponent", one card (Gonti's own sentence pair), another place for the
 * rest, more cards exiled than looked at, a trailing instruction.
 */
export const EFFECT_LOOK_EXILE_N_FACE_DOWN = defineRule<Clauses>({
  id: LOOK_N_ID,
  family: 'effect',
  leading: ['look'],
  cites: ['CR 401.2 (Library)', 'CR 406.3 (Exile)', 'CR 701.20 (Reveal)'],
  examples: [
    "look at the top nine cards of target opponent's library, exile two of them face down, then put the rest on the bottom of their library in a random order",
    'look at the top five cards of target player’s library, exile three of them face down, then put the rest on the bottom of their library in a random order',
  ],
  rejects: [
    'look at the top nine cards of your library, exile two of them face down, then put the rest on the bottom of their library in a random order',
    "look at the top nine cards of each opponent's library, exile two of them face down, then put the rest on the bottom of their library in a random order",
    "look at the top nine cards of target opponent's library, exile one of them face down, then put the rest on the bottom of their library in a random order",
    "look at the top two cards of target opponent's library, exile three of them face down, then put the rest on the bottom of their library in a random order",
    "look at the top nine cards of target opponent's library, exile two of them face down, then put the rest into their graveyard",
    "look at the top nine cards of target opponent's library, exile two of them, then put the rest on the bottom of their library in a random order",
    "look at the top nine cards of target opponent's library, exile two of them face down, then put the rest on the bottom of their library in a random order and draw a card",
  ],
  parse: (ctx, pos) => {
    const head = TOP_OF_TARGET_LIBRARY(ctx, pos);
    if (!head.ok) return head;
    const [, count, , from] = head.value;
    const tail = pattern(
      /['’]s library, exile (two|three|four|five) of them face down, then put the rest on the bottom of their library in a random order(?![\p{L}\p{N}])(?!,| and\b| then\b)/iu,
    )(ctx, head.pos);
    if (!tail.ok) return tail;
    const taken = WORD_NUMBERS[(tail.value[1] ?? '').toLowerCase()];
    if (taken === undefined || count.kind !== 'number' || taken > count.value)
      return fail(ctx, pos);
    const span = { start: pos, end: tail.pos };
    return {
      ok: true,
      value: [
        makeClause(
          LOOK_N_ID,
          'lookExileFaceDownMany',
          { count, from, taken: { kind: 'number', value: taken, span } },
          span,
        ),
      ],
      pos: tail.pos,
    };
  },
});

const LOOK_ONLY_ID = 'effect.look-at-top-of-target-library';

/**
 * `effect.look-at-top-of-target-library`: "look at the top three cards of target player's library" (Orcish Spy; CR 401.2, 701.20e): the controller looks at the cards and nothing more happens
 * to them, they stay on top in the order they were in. The engine's `lookAtTop` of the library of the target player with nothing taken (`take.max` 0, `rest` `top`). Not read: your own library,
 * "each opponent", one card, "and ...", "then ...", a following instruction in the same clause.
 */
export const EFFECT_LOOK_AT_TOP_OF_TARGET_LIBRARY = defineRule<Clauses>({
  id: LOOK_ONLY_ID,
  family: 'effect',
  leading: ['look'],
  cites: ['CR 401.2 (Library)', 'CR 701.20 (Reveal)'],
  examples: [
    "look at the top three cards of target player's library",
    'look at the top two cards of target opponent’s library',
  ],
  rejects: [
    'look at the top three cards of your library',
    "look at the top three cards of each opponent's library",
    "look at the top card of target player's library",
    "look at the top three cards of target player's library and exile those cards face down",
    "look at the top three cards of target player's library, then put one on the bottom",
    "look at the top three cards of target player's library. you may exile one",
    "look at the top three cards of target player's graveyard",
  ],
  parse: (ctx, pos) => {
    const head = TOP_OF_TARGET_LIBRARY(ctx, pos);
    if (!head.ok) return head;
    const [, count, , from] = head.value;
    const tail = pattern(/['’]s library(?![\p{L}\p{N}])(?!,| and\b| then\b)(?!\.\s)/iu)(
      ctx,
      head.pos,
    );
    if (!tail.ok) return tail;
    return {
      ok: true,
      value: [makeClause(LOOK_ONLY_ID, 'lookOnly', { count, from }, { start: pos, end: tail.pos })],
      pos: tail.pos,
    };
  },
});

const LOOK_ALL_ID = 'effect.look-and-exile-those-face-down';

/**
 * `effect.look-and-exile-those-face-down`: "look at the top two cards of target opponent's library and exile those cards face down" (Petty Larceny; CR 401.2, 406.3, 701.20): the controller
 * looks at the cards and exiles every one of them face down. The engine's `lookAtTop` of the library of the target player taking all the cards looked at into exile face down, remembered by
 * nobody (`take.to` `exileFaceDownUnlinked`, `min` and `max` the number of cards). The controller looked at the cards, so the permission after it may look at them. Not read: your own
 * library, "each opponent", one card, "and put the rest", a trailing instruction.
 */
export const EFFECT_LOOK_AND_EXILE_THOSE_FACE_DOWN = defineRule<Clauses>({
  id: LOOK_ALL_ID,
  family: 'effect',
  leading: ['look'],
  cites: ['CR 401.2 (Library)', 'CR 406.3 (Exile)', 'CR 701.20 (Reveal)'],
  examples: [
    "look at the top two cards of target opponent's library and exile those cards face down",
    'look at the top three cards of target player’s library and exile those cards face down',
  ],
  rejects: [
    'look at the top two cards of your library and exile those cards face down',
    "look at the top two cards of each opponent's library and exile those cards face down",
    "look at the top two cards of target opponent's library and exile those cards",
    "look at the top two cards of target opponent's library and exile one of them face down",
    "look at the top two cards of target opponent's library and exile those cards face down and draw a card",
    "look at the top card of target opponent's library and exile that card face down",
  ],
  parse: (ctx, pos) => {
    const head = TOP_OF_TARGET_LIBRARY(ctx, pos);
    if (!head.ok) return head;
    const [, count, , from] = head.value;
    const tail = pattern(
      /['’]s library and exile those cards face down(?![\p{L}\p{N}])(?!,| and\b| then\b)/iu,
    )(ctx, head.pos);
    if (!tail.ok) return tail;
    const span = { start: pos, end: tail.pos };
    return {
      ok: true,
      value: [
        makeClause(
          LOOK_ALL_ID,
          'lookExileFaceDownMany',
          {
            count,
            from,
            taken: { kind: 'number', value: count.kind === 'number' ? count.value : 0, span },
          },
          span,
        ),
      ],
      pos: tail.pos,
    };
  },
});

const PLAY_WHILE_ID = 'effect.may-play-those-cards-while-exiled-and-spend';

/**
 * `effect.may-play-those-cards-while-exiled-and-spend`: "you may play those cards for as long as they remain exiled, and mana of any type can be spent to cast them" (Petty Larceny; CR 406.3,
 * 601.2, 305.1, 609.4b, 611.2b): the controller may play the cards the instruction before it exiled for as long as they stay in exile (a land as a land drop, a spell by casting it) and pays
 * for the spells with mana of any type. The engine's `mayPlay` with `whileExiled` and `anyManaType`. The cards are the ones of the "exile" before it, which the lowering requires (and, for
 * cards exiled face down, which the controller looked at). Not read: one card (`effect.may-play-while-exiled-spend`), "look at and play", "cast", another rider, another length, a trailing
 * instruction.
 */
export const EFFECT_MAY_PLAY_THOSE_CARDS_WHILE_EXILED_AND_SPEND = defineRule<Clauses>({
  id: PLAY_WHILE_ID,
  family: 'effect',
  leading: ['you', 'play'],
  cites: [
    'CR 406.3 (Exile)',
    'CR 601.2 (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 609.4b (Effects)',
    'CR 611.2b (Continuous Effects)',
  ],
  examples: [
    'you may play those cards for as long as they remain exiled, and mana of any type can be spent to cast them',
    'play the exiled cards for as long as they remain exiled, and mana of any type can be spent to cast those spells',
  ],
  rejects: [
    'you may play those cards for as long as they remain exiled',
    'you may look at and play those cards for as long as they remain exiled, and mana of any type can be spent to cast them',
    'you may cast those cards for as long as they remain exiled, and mana of any type can be spent to cast them',
    'you may play that card for as long as it remains exiled, and mana of any type can be spent to cast it',
    'you may play those cards this turn, and mana of any type can be spent to cast them',
    'you may play those cards for as long as they remain exiled, and mana of any color can be spent to cast them',
    'you may play those cards for as long as they remain exiled, and mana of any type can be spent to cast them and draw a card',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `(?:you may )?play (?:those|the exiled) cards for as long as they remain exiled, and mana of any type can be spent to cast (?:them|those spells)${NOT_MORE}`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const duration: IrDuration = {
      kind: 'duration',
      scope: 'whileExiled',
      span,
      rule: PLAY_WHILE_ID,
    };
    return {
      ok: true,
      value: [
        {
          ...makeClause(
            PLAY_WHILE_ID,
            'mayPlay',
            { anyManaType: flag(PLAY_WHILE_ID, true, span) },
            span,
          ),
          duration,
        },
      ],
      pos: r.pos,
    };
  },
});

const UNTIL_DISCARD_ID = 'effect.exile-until-cast-by-discarding';

/**
 * `effect.exile-until-cast-by-discarding`: "Exile cards from the top of your library until you exile a nonland card. You may cast that card by discarding a card rather than paying its mana
 * cost." (The Infamous Cruelclaw; CR 701.13, 608.2g, 118.9, 701.9a): the cards before the one found stay exiled. The two sentences are one instruction that `splitSentences` keeps together.
 * The engine's `exileUntilFound` of the controller's library, then the `castFree` of the card found with `payInstead` one discard. Not read: another player, another place, "without paying",
 * "by paying", more cards discarded, "it", a rider.
 */
export const EFFECT_EXILE_UNTIL_CAST_BY_DISCARDING = defineRule<Clauses>({
  id: UNTIL_DISCARD_ID,
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 701.13 (Exile)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 701.9 (Discard)',
  ],
  examples: [
    'exile cards from the top of your library until you exile a nonland card. You may cast that card by discarding a card rather than paying its mana cost',
  ],
  rejects: [
    'exile cards from the top of your library until you exile a nonland card',
    'exile cards from the top of your library until you exile a nonland card. You may cast that card without paying its mana cost',
    'exile cards from the top of your library until you exile a nonland card. You may cast that card by discarding two cards rather than paying its mana cost',
    "exile cards from the top of target player's library until you exile a nonland card. You may cast that card by discarding a card rather than paying its mana cost",
    'exile cards from the top of your library until you exile a nonland card. You may cast it by discarding a card rather than paying its mana cost',
    'exile cards from the top of your library until you exile a nonland card. You may cast that card by discarding a card rather than paying its mana cost and draw a card',
  ],
  parse: (ctx, pos) => {
    const head = pattern(/exile cards from the top of your library until you exile /iu)(ctx, pos);
    if (!head.ok) return head;
    const card = family<IrNoun>('noun', { only: ['noun.library-card'] })(ctx, head.pos);
    if (!card.ok) return card;
    const tail = pattern(
      /\. you may cast that card by discarding a card rather than paying its mana cost(?![\p{L}\p{N}])(?!,| and\b| then\b)/iu,
    )(ctx, card.pos);
    if (!tail.ok) return tail;
    const span = { start: pos, end: tail.pos };
    return {
      ok: true,
      value: [
        makeClause(
          UNTIL_DISCARD_ID,
          'exileUntilCastFree',
          {
            player: {
              kind: 'noun',
              det: 'you',
              filter: { raw: 'you' },
              upTo: false,
              plural: false,
              other: false,
              span: { start: 0, end: 0 },
              rule: UNTIL_DISCARD_ID,
            } satisfies IrNoun,
            card: { ...card.value, upTo: false, plural: false },
            discardInstead: flag(UNTIL_DISCARD_ID, true, span),
          },
          span,
        ),
      ],
      pos: tail.pos,
    };
  },
});

/** Tried first: "if ..." and "mana ..." are the first words of the plain rules. */
export const FLINT_RIDER_EFFECT_RULES = [
  EFFECT_EXILE_UNTIL_CAST_BY_DISCARDING,
  EFFECT_LOOK_AT_TOP_OF_TARGET_LIBRARY,
  EFFECT_MAY_PLAY_THOSE_CARDS_WHILE_EXILED_AND_SPEND,
  EFFECT_LOOK_EXILE_N_FACE_DOWN,
  EFFECT_LOOK_AND_EXILE_THOSE_FACE_DOWN,
  EFFECT_EXILE_TOP_CARDS_EQUAL_TO_ITS_MANA_VALUE,
  EFFECT_MAY_PLAY_EXILED_AND_SPEND,
  EFFECT_ANY_TYPE_FOR_SPELL_CAST_THIS_WAY,
  EFFECT_ANY_TYPE_FOR_SPELLS_CAST_THIS_WAY,
  EFFECT_LIFE_FOR_SPELL_CAST_THIS_WAY,
].map(quietly);
