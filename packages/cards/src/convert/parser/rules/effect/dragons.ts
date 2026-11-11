/**
 * Effect rules of stage P34 (D-151, D-152), the first half (the second is dragons-more.ts): exiling the top cards of the library and playing
 * them for a while (CR 701.13, 601.2, 305.1), an additional combat phase (CR 500.8), and Discover and the other ways to exile cards until a
 * card is found and cast it (CR 701.57). Each says what the text says; what the engine can run is the lowering's business.
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrAmount, IrDuration, IrFlag, IrToken, Span } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

export const BOUNDARY = '(?![\\p{L}\\p{N}])';

export function flag(rule: string, value: boolean, span: Span): IrFlag {
  return { kind: 'flag', value, span, rule };
}

export function number(value: number, span: Span): IrAmount {
  return { kind: 'number', value, span };
}

/**
 * `effect.exile-top`: "exile the top card of your library", "exile the top two cards of your library", "exile the top X cards of your
 * library" (CR 701.13, 401: the controller exiles the cards one after the other, face up). The cards are what "that card", "those cards" and
 * "those cards that are still exiled" name afterwards. Only your own library, two or more cards in the plural.
 */
export const EFFECT_EXILE_TOP = defineRule<Clauses>({
  id: 'effect.exile-top',
  family: 'effect',
  leading: ['exile'],
  cites: ['CR 701.13 (Exile)', 'CR 401.1 (Library)', 'CR 400.7 (General)'],
  examples: [
    'exile the top card of your library',
    'exile the top two cards of your library',
    'exile the top X cards of your library',
    'exile the top 3 cards of your library',
  ],
  rejects: [
    'exile the top card of target player’s library',
    'exile the top card of each player’s library',
    'exile the top card of your library face down',
    'exile the top one cards of your library',
    'exile the top two card of your library',
    'exile the top cards of your library',
    'exile top card of your library',
    'exile the top card of your graveyard',
    'exile the top 0 cards of your library',
    'exile the top card of your library and draw a card',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-top';
    const head = literal('exile the top ')(ctx, pos);
    if (!head.ok) return head;
    const counted = spanned(
      choice<number | 'x'>(
        map(pattern(new RegExp(`card${BOUNDARY}`, 'iu')), () => 1),
        map(
          sequence(
            satisfy(quantity, (n) => n >= 2),
            pattern(new RegExp(` cards${BOUNDARY}`, 'iu')),
          ),
          ([n]) => n,
        ),
        map(pattern(new RegExp(`X cards${BOUNDARY}`, 'u')), () => 'x' as const),
      ),
    )(ctx, head.pos);
    if (!counted.ok) return counted;
    const tail = pattern(new RegExp(` of your library${BOUNDARY}`, 'iu'))(ctx, counted.pos);
    if (!tail.ok) return tail;
    const { value, span } = counted.value;
    const count: IrAmount = value === 'x' ? { kind: 'x', span } : number(value, span);
    return {
      ok: true,
      value: [makeClause(id, 'exileTop', { count }, { start: pos, end: tail.pos })],
      pos: tail.pos,
    };
  },
});

/** The cards an earlier instruction exiled: "that card", "those cards", "it", "them". */
// Stage P63 (D-216): "You may play the exiled card this turn." (Expressive Iteration: the card its own instruction exiled).
const THOSE_CARDS = pattern(
  new RegExp(`(?:that card|those cards|the exiled cards?|it|them)${BOUNDARY}`, 'iu'),
);

/**
 * `effect.may-play`: "You may play that card this turn.", "Until the end of your next turn, you may play those cards.", "You may play those
 * cards until your next end step." (CR 601.2, 305.1, 611.2a: until the moment named, the player may play the cards the instruction before it
 * exiled, a land as a land drop and a spell by casting it, as though they were in their hand). The permission has one duration, said first
 * or last. The cards are those of an earlier "exile": the lowering refuses it after anything else.
 */
export const EFFECT_MAY_PLAY = defineRule<Clauses>({
  id: 'effect.may-play',
  family: 'effect',
  leading: ['you', 'play', 'until'],
  cites: [
    'CR 601.2 (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 611.2a (Continuous Effects)',
    'CR 701.13 (Exile)',
  ],
  examples: [
    'you may play that card this turn',
    'play that card this turn',
    'you may play it this turn',
    'you may play the exiled card this turn',
    'until the end of your next turn, you may play those cards',
    'until end of turn, you may play that card',
    'you may play those cards until your next end step',
    'you may play those cards until the end of your next turn',
  ],
  rejects: [
    'you may play that card',
    'you may play that card this turn until your next end step',
    'until end of turn, you may play that card this turn',
    'you may play that card until end of turn',
    'you may play target card this turn',
    'you may play those cards this turn and draw a card',
    'you may play that card next turn',
    'you may cast that card this turn',
    'you may play lands this turn',
    'until the end of your next turn, you may play that card until your next end step',
    'until your next turn, you may play those cards',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.may-play';
    const duration = (scope: IrDuration['scope'], span: Span): IrDuration => ({
      kind: 'duration',
      scope,
      span,
      rule: id,
    });
    const lead = spanned(
      optional(
        choice(
          map(pattern(/until the end of your next turn, /iu), () => 'untilEndOfNextTurn' as const),
          map(pattern(/until end of turn, /iu), () => 'untilEndOfTurn' as const),
        ),
        null,
      ),
    )(ctx, pos);
    if (!lead.ok) return lead;
    const body = sequence(
      optional(literal('you may '), null),
      literal('play '),
      THOSE_CARDS,
    )(ctx, lead.pos);
    if (!body.ok) return body;
    const trail = spanned(
      optional(
        choice(
          map(pattern(new RegExp(` this turn${BOUNDARY}`, 'iu')), () => 'thisTurn' as const),
          map(
            pattern(new RegExp(` until your next end step${BOUNDARY}`, 'iu')),
            () => 'untilYourNextEndStep' as const,
          ),
          map(
            pattern(new RegExp(` until the end of your next turn${BOUNDARY}`, 'iu')),
            () => 'untilEndOfNextTurn' as const,
          ),
        ),
        null,
      ),
    )(ctx, body.pos);
    if (!trail.ok) return trail;
    // Exactly one duration: said first or said last.
    const first = lead.value.value;
    const last = trail.value.value;
    if ((first === null) === (last === null)) return fail(ctx, body.pos);
    const scope = first ?? last;
    if (scope === null) return fail(ctx, body.pos);
    const span = first === null ? trail.value.span : lead.value.span;
    return {
      ok: true,
      value: [
        {
          ...makeClause(id, 'mayPlay', {}, { start: pos, end: trail.pos }),
          duration: duration(scope, span),
        },
      ],
      pos: trail.pos,
    };
  },
});

/**
 * `effect.extra-combat`: "After this phase, there is an additional combat phase." (CR 500.8, 500.10: when the combat phase that is now
 * ending is over, one more follows it). Said in the ability of an attack, so that there is a combat phase to come after.
 */
export const EFFECT_EXTRA_COMBAT = defineRule<Clauses>({
  id: 'effect.extra-combat',
  family: 'effect',
  leading: ['after'],
  cites: ['CR 500.8 (Extra Turns)', 'CR 500.10 (Extra Turns)', 'CR 506.1 (Combat Phase)'],
  examples: [
    'after this phase, there is an additional combat phase',
    'After this phase, there is an additional combat phase',
  ],
  rejects: [
    'after this phase, there are two additional combat phases',
    'after this phase, there is an additional main phase',
    'there is an additional combat phase',
    'after this phase, there is an additional combat phase and draw a card',
    'after this turn, there is an additional combat phase',
    'after this phase there is an additional combat phase',
    'after this phase, there is an additional combat phase after that',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(new RegExp(`after this phase, there is an additional combat phase${BOUNDARY}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [makeClause('effect.extra-combat', 'extraCombat', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.discover`: "Discover 10." (CR 701.57a: exile cards from the top of your library until you exile a nonland card with mana value N or
 * less; cast it without paying its mana cost or put it into your hand; put the rest on the bottom in a random order). The number is the most
 * the card's mana value may be.
 */
export const EFFECT_DISCOVER = defineRule<Clauses>({
  id: 'effect.discover',
  family: 'effect',
  leading: ['discover'],
  cites: ['CR 701.57 (Discover)', 'CR 701.57a (Discover)'],
  examples: ['discover 10', 'discover 5', 'discover three', 'Discover 4'],
  rejects: ['discover', 'discover X', 'discover 0', 'discover 10 and draw a card', 'discovers 3'],
  parse: (ctx, pos) => {
    const r = sequence(literal('discover '), spanned(satisfy(quantity, (n) => n >= 1)))(ctx, pos);
    if (!r.ok) return r;
    const [, n] = r.value;
    return {
      ok: true,
      value: [
        makeClause(
          'effect.discover',
          'discover',
          { count: number(n.value, n.span) },
          { start: pos, end: r.pos },
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.discover-treasures`: "If the discovered card's mana value is less than 10, create a number of tapped Treasure tokens equal to the
 * difference." (CR 701.57, 111.10: the number of tokens is how far the card's mana value is under the limit of the Discover before it).
 * It reads the card an instruction of the text before it found; the lowering refuses it after anything else.
 */
export const EFFECT_DISCOVER_TOKENS = defineRule<Clauses>({
  id: 'effect.discover-treasures',
  family: 'effect',
  leading: ['if'],
  cites: [
    'CR 701.57 (Discover)',
    'CR 111.10 (Tokens)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    'if the discovered card’s mana value is less than 10, create a number of tapped Treasure tokens equal to the difference',
    "if the discovered card's mana value is less than 5, create a number of Treasure tokens equal to the difference",
  ],
  rejects: [
    "if the discovered card's mana value is less than 10, create a number of tapped Treasure tokens",
    "if the discovered card's mana value is 10, create a number of tapped Treasure tokens equal to the difference",
    "if the discovered card's mana value is less than 10, create a number of tapped Goblin tokens equal to the difference",
    "if the cast card's mana value is less than 10, create a number of tapped Treasure tokens equal to the difference",
    "if the discovered card's mana value is less than X, create a number of tapped Treasure tokens equal to the difference",
    "if the discovered card's mana value is less than 10, create a number of tapped Treasure tokens equal to the difference and draw a card",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.discover-treasures';
    const r = sequence(
      pattern(/if the discovered card['’]s mana value is less than /iu),
      spanned(satisfy(quantity, (n) => n >= 1)),
      literal(', create a number of '),
      spanned(optional(literal('tapped '), null)),
      pattern(
        new RegExp(`(Treasure|Food|Clue|Blood) tokens equal to the difference${BOUNDARY}`, 'u'),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, limit, , tapped, token] = r.value;
    const name = (token[1] ?? '') as 'Treasure' | 'Food' | 'Clue' | 'Blood';
    const span = { start: pos, end: r.pos };
    const spec: IrToken = {
      kind: 'token',
      predefined: name,
      ...(tapped.value === null ? {} : { tapped: true as const }),
      count: { kind: 'shortfall', limit: limit.value, span: limit.span },
      span,
      rule: id,
    };
    return {
      ok: true,
      value: [makeClause(id, 'createToken', { token: spec }, span)],
      pos: r.pos,
    };
  },
});

/**
 * `effect.exile-until-cast`: "Exile cards from the top of your library until you exile a nonland card. You may cast it without paying its
 * mana cost if that spell's mana value is 8 or less. If you don't, put that card into your hand." (CR 701.57, 608.2g, 401.4: the three
 * sentences are one instruction, kept together by the segmenter). The cards exiled that are not the one found stay in exile.
 */
export const EFFECT_EXILE_UNTIL_CAST = defineRule<Clauses>({
  id: 'effect.exile-until-cast',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 701.57 (Discover)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 401.4 (Library)',
  ],
  examples: [
    "exile cards from the top of your library until you exile a nonland card. you may cast it without paying its mana cost if that spell's mana value is 8 or less. if you don't, put that card into your hand",
    'exile cards from the top of your library until you exile a nonland card. you may cast it without paying its mana cost if that spell’s mana value is 3 or less. if you don’t, put that card into your hand',
  ],
  rejects: [
    "exile cards from the top of your library until you exile a nonland card. you may cast it without paying its mana cost if that spell's mana value is 8 or less",
    "exile cards from the top of your library until you exile a creature card. you may cast it without paying its mana cost if that spell's mana value is 8 or less. if you don't, put that card into your hand",
    "exile cards from the top of your library until you exile a nonland card. you may cast it without paying its mana cost if that spell's mana value is 8 or more. if you don't, put that card into your hand",
    "exile cards from the top of your library until you exile a nonland card. you may cast it without paying its mana cost. if you don't, put that card into your hand",
    "exile cards from the top of your library until you exile a nonland card. you may cast it without paying its mana cost if that spell's mana value is X or less. if you don't, put that card into your hand",
    "exile cards from the top of your library until you exile a nonland card. you may cast it without paying its mana cost if that spell's mana value is 8 or less. if you don't, put that card onto the battlefield",
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/exile cards from the top of your library until you exile a nonland card\. /iu),
      pattern(/you may cast it without paying its mana cost if that spell['’]s mana value is /iu),
      spanned(satisfy(quantity, (n) => n >= 1)),
      pattern(/ or less\. if you don['’]t, put that card into your hand/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, , limit] = r.value;
    return {
      ok: true,
      value: [
        makeClause(
          'effect.exile-until-cast',
          'exileUntilCast',
          { castAtMost: number(limit.value, limit.span) },
          { start: pos, end: r.pos },
        ),
      ],
      pos: r.pos,
    };
  },
});

export const DRAGON_EFFECT_RULES = [
  EFFECT_EXILE_TOP,
  EFFECT_MAY_PLAY,
  EFFECT_EXTRA_COMBAT,
  EFFECT_DISCOVER,
  EFFECT_DISCOVER_TOKENS,
  EFFECT_EXILE_UNTIL_CAST,
].map(quietly);
