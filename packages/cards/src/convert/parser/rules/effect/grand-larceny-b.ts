/**
 * Effect rules of the Grand Larceny deck, group B (Extract Brain, Villainous Wealth, Stolen Goods, Silent-Blade Oni, Mind's Dilation, Fallen Shinobi, Oblivion Sower, Nashi, Moon Sage's
 * Scion): a player other than the controller exiles cards from the top of their library, or has cards of their hand looked at, and the controller casts or plays them for free. The
 * lowerings are in `lower/grand-larceny-b.ts`.
 */
import { choice, fail, literal, map, pattern, satisfy, sequence } from '../../combinators';
import type { IrAmount, IrDuration, IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family, quietly, spanned } from '../registry';
import { makeNoun } from '../trigger/subjects';
import { flag } from './dragons';
import { type Clauses, makeClause, single } from './operands';

/** The player who does it: "that player" (the player of the trigger, or the one the text named before) or one target player or opponent. */
const SUBJECT = choice<IrNoun>(
  family<IrNoun>('noun', { only: ['noun.that-player'] }),
  satisfy(
    family<IrNoun>('noun', { only: ['noun.player'] }),
    (noun) => noun.det === 'target' && noun.anyNumber !== true,
  ),
);

const TOP_ID = 'effect.player-exiles-top-of-their-library';

/**
 * `effect.player-exiles-top-of-their-library`: "that player exiles the top card of their library", "target opponent exiles the top four cards of their library", "target opponent exiles the
 * top X cards of their library" (CR 701.13, 401.1, 603.2): the player the text names exiles that many cards from the top of their own library, one after the other, face up; they are what
 * "those cards" names afterwards. The engine's `exileTop` with `from`. Not read: another player ("each opponent"), your own library, a number of one in the plural, "until",
 * a trailing instruction in the same clause ("and ...").
 */
export const EFFECT_PLAYER_EXILES_TOP = defineRule<Clauses>({
  id: TOP_ID,
  family: 'effect',
  leading: ['that', 'target'],
  cites: ['CR 701.13 (Exile)', 'CR 401.1 (Library)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: [
    'that player exiles the top card of their library',
    'that player exiles the top two cards of their library',
    'target opponent exiles the top four cards of their library',
    'target opponent exiles the top X cards of their library',
    'target player exiles the top card of their library',
    // Outrageous Robbery (issue 685, CR 406.3): the cards are exiled face down.
    'target opponent exiles the top X cards of their library face down',
  ],
  rejects: [
    'each opponent exiles the top card of their library',
    'that player exiles the top card of your library',
    'that player exiles the top one cards of their library',
    'that player exiles the top card of their library face up',
    'that player exiles the top cards of their library',
    'that player exiles cards from the top of their library until they exile a nonland card',
    'that player exiles the top card of their library and draws a card',
    'that player exiles the top card of their graveyard',
    'that player exiles top card of their library',
  ],
  parse: (ctx, pos) => {
    const who = SUBJECT(ctx, pos);
    if (!who.ok) return who;
    const head = literal(' exiles the top ')(ctx, who.pos);
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
    const tail = pattern(new RegExp(` of their library( face down)?${BOUNDARY}(?! and\\b)`, 'iu'))(
      ctx,
      counted.pos,
    );
    if (!tail.ok) return tail;
    const { value, span } = counted.value;
    const count: IrAmount = value === 'x' ? { kind: 'x', span } : { kind: 'number', value, span };
    return {
      ok: true,
      value: [
        makeClause(
          TOP_ID,
          'exileTop',
          {
            count,
            from: who.value,
            ...(tail.value[1] === undefined
              ? {}
              : { faceDown: flag(TOP_ID, true, { start: pos, end: tail.pos }) }),
          },
          { start: pos, end: tail.pos },
        ),
      ],
      pos: tail.pos,
    };
  },
});

const UNTIL_ID = 'effect.player-exiles-until-found';

/**
 * `effect.player-exiles-until-found`: "target opponent exiles cards from the top of their library until they exile a nonland card" (Stolen Goods; CR 701.13, 401.1): the player the text
 * names exiles cards from the top of their own library one at a time, face up, until a card of the kind is exiled or the library is empty; every card exiled is what "that card" names
 * afterwards. The engine's `exileUntilFound`. Not read: another player, another place, a following "you may cast" in the same sentence (`effect.player-exiles-until-cast`), "and ...".
 */
export const EFFECT_PLAYER_EXILES_UNTIL_FOUND = defineRule<Clauses>({
  id: UNTIL_ID,
  family: 'effect',
  leading: ['target'],
  cites: ['CR 701.13 (Exile)', 'CR 401.1 (Library)', 'CR 608.2g (Resolving Spells and Abilities)'],
  examples: [
    'target opponent exiles cards from the top of their library until they exile a nonland card',
    'target player exiles cards from the top of their library until they exile a nonland card',
  ],
  rejects: [
    'each opponent exiles cards from the top of their library until they exile a nonland card',
    'target opponent exiles cards from the top of your library until they exile a nonland card',
    'target opponent exiles cards from their graveyard until they exile a nonland card',
    'target opponent exiles cards from the top of their library until they exile a nonland card and draws a card',
    'target opponent exiles cards from the top of their library',
    'target opponent exiles cards from the top of their library until you exile a nonland card',
  ],
  parse: single(
    UNTIL_ID,
    sequence(
      satisfy(
        family<IrNoun>('noun', { only: ['noun.player'] }),
        (noun) => noun.det === 'target' && noun.anyNumber !== true,
      ),
      literal(' exiles cards from the top of their library until they exile '),
      family<IrNoun>('noun', { only: ['noun.library-card'] }),
      // Not the first sentence of a longer instruction (`effect.player-exiles-until-cast`).
      pattern(/(?![\p{L}\p{N}])(?! and\b)(?!,)(?!\.\s)/u),
    ),
    ([player, , card]) => ({
      verb: 'playerExilesUntil',
      args: { player, card: { ...card, upTo: false, plural: false } },
    }),
  ),
});

const LANDS_ID = 'effect.put-owned-lands-from-exile';

/**
 * `effect.put-owned-lands-from-exile`: "you may put any number of land cards that player owns from exile onto the battlefield under your control" (Oblivion Sower; CR 608.2d, 108.3, 110.2a):
 * the controller chooses none, some or all of the land cards in exile that the player the text named owns (every one there, not only the ones just exiled), and they enter under the
 * controller's control. The engine's `moveToZone` of a `choose` with `fromExileOf`. Not read: another card kind, another place, tapped, "target", "up to", a trailing instruction.
 */
export const EFFECT_PUT_OWNED_LANDS_FROM_EXILE = defineRule<Clauses>({
  id: LANDS_ID,
  family: 'effect',
  leading: ['you', 'put'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 108.3 (Objects)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'you may put any number of land cards that player owns from exile onto the battlefield under your control',
    'put any number of land cards that player owns from exile onto the battlefield under your control',
  ],
  rejects: [
    'you may put any number of land cards that player owns from exile onto the battlefield',
    'you may put any number of creature cards that player owns from exile onto the battlefield under your control',
    'you may put any number of land cards that player owns from their graveyard onto the battlefield under your control',
    "you may put any number of land cards that player owns from exile onto the battlefield under that player's control",
    'you may put a land card that player owns from exile onto the battlefield under your control',
    'you may put any number of land cards that player owns from exile onto the battlefield under your control and draw a card',
    'you may put any number of land cards you own from exile onto the battlefield under your control',
  ],
  parse: (ctx, pos) => {
    const head = pattern(/(?:you may )?put any number of land cards /iu)(ctx, pos);
    if (!head.ok) return head;
    const owner = family<IrNoun>('noun', { only: ['noun.that-player'] })(ctx, head.pos);
    if (!owner.ok) return owner;
    const tail = pattern(
      new RegExp(
        ` owns from exile onto the battlefield under your control${BOUNDARY}(?!,| and\\b| then\\b)`,
        'iu',
      ),
    )(ctx, owner.pos);
    if (!tail.ok) return tail;
    return {
      ok: true,
      value: [
        makeClause(
          LANDS_ID,
          'putOwnedLandsFromExile',
          { owner: owner.value },
          {
            start: pos,
            end: tail.pos,
          },
        ),
      ],
      pos: tail.pos,
    };
  },
});

const CHOOSES_ID = 'effect.player-chooses-cards-from-their-hand';

/**
 * `effect.player-chooses-cards-from-their-hand`: "target opponent chooses X cards from their hand" (Extract Brain; CR 608.2d, 402.3): the one player the ability targets chooses that many
 * cards of their own hand, all of it when it holds fewer; the cards stay where they are and are what "those cards" and "them" name afterwards. The engine's `handCards` with `count`. Not
 * read: another player, a number of one in the plural, another place, "of your choice", a trailing instruction.
 */
export const EFFECT_PLAYER_CHOOSES_CARDS_FROM_HAND = defineRule<Clauses>({
  id: CHOOSES_ID,
  family: 'effect',
  leading: ['target'],
  cites: ['CR 608.2d (Resolving Spells and Abilities)', 'CR 402.3 (Hand)'],
  examples: [
    'target opponent chooses X cards from their hand',
    'target player chooses two cards from their hand',
  ],
  rejects: [
    'each opponent chooses X cards from their hand',
    'target opponent chooses X cards from your hand',
    'target opponent chooses X cards from their graveyard',
    'target opponent chooses one cards from their hand',
    'target opponent chooses cards from their hand',
    'target opponent chooses X cards from their hand and discards them',
    'target opponent chooses X cards at random from their hand',
  ],
  parse: (ctx, pos) => {
    const who = satisfy(
      family<IrNoun>('noun', { only: ['noun.player'] }),
      (noun) => noun.det === 'target' && noun.anyNumber !== true,
    )(ctx, pos);
    if (!who.ok) return who;
    const head = literal(' chooses ')(ctx, who.pos);
    if (!head.ok) return head;
    const counted = spanned(
      choice<number | 'x'>(
        map(
          sequence(
            satisfy(quantity, (n) => n >= 2),
            literal(' cards'),
          ),
          ([n]) => n,
        ),
        map(literal('X cards'), () => 'x' as const),
      ),
    )(ctx, head.pos);
    if (!counted.ok) return counted;
    const tail = pattern(new RegExp(` from their hand${BOUNDARY}(?!,| and\\b| then\\b)`, 'iu'))(
      ctx,
      counted.pos,
    );
    if (!tail.ok) return tail;
    const { value, span } = counted.value;
    const count: IrAmount = value === 'x' ? { kind: 'x', span } : { kind: 'number', value, span };
    return {
      ok: true,
      value: [
        makeClause(
          CHOOSES_ID,
          'handCards',
          { player: who.value, count },
          { start: pos, end: tail.pos },
        ),
      ],
      pos: tail.pos,
    };
  },
});

const LOOK_HAND_ID = 'effect.look-at-that-players-hand';

/**
 * `effect.look-at-that-players-hand`: "look at that player's hand" (Silent-Blade Oni; CR 402.3, 603.2): the controller looks at every card of the hand of the player the trigger names;
 * the cards are what "those cards" names afterwards. The engine's `handCards` without `count`. Not read: your own hand, target players, "the top card", a trailing instruction.
 */
export const EFFECT_LOOK_AT_THAT_PLAYERS_HAND = defineRule<Clauses>({
  id: LOOK_HAND_ID,
  family: 'effect',
  leading: ['look'],
  cites: ['CR 402.3 (Hand)', 'CR 603.2 (Handling Triggered Abilities)'],
  examples: ["look at that player's hand", 'look at that player’s hand'],
  rejects: [
    'look at your hand',
    "look at target player's hand",
    "look at that player's hand and discard a card",
    "look at that player's library",
    'look at that players hand',
    "look at that player's hand, then draw a card",
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(new RegExp(`look at that player['’]s hand${BOUNDARY}(?!,| and\\b| then\\b)`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return r;
    const player = makeNoun(LOOK_HAND_ID, r.value.span, 'triggerActor', { raw: 'that player' });
    return {
      ok: true,
      value: [makeClause(LOOK_HAND_ID, 'handCards', { player }, r.value.span)],
      pos: r.pos,
    };
  },
});

const LOOK_THOSE_ID = 'effect.look-at-those-cards';

/**
 * `effect.look-at-those-cards` (CR 402.3, 608.2d): "look at those cards", after the player chose cards of their hand. It does nothing of its own: the controller looks at the cards when
 * the instruction after it asks which to cast, and the cards are the ones the instruction before it named. Not read: "them", another group, a trailing instruction.
 */
export const EFFECT_LOOK_AT_THOSE_CARDS = defineRule<Clauses>({
  id: LOOK_THOSE_ID,
  family: 'effect',
  leading: ['look'],
  cites: ['CR 402.3 (Hand)', 'CR 608.2d (Resolving Spells and Abilities)'],
  examples: ['look at those cards', 'Look at those cards'],
  rejects: [
    'look at them',
    'look at those cards and discard one',
    'look at those',
    'look at the cards',
    'look at those cards, then draw a card',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(new RegExp(`look at those cards${BOUNDARY}(?!,| and\\b| then\\b)`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    return {
      ok: true,
      value: [makeClause(LOOK_THOSE_ID, 'lookAtThoseCards', {}, r.value.span)],
      pos: r.pos,
    };
  },
});

const ONE_ID = 'effect.may-play-one-pay-life';

/**
 * `effect.may-play-one-pay-life`: "Until end of turn, you may play one of those cards. If you cast a spell this way, pay life equal to its mana value rather than paying its mana cost."
 * (Nashi, Moon Sage's Scion; CR 118.9, 119.4, 601.2, 305.1, 611.2a): the controller may play one of the cards the instruction before it exiled (a land as a land drop), and a spell cast that
 * way is cast by paying life equal to its mana value and no mana cost. The two sentences are one instruction that `splitSentences` keeps together. The engine's `mayPlay` with `oneOf` and
 * `lifeForMana`. Not read: another length, "cast", more than one card, another cost, a trailing instruction.
 */
export const EFFECT_MAY_PLAY_ONE_PAY_LIFE = defineRule<Clauses>({
  id: ONE_ID,
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 118.9 (Alternative Costs)',
    'CR 601.2 (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 611.2a (Continuous Effects)',
  ],
  examples: [
    'until end of turn, you may play one of those cards. if you cast a spell this way, pay life equal to its mana value rather than paying its mana cost',
  ],
  rejects: [
    'until end of turn, you may play one of those cards',
    'until end of turn, you may cast one of those cards. if you cast a spell this way, pay life equal to its mana value rather than paying its mana cost',
    'until end of turn, you may play those cards. if you cast a spell this way, pay life equal to its mana value rather than paying its mana cost',
    'until end of turn, you may play one of those cards. if you cast a spell this way, pay life equal to its power rather than paying its mana cost',
    'until end of turn, you may play one of those cards. if you cast a spell this way, pay life equal to its mana value rather than paying its mana cost and draw a card',
    'until your next turn, you may play one of those cards. if you cast a spell this way, pay life equal to its mana value rather than paying its mana cost',
    'until end of turn, you may play one of those cards. if you cast a spell this way, pay life equal to its mana value',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `until end of turn, you may play one of those cards\\. if you cast a spell this way, pay life equal to its mana value rather than paying its mana cost${BOUNDARY}(?!,| and\\b| then\\b)`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const { span } = r.value;
    const duration: IrDuration = { kind: 'duration', scope: 'untilEndOfTurn', span, rule: ONE_ID };
    return {
      ok: true,
      value: [
        {
          ...makeClause(
            ONE_ID,
            'mayPlay',
            { oneOf: flag(ONE_ID, true, span), lifeForMana: flag(ONE_ID, true, span) },
            span,
          ),
          duration,
        },
      ],
      pos: r.pos,
    };
  },
});

export const GRAND_LARCENY_B_EFFECT_RULES = [
  EFFECT_MAY_PLAY_ONE_PAY_LIFE,
  EFFECT_PLAYER_EXILES_TOP,
  EFFECT_PLAYER_EXILES_UNTIL_FOUND,
  EFFECT_PUT_OWNED_LANDS_FROM_EXILE,
  EFFECT_PLAYER_CHOOSES_CARDS_FROM_HAND,
  EFFECT_LOOK_AT_THAT_PLAYERS_HAND,
  EFFECT_LOOK_AT_THOSE_CARDS,
].map(quietly);
