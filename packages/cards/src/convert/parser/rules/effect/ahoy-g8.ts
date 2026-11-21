/**
 * Effect rules of group 8 of the Ahoy Mateys deck (graveyard and library effects).
 *
 * - `effect.choose-card-in-a-graveyard-this-turn`: "Choose up to one target card in a graveyard that was discarded or put there from a library this turn." (Ghost of Ramirez DePietro,
 *   CR 115.1, 601.2c, 602.2b, 701.9, 701.17).
 * - `effect.put-that-card-into-owners-hand`: "Put that card into its owner's hand." (Ghost of Ramirez DePietro, CR 608.2c, 108.3, 400.3).
 * - `effect.gain-escape`: "Until end of turn, each creature card in your graveyard gains "Escape-{3}{B}, Exile four other cards from your graveyard."" (The Grim Captain's Locker, CR 702.138a,
 *   611.2a, 611.2c).
 */
import {
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrAmount, IrCost, IrDuration, IrFilter, IrNoun, IrZoneSpec } from '../../ir/types';
import { quantity } from '../amount/index';
import { BOUNDARY, CARD_TYPES } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, operands, single } from './operands';

const ID = 'effect.choose-card-in-a-graveyard-this-turn';

/**
 * `effect.choose-card-in-a-graveyard-this-turn`: "choose up to one target card in a graveyard that was discarded or put there from a library this turn" (CR 115.1, 601.2c: the target
 * is chosen as the ability is put on the stack; the words only name it for the sentence after, which says "that card"). The engine's target of the ability, with no effect of its own
 * (as `effect.choose-target`). Not read: "choose" without a target, two cards, a graveyard of one player, another instruction in the same sentence.
 */
export const EFFECT_CHOOSE_CARD_IN_A_GRAVEYARD_THIS_TURN = defineRule<Clauses>({
  id: ID,
  family: 'effect',
  leading: ['choose'],
  cites: [
    'CR 115.1 (Targets)',
    'CR 601.2c (Casting Spells)',
    'CR 602.2b (Activating Activated Abilities)',
  ],
  examples: [
    'choose up to one target card in a graveyard that was discarded or put there from a library this turn',
    'Choose up to one target card in a graveyard that was discarded or put there from a library this turn',
    'choose target card in a graveyard that was discarded or put there from a library this turn',
  ],
  rejects: [
    'choose',
    'choose up to one target card in a graveyard',
    'choose up to two target cards in a graveyard that was discarded or put there from a library this turn',
    'choose up to one card in a graveyard that was discarded or put there from a library this turn',
    'choose up to one target card in your graveyard that was discarded or put there from a library this turn',
    'choose up to one target card in a graveyard that was discarded or put there from a library this turn and draw a card',
    'choose one',
  ],
  parse: single(
    ID,
    sequence(
      literal('choose '),
      operands(['noun.target-card-in-a-graveyard-this-turn'], ID, {
        accept: (noun) =>
          noun.det === 'target' && !noun.plural && (noun.count === undefined || noun.upTo),
        locate: (noun) => noun.span.start,
      }),
    ),
    ([, what]) => ({ verb: 'chooseTarget', args: { what } }),
  ),
});

const PUT_ID = 'effect.put-that-card-into-owners-hand';

/**
 * `effect.put-that-card-into-owners-hand`: "put that card into its owner's hand" (CR 608.2c: the card an earlier instruction of the text chose from a graveyard; CR 108.3, 400.3: a card
 * goes to the hand of its owner). It says what "return that card to its owner's hand" says (`effect.return`), with the verb "put": the engine's `moveToZone` of the target to the hand. The
 * lowering reads it only after an instruction that chose a card of a graveyard. Not read: "it", "those cards", another zone, "your hand".
 */
export const EFFECT_PUT_THAT_CARD_INTO_OWNERS_HAND = defineRule<Clauses>({
  id: PUT_ID,
  family: 'effect',
  leading: ['put'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 108.3 (Cards)', 'CR 400.3 (General)'],
  examples: [
    "put that card into its owner's hand",
    "Put that card into its owner's hand",
    "put that creature card into its owner's hand",
  ],
  rejects: [
    'put that card into your hand',
    "put it into its owner's hand",
    "put those cards into their owners' hands",
    "put that card into its owner's library",
    "put that card onto the battlefield under its owner's control",
    "put that card into its owner's hand and draw a card",
    'put that card',
  ],
  parse: single(
    PUT_ID,
    sequence(
      literal('put '),
      operands(['noun.that-card'], PUT_ID),
      map(
        spanned(pattern(/ into its owner['’]s hand/iu)),
        ({ span }): IrZoneSpec => ({
          kind: 'zoneSpec',
          zone: 'hand',
          whose: 'owner',
          span,
          rule: PUT_ID,
        }),
      ),
    ),
    ([, objects, to]) => ({ verb: 'return', args: { objects, to } }),
  ),
});

const ESCAPE_ID = 'effect.gain-escape';

/**
 * "each creature card in your graveyard": the cards of one card type that an effect gives escape to, as the noun of the clause. The filter names the cards by what they are: no zone and
 * no controller (the words "in your graveyard" are read here, and the engine's grant is about the graveyard of its controller). One type only.
 */
const ESCAPE_CARDS: Parser<IrNoun> = (ctx, pos) => {
  const r = sequence(
    literal('each '),
    pattern(new RegExp(`(${CARD_TYPES}) cards? in your graveyard${BOUNDARY}`, 'iu')),
  )(ctx, pos);
  if (!r.ok) return r;
  const types = [(r.value[1][1] ?? '').toLowerCase()];
  const filter: IrFilter = { types, card: true, raw: ctx.text.slice(pos, r.pos) };
  return {
    ok: true,
    value: {
      kind: 'noun',
      det: 'each',
      filter,
      upTo: false,
      plural: true,
      other: false,
      span: { start: pos, end: r.pos },
      rule: ESCAPE_ID,
    },
    pos: r.pos,
  };
};

/**
 * `effect.gain-escape`: "until end of turn, each creature card in your graveyard gains "Escape—{3}{B}, Exile four other cards from your graveyard."" (CR 702.138a: escape, cast from the
 * graveyard for its cost, exiling other cards of it; CR 611.2a, 611.2c: the effect lasts until end of turn and affects the cards in the graveyard as it resolves). The engine's `gainEscape`.
 * Not read: another graveyard, another duration, a cost that is not mana, another way to pay (no cards exiled, cards of another zone), "target", two types, a quote that is not closed.
 */
export const EFFECT_GAIN_ESCAPE = defineRule<Clauses>({
  id: ESCAPE_ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 702.138a (Escape)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 118.9 (Alternative Costs)',
  ],
  examples: [
    'Until end of turn, each creature card in your graveyard gains "Escape—{3}{B}, Exile four other cards from your graveyard."',
    'Until end of turn, each creature card in your graveyard gains "Escape—{2}{U}, Exile two other cards from your graveyard."',
    'Until end of turn, each land card in your graveyard gains "Escape—{1}{G}, Exile three other cards from your graveyard."',
  ],
  rejects: [
    'Until end of turn, each creature card in your graveyard gains "Escape—{3}{B}, Exile four other cards from your graveyard"',
    'Until end of turn, each creature card in a graveyard gains "Escape—{3}{B}, Exile four other cards from your graveyard."',
    'Until end of turn, each creature card in your graveyard gains "Escape—{3}{B}, Exile four other cards from a graveyard."',
    'Until end of turn, each creature card in your graveyard gains "Escape—{3}{B}, Exile four cards from your graveyard."',
    'Until end of turn, each creature card in your graveyard gains "Escape—{3}{B}, Exile zero other cards from your graveyard."',
    'Until end of turn, each creature card in your graveyard gains "Escape—{3}{B}, Sacrifice a creature."',
    'Until end of turn, each creature card in your graveyard gains "Escape—Pay 3 life, Exile four other cards from your graveyard."',
    'Until end of turn, each creature and land card in your graveyard gains "Escape—{3}{B}, Exile four other cards from your graveyard."',
    'Until end of turn, target creature card in your graveyard gains "Escape—{3}{B}, Exile four other cards from your graveyard."',
    'Until your next turn, each creature card in your graveyard gains "Escape—{3}{B}, Exile four other cards from your graveyard."',
    'Each creature card in your graveyard gains "Escape—{3}{B}, Exile four other cards from your graveyard." until end of turn',
    'Until end of turn, each creature card in your graveyard gains "Escape—{3}{B}, Exile four other cards from your graveyard." and flying',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      family<IrDuration>('duration'),
      literal(', '),
      ESCAPE_CARDS,
      pattern(/ gains ["“]escape\s*[—–-]\s*/iu),
      family<IrCost>('cost', { only: ['cost.mana'] }),
      literal(', exile '),
      spanned(satisfy(quantity, (n) => n >= 1)),
      pattern(/ other cards? from your graveyard\.["”]/iu),
      // Nothing else in the sentence: "... and flying", "... until end of turn".
      optional(pattern(/(?=\s*$|\s*\.|\s*\n)/u), null),
    )(ctx, pos);
    if (!r.ok) return r;
    const [duration, , cards, , cost, , exile] = r.value;
    if (exile.value > 100 || !/^(?:\s*$|\s*\.|\s*\n)/u.test(ctx.text.slice(r.pos))) {
      return fail(ctx, pos);
    }
    const span = { start: pos, end: r.pos };
    const count: IrAmount = { kind: 'number', value: exile.value, span: exile.span };
    return {
      ok: true,
      value: [
        {
          kind: 'clause',
          verb: 'gainEscape',
          args: {
            cards,
            cost: { kind: 'costList', costs: [cost], span: cost.span, rule: ESCAPE_ID },
            exile: count,
          },
          optional: false,
          duration,
          span,
          rule: ESCAPE_ID,
        },
      ],
      pos: r.pos,
    };
  },
});

/** Quiet: each starts like other instructions ("choose ...", "put ...", "until ..."), and must leave the diagnostics of the lines it does not read where they were. */
export const AHOY_G8_EFFECT_RULES = [
  EFFECT_CHOOSE_CARD_IN_A_GRAVEYARD_THIS_TURN,
  EFFECT_PUT_THAT_CARD_INTO_OWNERS_HAND,
  EFFECT_GAIN_ESCAPE,
].map(quietly);
