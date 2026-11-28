/**
 * Effect rules of the Peace Offering deck (issue 112): offers made to each player or each opponent, and what is done for each who took them (CR 101.4, 608.2d). The engine runs
 * `playersMay`, `search` of every opponent, `repeat`, `revealTopBranches` and the `PlayerSelector` `actedThisWay`; the sentences of one instruction are kept together by the segmenter
 * (`segment-peace-offering.ts`).
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrAmount, IrFlag, IrManaSpec, IrToken } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule, family } from '../registry';
import { type Clauses, makeClause } from './operands';

/** Only the end of the sentence may follow: nothing that adds an instruction the rule would not run. */
const MORE_AFTER = /^(?:,| and\b| then\b)/iu;

const KWAIN_ID = 'effect.each-player-may-draw-then-drew-gain';

/**
 * `effect.each-player-may-draw-then-drew-gain`: "each player may draw a card, then each player who drew a card this way gains 1 life" (Kwain, Itinerant Meddler; CR 101.4, 608.2d, 121.1,
 * 119.1): each player, in turn order, is asked whether to draw a card; the draws happen, then every player who drew a card (a player who accepted with an empty library drew none) gains
 * the life. The engine's `playersMay` of `eachPlayer` and a `gainLife` of `actedThisWay` `drew`. Not read: "each opponent", another number of cards, "loses", more after the life.
 */
export const EFFECT_EACH_PLAYER_MAY_DRAW_THEN_DREW_GAIN = defineRule<Clauses>({
  id: KWAIN_ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 101.4 (Golden Rules)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 121.1 (Drawing a Card)',
    'CR 119.1 (Life)',
  ],
  examples: [
    'each player may draw a card, then each player who drew a card this way gains 1 life',
    'Each player may draw a card, then each player who drew a card this way gains 2 life',
  ],
  rejects: [
    'each player may draw a card',
    'each opponent may draw a card, then each opponent who drew a card this way gains 1 life',
    'each player may draw two cards, then each player who drew a card this way gains 1 life',
    'each player may draw a card, then each player who drew a card this way loses 1 life',
    'each player may draw a card, then each player who drew a card this way gains 1 life and draws a card',
    'each player draws a card, then each player who drew a card this way gains 1 life',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `each player may draw a card, then each player who drew a card this way gains (\\d+) life${BOUNDARY}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    if (MORE_AFTER.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const life: IrAmount = { kind: 'number', value: Number(r.value[1]), span };
    return {
      ok: true,
      value: [makeClause(KWAIN_ID, 'playersMayDrawThenDrewGain', { life }, span)],
      pos: r.pos,
    };
  },
});

const BUNNIES_ID = 'effect.opponents-may-for-each-who-does';

/**
 * `effect.opponents-may-for-each-who-does`: "each opponent may draw a card and create a 1/1 white Rabbit creature token. For each opponent who does, you draw a card and you create a 1/1 white
 * Rabbit creature token" (Tempt with Bunnies; CR 101.4, 608.2d, 121.1, 111.2): each opponent, in turn order, decides whether to take the offer; each who does draws and creates the token,
 * then the controller draws and creates a token as many times as opponents accepted (the Tempting offer rulings). The engine's `playersMay` of `eachOpponent` and a `repeat` of `thisWay`
 * `playersAccepted`. The two sentences are kept together by the segmenter. Not read: "each player", a second sentence that does not count the opponents who did, another first
 * instruction than a card and a token, more after the second token.
 */
export const EFFECT_OPPONENTS_MAY_FOR_EACH_WHO_DOES = defineRule<Clauses>({
  id: BUNNIES_ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 101.4 (Golden Rules)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 121.1 (Drawing a Card)',
    'CR 111.2 (Tokens)',
  ],
  examples: [
    'each opponent may draw a card and create a 1/1 white Rabbit creature token. For each opponent who does, you draw a card and you create a 1/1 white Rabbit creature token',
    'Each opponent may draw a card and create a Treasure token. For each opponent who does, you draw a card and you create a Treasure token',
  ],
  rejects: [
    'each opponent may draw a card and create a 1/1 white Rabbit creature token',
    'each player may draw a card and create a 1/1 white Rabbit creature token. For each player who does, you draw a card and you create a 1/1 white Rabbit creature token',
    'each opponent may draw a card and create a 1/1 white Rabbit creature token. For each opponent, you draw a card and you create a 1/1 white Rabbit creature token',
    'each opponent may draw two cards and create a 1/1 white Rabbit creature token. For each opponent who does, you draw a card and you create a 1/1 white Rabbit creature token',
    'each opponent may draw a card and create a 1/1 white Rabbit creature token. For each opponent who does, you draw a card and you create a 1/1 white Rabbit creature token and gain 1 life',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      pattern(/each opponent may draw a card and create /iu),
      family<IrToken>('token', { only: ['token.predefined', 'token.custom'] }),
      pattern(/\. for each opponent who does, you draw a card and you create /iu),
      family<IrToken>('token', { only: ['token.predefined', 'token.custom'] }),
    )(ctx, pos);
    if (!r.ok) return r;
    if (MORE_AFTER.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [
        makeClause(
          BUNNIES_ID,
          'opponentsMayDrawCreateForEachWhoDoes',
          { token: r.value[1], bonus: r.value[3] },
          span,
        ),
      ],
      pos: r.pos,
    };
  },
});

const DISCOVERY_ID = 'effect.opponents-may-search-for-each-who-searches';

/**
 * `effect.opponents-may-search-for-each-who-searches`: "each opponent may search their library for a land card and put it onto the battlefield. For each opponent who searches a library this
 * way, search your library for a land card and put it onto the battlefield. Then each player who searched a library this way shuffles" (Tempt with Discovery; CR 101.4, 701.23, 701.24): each
 * opponent, in turn order, decides whether to search, the opponents who do search together (CR 701.23i), the controller searches once for each of them, and then every player who searched
 * shuffles. The engine's `search` of `eachOpponent` (optional), a `repeat` of the number of opponents of `actedThisWay` `searched`, and a `shuffle` of `actedThisWay` `searched`. The
 * three sentences are kept together by the segmenter. Not read: a card but a land or basic land card, two different cards, another place than the battlefield, "each player".
 */
export const EFFECT_OPPONENTS_MAY_SEARCH_FOR_EACH_WHO_SEARCHES = defineRule<Clauses>({
  id: DISCOVERY_ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 101.4 (Golden Rules)',
    'CR 701.23 (Search)',
    'CR 701.24 (Shuffle)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'each opponent may search their library for a land card and put it onto the battlefield. For each opponent who searches a library this way, search your library for a land card and put it onto the battlefield. Then each player who searched a library this way shuffles',
    'Each opponent may search their library for a basic land card and put it onto the battlefield. For each opponent who searches a library this way, search your library for a basic land card and put it onto the battlefield. Then each player who searched a library this way shuffles',
  ],
  rejects: [
    'each opponent may search their library for a land card and put it onto the battlefield',
    'each opponent may search their library for a land card and put it onto the battlefield. For each opponent who searches a library this way, search your library for a basic land card and put it onto the battlefield. Then each player who searched a library this way shuffles',
    'each opponent may search their library for a creature card and put it onto the battlefield. For each opponent who searches a library this way, search your library for a creature card and put it onto the battlefield. Then each player who searched a library this way shuffles',
    'each opponent may search their library for a land card and put it into their hand. For each opponent who searches a library this way, search your library for a land card and put it into your hand. Then each player who searched a library this way shuffles',
    'each player may search their library for a land card and put it onto the battlefield. For each player who searches a library this way, search your library for a land card and put it onto the battlefield. Then each player who searched a library this way shuffles',
    'each opponent may search their library for a land card and put it onto the battlefield. For each opponent who searches a library this way, search your library for a land card and put it onto the battlefield',
  ],
  parse: (ctx, pos) => {
    const kind = '(a (?:basic )?land card)';
    const r = pattern(
      new RegExp(
        `each opponent may search their library for ${kind} and put it onto the battlefield\\. for each opponent who searches a library this way, search your library for ${kind} and put it onto the battlefield\\. then each player who searched a library this way shuffles${BOUNDARY}`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const theirs = (r.value[1] ?? '').toLowerCase();
    const yours = (r.value[2] ?? '').toLowerCase();
    // One kind of card for every search: "a land card" twice, or "a basic land card" twice.
    if (theirs !== yours) return fail(ctx, pos);
    if (MORE_AFTER.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const basic: IrFlag = {
      kind: 'flag',
      value: theirs.includes('basic'),
      span,
      rule: DISCOVERY_ID,
    };
    return {
      ok: true,
      value: [makeClause(DISCOVERY_ID, 'opponentsMaySearchForEachWhoSearches', { basic }, span)],
      pos: r.pos,
    };
  },
});

const SELVALA_ID = 'effect.each-player-reveals-mana-life-then-draws';

/**
 * `effect.each-player-reveals-mana-life-then-draws`: "each player reveals the top card of their library. For each nonland card revealed this way, add {G} and you gain 1 life. Then each player
 * draws a card" (Selvala, Explorer Returned; CR 701.20a, 608.2c, 106.4, 119.1, 121.1): every player reveals their top card (it stays on top), the controller adds the mana and gains the life once
 * for each card revealed that is not a land, then every player draws a card (the card they revealed). The engine's `revealTopBranches` of each player with a branch done by the controller
 * (`asController`) and a `draw` of each player. The ability is not a mana ability: its effect moves cards from libraries (CR 605.1a), so it uses the stack. The three sentences are kept
 * together by the segmenter. Not read: "each opponent", a land count, another draw, more after the draw.
 */
export const EFFECT_EACH_PLAYER_REVEALS_MANA_LIFE_THEN_DRAWS = defineRule<Clauses>({
  id: SELVALA_ID,
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 605.1a (Mana Abilities)',
    'CR 106.4 (Mana)',
    'CR 121.1 (Drawing a Card)',
  ],
  examples: [
    'each player reveals the top card of their library. For each nonland card revealed this way, add {G} and you gain 1 life. Then each player draws a card',
    'Each player reveals the top card of their library. For each nonland card revealed this way, add {G}{G} and you gain 2 life. Then each player draws a card',
  ],
  rejects: [
    'each player reveals the top card of their library. For each nonland card revealed this way, add {G} and you gain 1 life',
    'each opponent reveals the top card of their library. For each nonland card revealed this way, add {G} and you gain 1 life. Then each player draws a card',
    'each player reveals the top card of their library. For each land card revealed this way, add {G} and you gain 1 life. Then each player draws a card',
    'each player reveals the top card of their library. For each nonland card revealed this way, add {G} and you gain 1 life. Then each player draws two cards',
    'each player reveals the top card of their library. For each nonland card revealed this way, add {G} and you gain 1 life. Then each player draws a card and loses 1 life',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('each player reveals the top card of their library. '),
      pattern(
        /for each nonland card revealed this way, add ((?:\{[WUBRGC]\})+) and you gain (\d+) life\. then each player draws a card/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    if (MORE_AFTER.test(ctx.text.slice(r.pos))) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const [, words] = r.value;
    const symbols = [...(words[1] ?? '').matchAll(/\{([WUBRGC])\}/giu)].map((m) =>
      (m[1] ?? '').toUpperCase(),
    );
    const mana: IrManaSpec = {
      kind: 'manaSpec',
      what: { kind: 'symbols', symbols },
      span,
      rule: SELVALA_ID,
    };
    const life: IrAmount = { kind: 'number', value: Number(words[2]), span };
    return {
      ok: true,
      value: [makeClause(SELVALA_ID, 'revealEachManaLifeThenDraw', { mana, life }, span)],
      pos: r.pos,
    };
  },
});

export const PEACE_OFFERING_EFFECT_RULES = [
  EFFECT_EACH_PLAYER_MAY_DRAW_THEN_DREW_GAIN,
  EFFECT_OPPONENTS_MAY_FOR_EACH_WHO_DOES,
  EFFECT_OPPONENTS_MAY_SEARCH_FOR_EACH_WHO_SEARCHES,
  EFFECT_EACH_PLAYER_REVEALS_MANA_LIFE_THEN_DRAWS,
];
