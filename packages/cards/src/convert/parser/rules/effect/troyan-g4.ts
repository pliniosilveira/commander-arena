/**
 * Effect rules of group 4 of the Troyan deck (issue 337): the body of Rashmi, Eternities Crafter, "reveal the top card of your library. You may cast it without paying its
 * mana cost if it's a spell with lesser mana value. If you don't cast it, put it into your hand." The lowering is in `lower/troyan-g4.ts`.
 */
import { pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrFlag } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, quietly, spanned } from '../registry';
import { TAKEN_CARD } from './library';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.reveal-top-cast`: "reveal the top card of your library. You may cast it without paying its mana cost if it's a spell with lesser mana value. If you don't cast it,
 * put it into your hand." (CR 701.20a: the card is revealed and stays on top; CR 608.2g, 118.9: it is cast as the effect resolves, with no timing restriction and no mana cost
 * paid; CR 202.3e: its mana value counts an {X} as 0). The three sentences are one instruction, kept together by the segmenter. "Lesser" is relative to the mana value of the
 * spell that caused the ability to trigger, which the lowering reads from the trigger. Not read: another zone or library, a greater or other comparison, "if it's a
 * creature spell", "you may cast it" without the condition, another fate for the card ("onto the battlefield", "on the bottom").
 */
export const EFFECT_REVEAL_TOP_CAST = defineRule<Clauses>({
  id: 'effect.reveal-top-cast',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Costs)',
    'CR 202.3e (Mana Value)',
  ],
  examples: [
    "reveal the top card of your library. you may cast it without paying its mana cost if it's a spell with lesser mana value. if you don't cast it, put it into your hand",
    'reveal the top card of your library. you may cast it without paying its mana cost if it’s a spell with lesser mana value. if you don’t cast it, put it into your hand',
  ],
  rejects: [
    "reveal the top card of your library. you may cast it without paying its mana cost if it's a spell with lesser mana value",
    "reveal the top card of your library. you may cast it without paying its mana cost if it's a spell with greater mana value. if you don't cast it, put it into your hand",
    "reveal the top card of your library. you may cast it without paying its mana cost if it's a creature spell with lesser mana value. if you don't cast it, put it into your hand",
    "reveal the top card of your library. you may cast it without paying its mana cost. if you don't cast it, put it into your hand",
    "reveal the top card of target player's library. you may cast it without paying its mana cost if it's a spell with lesser mana value. if you don't cast it, put it into your hand",
    "reveal the top card of your library. you may cast it without paying its mana cost if it's a spell with lesser mana value. if you don't cast it, put it on the bottom of your library",
    "reveal the top card of your library. you may cast it without paying its mana cost if it's a spell with lesser mana value. if you don't cast it, put it into your hand and draw a card",
    "reveal the top two cards of your library. you may cast it without paying its mana cost if it's a spell with lesser mana value. if you don't cast it, put it into your hand",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /reveal the top card of your library\. you may cast it without paying its mana cost if it['’]s a spell with lesser mana value\. if you don['’]t cast it, put it into your hand(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [
        makeClause('effect.reveal-top-cast', 'revealTopCast', {}, { start: pos, end: r.pos }),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.exile-top-put-cast-each-type`: "exile the top eight cards of your library. You may put a land card from among them onto the battlefield. Until end of turn, for each
 * nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost." (CR 701.13: the cards are exiled face up; CR 608.2d: the player
 * chooses as the effect comes up; CR 611.2a, 601.2, 118.9: until the end of the turn each card type lets one spell of that type be cast from among the exiled cards without
 * paying its mana cost, at its normal timing). The three sentences are one instruction, kept together by the segmenter ("them" and "the exiled cards" are the cards the first
 * one exiled). The clauses are written in the order the engine runs them: the permission names the cards the exile moved, which the choice of a land would replace as `moved`; the
 * land chosen is no longer in exile, so it has no permission, and the choice and the permission do not affect each other. Not read: a card that is not the exile of the top of your
 * library, one card, a card put into the hand, another duration or kind of card ("for each card type", "a creature spell"), a mana cost paid.
 */
export const EFFECT_EXILE_TOP_PUT_CAST_EACH_TYPE = defineRule<Clauses>({
  id: 'effect.exile-top-put-cast-each-type',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 701.13 (Exile)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 611.2a (Continuous Effects)',
    'CR 601.2 (Casting Spells)',
    'CR 118.9 (Costs)',
  ],
  examples: [
    'exile the top eight cards of your library. you may put a land card from among them onto the battlefield. until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost',
    'exile the top four cards of your library. you may put a land card from among them onto the battlefield. until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost',
  ],
  rejects: [
    'exile the top eight cards of your library. you may put a land card from among them onto the battlefield',
    'exile the top eight cards of your library. you may put a land card from among them into your hand. until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost',
    'exile the top eight cards of your library. you may put a land card from among them onto the battlefield. until end of turn, for each card type, you may cast a spell of that type from among the exiled cards without paying its mana cost',
    'exile the top eight cards of your library. you may put a land card from among them onto the battlefield. until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards',
    'exile the top eight cards of your library. you may put a land card from among them onto the battlefield. until your next turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost',
    'exile the top card of your library. you may put a land card from among them onto the battlefield. until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost',
    "exile the top eight cards of target player's library. you may put a land card from among them onto the battlefield. until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost",
    'exile the top eight cards of your library. you may put two land cards from among them onto the battlefield. until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost',
    'exile the top eight cards of your library. you may put a land card from among them onto the battlefield. until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost and draw a card',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-top-put-cast-each-type';
    const r = sequence(
      pattern(/exile the top /iu),
      spanned(satisfy(quantity, (n) => n >= 2)),
      pattern(/ cards of your library\. you may put /iu),
      TAKEN_CARD,
      pattern(
        / from among them onto the battlefield\. until end of turn, for each nonland card type, you may cast a spell of that type from among the exiled cards without paying its mana cost(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, counted, , objects] = r.value;
    const span = { start: pos, end: r.pos };
    const count: IrAmount = { kind: 'number', value: counted.value, span: counted.span };
    const may: IrFlag = { kind: 'flag', value: true, span, rule: id };
    return {
      ok: true,
      value: [
        makeClause(id, 'exileTop', { count }, span),
        makeClause(id, 'mayCastEachType', {}, span),
        makeClause(id, 'putFromAmongExiled', { objects, may }, span),
      ],
      pos: r.pos,
    };
  },
});

/** Quiet: the words "reveal the top" and "exile the top" start other rules' lines, which must stop where they always did. */
export const TROYAN_G4_EFFECT_RULES = [
  quietly(EFFECT_REVEAL_TOP_CAST),
  quietly(EFFECT_EXILE_TOP_PUT_CAST_EACH_TYPE),
];
