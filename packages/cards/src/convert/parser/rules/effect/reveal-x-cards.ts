/**
 * Effect rules of the Quandrix Unlimited deck, group D2: the two instructions that reveal as many cards as an X says and put the cards of one kind onto the battlefield tapped, the rest on
 * the bottom of the library in a random order (CR 701.20 Reveal, 401.4, 107.3a, 110.2a).
 */
import { literal, map, pattern, sequence } from '../../combinators';
import type { IrAmount, IrClause, IrNoun } from '../../ir/types';
import { NO_PARTS, toFilter } from '../noun/phrases';
import { defineRule, spanned } from '../registry';
import { type Clauses, single } from './operands';

export const KIND = '(land|creature|artifact|enchantment)';

/** The kind of card the instruction picks out, as the noun of a card in a library ("land cards": a plural noun, no article). */
export function kindOfCards(
  rule: string,
  type: string,
  span: { start: number; end: number },
): IrNoun {
  return {
    kind: 'noun',
    det: 'a',
    filter: { ...toFilter('library', { ...NO_PARTS, types: [type] }, `${type} cards`), card: true },
    upTo: false,
    plural: true,
    other: false,
    span,
    rule,
  };
}

const X_AMOUNT = () =>
  map(spanned(pattern(/X(?![\p{L}\p{N}])/u)), ({ span }): IrAmount => ({ kind: 'x', span }));

/**
 * `effect.reveal-until-x`: "reveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest on the bottom of your
 * library in a random order" (CR 701.20, 401.4, 107.3a: the cards are revealed one at a time until X of the kind have been revealed, all of them if the library runs out first). Two
 * sentences that `splitSentences` keeps together. The engine's `revealUntil` with a `count`; the kind in the second sentence must be the one of the first.
 */
export const EFFECT_REVEAL_UNTIL_X = defineRule<Clauses>({
  id: 'effect.reveal-until-x',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20 (Reveal)',
    'CR 401.4 (Library)',
    'CR 107.3a (Numbers and Symbols)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'reveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal X creature cards. Put those creature cards onto the battlefield tapped and the rest on the bottom of your library in a random order',
  ],
  rejects: [
    'reveal cards from the top of your library until you reveal X land cards',
    'reveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield tapped',
    'reveal cards from the top of your library until you reveal X land cards. Put those creature cards onto the battlefield tapped and the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield and the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal two land cards. Put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal X land cards. Put those land cards into your hand and the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal X land cards. Put those land cards onto the battlefield tapped and the rest into your graveyard',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.reveal-until-x';
    const head = literal('reveal cards from the top of your library until you reveal ')(ctx, pos);
    if (!head.ok) return head;
    const x = X_AMOUNT()(ctx, head.pos);
    if (!x.ok) return x;
    const kind = spanned(pattern(new RegExp(` ${KIND} cards(?![\\p{L}\\p{N}])`, 'u')))(ctx, x.pos);
    if (!kind.ok) return kind;
    const type = kind.value.value[1] ?? '';
    const tail = pattern(
      new RegExp(
        `\\. put those ${type} cards onto the battlefield tapped and the rest on the bottom of your library in a random order(?![\\p{L}\\p{N}])`,
        'iu',
      ),
    )(ctx, kind.pos);
    if (!tail.ok) return tail;
    const span = { start: pos, end: tail.pos };
    const clause: IrClause = {
      kind: 'clause',
      verb: 'revealUntilX',
      args: { card: kindOfCards(id, type, kind.value.span), count: x.value },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: [clause], pos: tail.pos };
  },
});

/**
 * `effect.reveal-until-x-graveyard`: "reveal cards from the top of your library until you reveal X creature cards. Put all creature cards revealed this way into your graveyard, then put the rest
 * on the bottom of your library in a random order" (CR 701.20, 401.4, 107.3a: the cards are revealed one at a time until X of the kind have been revealed, all of them if the library runs out
 * first; the cards of the kind are put into the graveyard, not milled). Two sentences that `splitSentences` keeps together. The engine's `revealUntil` with a `count` and `put: 'graveyard'`;
 * the kind in the second sentence must be the one of the first.
 */
export const EFFECT_REVEAL_UNTIL_X_GRAVEYARD = defineRule<Clauses>({
  id: 'effect.reveal-until-x-graveyard',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20 (Reveal)',
    'CR 401.4 (Library)',
    'CR 107.3a (Numbers and Symbols)',
    'CR 404.1 (Graveyard)',
  ],
  examples: [
    'reveal cards from the top of your library until you reveal X creature cards. Put all creature cards revealed this way into your graveyard, then put the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal X land cards. Put all land cards revealed this way into your graveyard, then put the rest on the bottom of your library in a random order',
  ],
  rejects: [
    'reveal cards from the top of your library until you reveal X creature cards',
    'reveal cards from the top of your library until you reveal X creature cards. Put all creature cards revealed this way into your graveyard',
    'reveal cards from the top of your library until you reveal X creature cards. Put all land cards revealed this way into your graveyard, then put the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal two creature cards. Put all creature cards revealed this way into your graveyard, then put the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal X creature cards. Put all creature cards revealed this way into your hand, then put the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal X creature cards. Put all creature cards revealed this way into your graveyard, then put the rest into your hand',
    "reveal cards from the top of your library until you reveal X creature cards. Put all creature cards revealed this way into an opponent's graveyard, then put the rest on the bottom of your library in a random order",
  ],
  parse: (ctx, pos) => {
    const id = 'effect.reveal-until-x-graveyard';
    const head = literal('reveal cards from the top of your library until you reveal ')(ctx, pos);
    if (!head.ok) return head;
    const x = X_AMOUNT()(ctx, head.pos);
    if (!x.ok) return x;
    const kind = spanned(pattern(new RegExp(` ${KIND} cards(?![\\p{L}\\p{N}])`, 'u')))(ctx, x.pos);
    if (!kind.ok) return kind;
    const type = kind.value.value[1] ?? '';
    const tail = pattern(
      new RegExp(
        `\\. put all ${type} cards revealed this way into your graveyard, then put the rest on the bottom of your library in a random order(?![\\p{L}\\p{N}])`,
        'iu',
      ),
    )(ctx, kind.pos);
    if (!tail.ok) return tail;
    const span = { start: pos, end: tail.pos };
    const clause: IrClause = {
      kind: 'clause',
      verb: 'revealUntilXGraveyard',
      args: { card: kindOfCards(id, type, kind.value.span), count: x.value },
      optional: false,
      span,
      rule: id,
    };
    return { ok: true, value: [clause], pos: tail.pos };
  },
});

/**
 * `effect.reveal-put-all`: "reveal the top X cards of your library. Put all land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random
 * order" (CR 701.20, 401.4, 107.3a: the top X cards are revealed together; every card of the kind among them goes, no choice). Two sentences that `splitSentences` keeps together. The
 * engine's `lookAtTop` of a reveal with `take.all`; the cards put are what "those lands" of a following sentence names.
 */
export const EFFECT_REVEAL_PUT_ALL = defineRule<Clauses>({
  id: 'effect.reveal-put-all',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20 (Reveal)',
    'CR 401.4 (Library)',
    'CR 107.3a (Numbers and Symbols)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'reveal the top X cards of your library. Put all land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order',
    'reveal the top X cards of your library. Put all creature cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order',
  ],
  rejects: [
    'reveal the top X cards of your library',
    'reveal the top X cards of your library. Put all land cards from among them onto the battlefield tapped',
    'reveal the top X cards of your library. Put all land cards from among them onto the battlefield and the rest on the bottom of your library in a random order',
    'reveal the top X cards of your library. Put all land cards from among them into your hand and the rest on the bottom of your library in a random order',
    'reveal the top three cards of your library. Put all land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order',
    'reveal the top X cards of your library. Put a land card from among them onto the battlefield tapped and the rest on the bottom of your library in a random order',
    'reveal the top X cards of your library. Put all land cards from among them onto the battlefield tapped and the rest into your graveyard',
  ],
  parse: single(
    'effect.reveal-put-all',
    sequence(
      literal('reveal the top '),
      X_AMOUNT(),
      literal(' cards of your library. put all '),
      spanned(pattern(new RegExp(`${KIND}(?= cards from among them)`, 'u'))),
      literal(
        ' cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order',
      ),
    ),
    ([, count, , kind]) => ({
      verb: 'revealTopPutAll',
      args: { count, card: kindOfCards('effect.reveal-put-all', kind.value[1] ?? '', kind.span) },
    }),
  ),
});

/**
 * `effect.untap-those-lands`: "untap those lands" (CR 701.26a Untap, 608.2c: the lands the instruction before it put onto the battlefield, Animist's Awakening). The lowering reads the
 * group from that instruction (the engine's `moved`) and refuses the sentence after any other. Not read: "untap those", "untap those land", "untap them", "untap those creatures"
 * (`effect.untap-those` reads a group a pump named).
 */
export const EFFECT_UNTAP_THOSE_LANDS = defineRule<Clauses>({
  id: 'effect.untap-those-lands',
  family: 'effect',
  leading: ['untap'],
  cites: ['CR 701.26a (Tap and Untap)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['untap those lands'],
  rejects: [
    'untap those',
    'untap those land',
    'untap them',
    'untap those creatures',
    'untap those lands you control',
  ],
  parse: single('effect.untap-those-lands', pattern(/untap those lands(?![\p{L}\p{N}])/iu), () => ({
    verb: 'untapMoved',
    args: {},
  })),
});

/**
 * `effect.reveal-top-card`: "reveal the top card of your library" as an instruction of its own, with the card it shows left for what follows to read ("Scry 3, then reveal the top
 * card of your library. Draw cards equal to that card's mana value." Interpret the Signs; CR 701.20a: revealing shows the card to every player and it stays in the library; CR 608.2c).
 * "That card" of a later instruction of the same text is the card revealed (the binding pass, the engine's `moved`). The engine's `revealTopCard` of your own library. Not read: more
 * than the top card, another library, a count of cards, another zone. The sentences that give the card an "If it's ..." test are other rules (`effect.reveal-top-then`).
 */
export const EFFECT_REVEAL_TOP_CARD = defineRule<Clauses>({
  id: 'effect.reveal-top-card',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 401.5 (Library)',
  ],
  examples: ['reveal the top card of your library'],
  rejects: [
    'reveal the top two cards of your library',
    'reveal the top cards of your library',
    'reveal the top card of target player’s library',
    'reveal the top card of each player’s library',
    'reveal the top card of your graveyard',
    'reveal the top card of their library',
    'reveal your top card',
    // Another sentence about the card is one of the other reveal rules (reveal-top-then, reveal-top-branches, reveal-top-cast), never this one with a tail left unread.
    "reveal the top card of your library. If it's a land card, you gain 1 life",
  ],
  parse: single(
    'effect.reveal-top-card',
    pattern(/reveal the top card of your library(?![\p{L}\p{N}])(?!\.\s*\S)/iu),
    () => ({ verb: 'revealTopCard', args: {} }),
  ),
});

export const REVEAL_X_CARDS_EFFECT_RULES = [
  EFFECT_REVEAL_UNTIL_X,
  EFFECT_REVEAL_UNTIL_X_GRAVEYARD,
  EFFECT_REVEAL_PUT_ALL,
  EFFECT_UNTAP_THOSE_LANDS,
  EFFECT_REVEAL_TOP_CARD,
];
