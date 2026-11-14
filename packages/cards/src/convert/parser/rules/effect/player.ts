/**
 * The player verbs: draw, gain or lose life, shuffle and discard, said of "you", a target player or
 * each player or opponent (CR 119.3, 121.1, 701.9, 701.24), with the imperative forms of the verbs
 * that have no subject in front ("Draw a card.", "Discard a card.", "Shuffle your library.").
 */
import {
  chain,
  choice,
  fail,
  literal,
  many,
  map,
  named,
  optional,
  type Parser,
  pattern,
  quiet,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrAmount, IrArg, IrClause, IrNoun, IrToken, Span } from '../../ir/types';
import { NUMBER_OR_X } from '../amount/index';
import { EQUAL_AMOUNTS, FOR_EACH_TAIL as FOR_EACH, scaled } from '../amount/scaled';
import { CARD_TYPES, typeWords } from '../noun/phrases';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, connectorOf, listWithJoins, makeClause, VERB_LIST_JOIN } from './operands';
import { tokenWithEach } from './token';

const CARDS = pattern(/ cards?(?![\p{L}\p{N}])/iu);
const LIFE = pattern(/ life(?![\p{L}\p{N}])/iu);

function verbWord(base: string, you: boolean): Parser<unknown> {
  return pattern(new RegExp(`${base}${you ? '' : 's'} `, 'i'));
}

/** A quantity: "a", "one", "2" (what "for each" multiplies, CR 608.2c). An X is not one. */
const QUANTITY: Parser<IrAmount> = family<IrAmount>('amount', {
  only: ['amount.number', 'amount.article'],
});

/** Zero width: the words " for each " come next. */
const FOR_EACH_AHEAD = pattern(/(?= for each )/i);

/**
 * "<head> <quantity> <tail> for each ...": the amount is the count of "for each", times the quantity when it is more
 * than one (stage P28: "gain 2 life for each creature you control with power 4 or greater"). Read quietly up to the
 * point where "for each" is next, so that a plain "Draw a card." or "Gain a life." (which this is tried before) stops
 * where it always did, and a count that does not read reports its own stop.
 */
function quantityForEach(head: Parser<unknown>, tail: Parser<unknown>): Parser<IrAmount> {
  return (ctx, pos) => {
    const lead = quiet(sequence(head, QUANTITY, tail, FOR_EACH_AHEAD))(ctx, pos);
    if (!lead.ok) return lead;
    const each = FOR_EACH(ctx, lead.pos);
    if (!each.ok) return each;
    const amount = scaled(lead.value[1], each.value);
    return amount === null ? fail(ctx, pos) : { ok: true, value: amount, pos: each.pos };
  };
}

/**
 * The amount and the card word of a draw or a mill: "a card", "two cards", "X cards", "a card for each creature you
 * control" (the amount is then the count, CR 121.1, 608.2c) and "cards equal to the greatest power among creatures
 * you control" (stage P28).
 */
const cardsAmount = (verb: Parser<unknown>): Parser<IrAmount> =>
  choice(
    quantityForEach(verb, CARDS),
    map(
      sequence(verb, literal('cards '), family<IrAmount>('amount', { only: EQUAL_AMOUNTS })),
      ([, , amount]) => amount,
    ),
    map(sequence(verb, family<IrAmount>('amount'), CARDS), ([, amount]) => amount),
  );
const drawAmount = cardsAmount;

/** A player verb phrase, given the subject it is said of. Returns one clause. */
export type Action = (subject: IrNoun, you: boolean, rule: string) => Parser<IrClause>;

function actionClause(
  rule: string,
  verb: string,
  args: Record<string, IrArg>,
  span: Span,
): IrClause {
  return makeClause(rule, verb, args, span);
}

/** "draw two cards" (CR 121.1). */
const drawAction: Action = (subject, you, rule) =>
  map(spanned(drawAmount(verbWord('draw', you))), ({ value: amount, span }) =>
    actionClause(rule, 'draw', { player: subject, amount }, span),
  );

/**
 * " unless you discard an artifact card" (stage P31, D-140, CR 701.9): the one card of a kind the player may discard instead of the
 * number the instruction names. The kind is card types (or a choice of them) and creature types, as a card in a hand is described.
 */
const UNLESS_DISCARD: Parser<IrNoun> = map(
  spanned(
    sequence(
      literal(' unless you discard '),
      pattern(/an? /i),
      many(
        map(
          sequence(
            satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural !== true),
            literal(' '),
          ),
          ([w]) => w.subtype,
        ),
      ),
      optional(
        map(sequence(typeWords(CARD_TYPES, false), literal(' ')), ([types]) => types),
        [] as string[],
      ),
      pattern(/card(?![\p{L}\p{N}])/iu),
    ),
  ),
  ({ value: [, , subtypes, types], span }): IrNoun => ({
    kind: 'noun',
    det: 'a',
    filter: {
      ...(types.length > 0 ? { types } : {}),
      ...(subtypes.length > 0 ? { subtypes } : {}),
      card: true,
      raw: [...subtypes, ...types, 'card'].join(' '),
    },
    upTo: false,
    plural: false,
    other: false,
    span,
    rule: 'effect.discard',
  }),
);

/**
 * "discards a card", "discard two cards" (CR 701.9: the player chooses, CR 701.9b); since stage P31 "discard two cards unless you
 * discard an artifact card" (the one card of a kind instead of the number, said of "you").
 */
/** " at random" (CR 701.9b, stage P51, D-209): the cards are picked by chance, not chosen. */
const AT_RANDOM = literal(' at random');

/** " at random", or " unless you discard an artifact card", never both (the engine's `discard.random` has no alternative). */
const RANDOM_OR_UNLESS: Parser<string | IrNoun> = choice<string | IrNoun>(
  AT_RANDOM,
  UNLESS_DISCARD,
);

const discardAction: Action = (subject, you, rule) =>
  map(
    spanned(
      sequence(
        verbWord('discard', you),
        family<IrArg>('amount'),
        CARDS,
        you ? optional(RANDOM_OR_UNLESS, null) : optional(AT_RANDOM, null),
      ),
    ),
    ({ value, span }) => {
      const tail = value[3];
      const args: Record<string, IrArg> = { player: subject, amount: value[1] };
      if (typeof tail === 'string') args.random = { kind: 'flag', value: true, span, rule };
      else if (tail !== null && tail !== undefined) args.unless = tail as IrNoun;
      return actionClause(rule, 'discard', args, span);
    },
  );

/**
 * "gain 3 life" and "lose 3 life" (CR 119.3), "gain life equal to its power" and "gain 1 life for
 * each creature you control": the amount is a number, X, the power or mana value of an object (CR
 * 208.1, 202.3), or a count of objects (CR 608.2c, D-095); since stage P28 (D-131) also any value phrase of the
 * amount family ("gain life equal to that creature's toughness", "lose X life, where X is your devotion to black")
 * and a quantity above one for each ("gain 2 life for each creature you control").
 */
export const lifeAction: Action = (subject, you, rule) => {
  const life = (base: 'gain' | 'lose', verb: 'gainLife' | 'loseLife') =>
    map(
      spanned(
        choice(
          quantityForEach(verbWord(base, you), LIFE),
          map(
            sequence(
              verbWord(base, you),
              // "gain that much life" (stage P29, D-133): the damage of the event that caused the trigger.
              family<IrArg>('amount', { only: [...NUMBER_OR_X, 'amount.that-much'] }),
              LIFE,
            ),
            ([, amount]) => amount,
          ),
          map(
            sequence(
              verbWord(base, you),
              pattern(/life /i),
              family<IrArg>('amount', {
                only:
                  base === 'gain'
                    ? // CR 702.101a: only a gain can be the life lost by the instruction before it.
                      [...EQUAL_AMOUNTS, 'amount.life-lost-this-way']
                    : // D-365: "loses life equal to the life that player lost this turn" (a loss only; the lowering reads it for another player than "you").
                      [...EQUAL_AMOUNTS, 'amount.life-lost-this-turn'],
              }),
            ),
            ([, , amount]) => amount,
          ),
        ),
      ),
      ({ value, span }) => actionClause(rule, verb, { player: subject, amount: value }, span),
    );
  return choice(life('gain', 'gainLife'), life('lose', 'loseLife'));
};

/** "get {E}{E}", "gets {E}" (CR 107.14, 122.1: the player puts that many energy counters on themselves; stage P51, D-209). */
const energyAction: Action = (subject, you, rule) =>
  map(
    spanned(sequence(verbWord('get', you), pattern(/(?:\{E\}){1,8}(?![\p{L}\p{N}{])/u))),
    ({ value, span }) =>
      actionClause(
        rule,
        'gainEnergy',
        { player: subject, amount: { kind: 'number', value: value[1][0].length / 3, span } },
        span,
      ),
  );

/** "shuffle your library" and "shuffles their library" (CR 701.24). */
const shuffleAction: Action = (subject, you, rule) =>
  map(
    spanned(sequence(verbWord('shuffle', you), pattern(you ? /your library/i : /their library/i))),
    ({ span }) => actionClause(rule, 'shuffle', { player: subject }, span),
  );

/**
 * "manifests the top card of their library", "manifest the top card of your library" (CR 701.40a, D-314): the player puts the top card of their own library onto the
 * battlefield face down as a 2/2 creature. The words are the whole phrase: another library ("of target opponent's library"), several cards and "manifest dread" are other
 * instructions that the engine does not run through this effect, so they do not read.
 */
const manifestAction: Action = (subject, you, rule) =>
  map(
    spanned(
      sequence(
        verbWord('manifest', you),
        pattern(
          you
            ? /the top card of your library(?![\p{L}\p{N}])/iu
            : /the top card of their library(?![\p{L}\p{N}])/iu,
        ),
      ),
    ),
    ({ span }) => actionClause(rule, 'manifest', { player: subject }, span),
  );

/** "mills two cards", "mill X cards", "mills cards equal to ..." (CR 701.17: the top cards of the library go to the graveyard). */
const millAction: Action = (subject, you, rule) =>
  map(spanned(cardsAmount(verbWord('mill', you))), ({ value: amount, span }) =>
    actionClause(rule, 'mill', { player: subject, amount }, span),
  );

/**
 * "sacrifices a creature of their choice", "sacrifices two creatures", "sacrifices a creature" (CR 701.21a, 608.2d, 101.4:
 * each player named chooses among the permanents they control; stage P28, D-131). Said of a player or players other than
 * "you", whose sacrifice is the imperative `effect.sacrifice`. "Of their choice" says that the player, not the
 * controller of the effect, chooses, which is what a sacrifice means anyway (CR 701.21a): the engine's `player` and `choose`.
 */
const sacrificeAction: Action = (subject, you, rule) =>
  you
    ? (ctx, pos) => fail(ctx, pos)
    : map(
        spanned(
          satisfy(
            sequence(
              verbWord('sacrifice', false),
              // Stage P30 (D-135): "a creature with the greatest power among creatures they control" is read too.
              // Stage P31 (D-140): "all permanents they control that are one or more colors" (each permanent by its controller).
              family<IrNoun>('noun', {
                only: ['noun.a-greatest-permanent', 'noun.a-permanent', 'noun.all-they-control'],
              }),
              // Nobody chooses when every permanent of the kind goes ("all ... they control").
              optional(literal(' of their choice'), null),
            ),
            ([, noun, choosing]) => choosing === null || noun.det !== 'each',
          ),
        ),
        ({ value, span }) =>
          actionClause(rule, 'sacrifice', { player: subject, objects: value[1] }, span),
      );

/**
 * "investigates", "investigate" (CR 701.16a: the player creates a Clue token, CR 111.10f), said of the player named: "Its
 * controller investigates." (stage P28).
 */
const investigateAction: Action = (subject, you, rule) =>
  map(
    spanned(pattern(new RegExp(`investigate${you ? '' : 's'}(?![\\p{L}\\p{N}])`, 'iu'))),
    ({ span }) => {
      const token: IrToken = {
        kind: 'token',
        predefined: 'Clue',
        count: { kind: 'number', value: 1, span },
        span,
        rule,
      };
      return actionClause(rule, 'createToken', { player: subject, token }, span);
    },
  );

/**
 * "become the monarch" (CR 725.1: "Some cards allow a player to become the monarch"; CR 725.3: there is only one
 * monarch at a time). Said of "you" only (stage P25, D-127): the engine's effect names one player and the corpus's
 * real line is "When ~ enters, you become the monarch."; "target player becomes the monarch" is not read.
 */
const monarchAction: Action = (subject, you, rule) =>
  !you
    ? (ctx, pos) => fail(ctx, pos)
    : map(spanned(pattern(/become the monarch(?![\p{L}\p{N}])/iu)), ({ span }) =>
        actionClause(rule, 'becomeMonarch', { player: subject }, span),
      );

/**
 * "loses the game", "lose the game" (CR 104.3e: an effect may state that a player loses the game; D-269): said of one player or of a group the
 * subject names, with nothing after it ("at the end of the turn", "unless ..." and "wins the game" are other words and stay unread). The engine's
 * `loseGame`; a player who can't lose the game does not (CR 101.2), which the engine reads.
 */
const loseGameAction: Action = (subject, you, rule) =>
  map(
    spanned(pattern(new RegExp(`lose${you ? '' : 's'} the game(?![\\p{L}\\p{N}])`, 'iu'))),
    ({ span }) => actionClause(rule, 'loseGame', { player: subject }, span),
  );

/**
 * "creates a 3/3 green Beast creature token", "creates two Treasure tokens", "you create a tapped 2/2 black Zombie
 * creature token for each creature sacrificed this way" (CR 111.2: the player who creates a token owns it and controls
 * it). Said of the controller of an earlier object ("Its controller creates ..."), of you and of the other players
 * (stage P28, D-131: the token's controller is the player named); the imperative is `effect.create-token`. A token
 * that is a copy, or that has abilities, is not read.
 */
const createAction: Action = (subject, you, rule) =>
  map(
    spanned(
      sequence(
        pattern(you ? /create /i : /creates /i),
        tokenWithEach(['token.predefined', 'token.custom', 'token.number-of']),
      ),
    ),
    ({ value, span }) =>
      actionClause(rule, 'createToken', { player: subject, token: value[1] }, span),
  );

/** The nouns that can be the subject of a player verb: a player or players, or the controller of an earlier object. */
export const PLAYER_SUBJECTS = [
  // Stage P52 (D-210): "each player who discarded a card this way draws a card".
  'noun.each-player-discarded',
  // D-269: "each player ~ attacked this turn loses the game".
  'noun.each-player-attacked',
  'noun.you-and-player',
  'noun.each-other-player',
  'noun.defending-player',
  'noun.player',
  'noun.its-controller',
  'noun.that-player',
  // Stage P33 (D-150): "they draw a card" (the player the text has just named).
  'noun.they',
] as const;

/** A parser that never matches: the verbs said of one player only are not read for several. */
function never(id: string): Parser<IrClause> {
  return named(id, (ctx, pos) => fail(ctx, pos));
}

/**
 * `effect.player`: "Target player draws two cards and loses 2 life", "You gain 3 life", "Each
 * opponent loses 1 life": a player subject and one or more verb phrases, all said of that same
 * subject, so one chosen player is one noun however many things happen to them (CR 115.1).
 */
export const EFFECT_PLAYER = defineRule<Clauses>({
  id: 'effect.player',
  family: 'effect',
  leading: ['you', 'target', 'each', 'its', 'that', 'defending', 'they'],
  cites: [
    'CR 119.3 (Life)',
    'CR 121.1 (Drawing a Card)',
    'CR 701.9 (Discard)',
    'CR 701.17 (Mill)',
    'CR 701.40a (Manifest)',
    'CR 701.21 (Sacrifice)',
    'CR 701.16 (Investigate)',
    'CR 701.24 (Shuffle)',
    'CR 111.2 (Tokens)',
    'CR 725.1 (The Monarch)',
    'CR 725.3 (The Monarch)',
    'CR 101.4 (Handling Simultaneous Decisions)',
    'CR 104.3e (Ending the Game)',
  ],
  examples: [
    'you become the monarch',
    'you draw a card',
    'you gain 4 life',
    'each opponent loses 3 life',
    'target player draws two cards and loses 2 life',
    'target player shuffles their library',
    'its controller manifests the top card of their library',
    'you manifest the top card of your library',
    'target player manifests the top card of their library',
    'each player manifests the top card of their library',
    'you draw two cards, then lose 2 life',
    'each player discards a card',
    'target player discards two cards',
    'you draw a card, then discard a card',
    'target opponent discards a card',
    'its controller gains 4 life',
    "that creature's controller loses 2 life",
    'that player loses 2 life',
    'that player discards a card',
    'you gain life equal to its power',
    'you lose life equal to that card’s mana value',
    'its controller creates a 3/3 green Beast creature token',
    'its controller creates two Treasure tokens',
    "that creature's controller creates a Treasure token",
    'its controller creates a 2/2 blue Bird creature token with flying',
    'you draw a card for each creature you control',
    'you gain life equal to the number of lands you control',
    'you gain 1 life for each creature you control',
    'you lose life equal to the number of cards in your hand',
    'you draw a card for each time ~ was kicked',
    'you gain 1 life for each time it was kicked',
    'you gain 2 life for each creature you control with power 4 or greater',
    'you lose 1 life for each burden counter on ~',
    'you gain 2 life for each time it was kicked',
    'you gain life equal to that creature’s toughness',
    'you gain life equal to the life lost this way',
    'each opponent loses X life',
    'you draw X cards and lose X life',
    'you and target opponent each draw two cards',
    'you and target player each discard a card',
    'each player sacrifices a creature of their choice',
    'each player sacrifices a creature',
    'target player sacrifices a land',
    'each opponent sacrifices two creatures of their choice',
    'each other player sacrifices a creature of their choice',
    'target opponent sacrifices a creature of their choice',
    'target opponent sacrifices a creature with the greatest power among creatures they control',
    'each opponent sacrifices a creature with the greatest toughness among creatures they control',
    'defending player sacrifices a creature of their choice',
    'each player sacrifices all permanents they control that are one or more colors',
    'each opponent sacrifices all creatures they control',
    'target player mills two cards',
    'each opponent mills X cards',
    'you mill three cards',
    'each opponent draws a card',
    'you draw a card for each opponent who drew a card this way',
    'you create a 2/2 black Zombie creature token for each creature sacrificed this way',
    'you create two tapped 2/2 black Zombie creature tokens',
    'you create a Treasure token',
    // Stage P44 (D-195): the count of the tokens is the amount after "equal to".
    'you create a number of Treasure tokens equal to the number of creatures you control',
    'its controller creates a number of Treasure tokens equal to twice the number of profit votes',
    'target player creates a Treasure token',
    'its controller investigates',
    'you investigate',
    'target opponent loses life equal to your devotion to black',
    'you draw cards equal to the greatest power among creatures you control',
    // Stage P51 (D-209, CR 107.14): energy counters.
    'you get {E}{E}',
    'target player gets {E}',
    'you draw a card, then discard a card at random',
    'target opponent discards a card at random',
    // D-269, CR 104.3e: an effect says that a player loses the game.
    'each opponent loses the game',
    'each player ~ attacked this turn loses the game',
    'target player loses the game',
    'you lose the game',
    'that player loses the game',
    'target opponent loses 3 life and loses the game',
    // D-372 (CR 608.2c): a bare comma between the verbs of one subject.
    'you gain 2 life, draw two cards, then discard two cards',
    'target opponent sacrifices a creature or planeswalker of their choice, discards a card, and loses 3 life',
    'target opponent discards a card, loses 3 life',
  ],
  rejects: [
    // D-372: after a bare comma the next words are a verb of the same subject, which agrees with it.
    'you draw a card, discards a card',
    'you draw a card, you discard a card',
    'target opponent discards a card, discard a card',
    'you lose the game at the beginning of the next turn',
    'you loses the game',
    'each opponent lose the game',
    'each opponent loses the game unless you pay {2}',
    'each opponent loses the games',
    'each opponent loses game',
    'each opponent wins the game',
    'you win the game',
    'each opponent loses the game if able',
    'you and target opponent each lose the game',
    'each player ~ attacked loses the game',
    'each opponent loses the game and you win the game',
    'you get {E}{R}',
    'you get {E} {E}',
    'you get E',
    'you gets {E}',
    'target player get {E}',
    'you get',
    'you gain life equal to the number of creatures',
    'you gain X life for each creature you control',
    'you draw a card for each time',
    'you draw a card for each creature',
    'you gain life equal to the number of cards in target opponent’s hand',
    'its controller creates a token that’s a copy of it',
    'its controller creates a 2/2 blue Bird creature token with changeling',
    'its controller creates',
    'its controller create a Treasure token',
    'its controller investigate',
    'you investigates',
    'you sacrifice a creature of their choice',
    'each player sacrifices a creature of your choice',
    'each player sacrifices target creature of their choice',
    'each player sacrifices a creature an opponent controls of their choice',
    'you and target opponent each mill two cards and become the monarch',
    'you and target opponent each investigate',
    'you and target opponent each create a Treasure token',
    'you and each opponent each draw a card',
    'you and target creature each draw a card',
    'each other player draw a card',
    'target player mills',
    'target player discards their hand',
    'you may draw a card',
    'you manifests the top card of your library',
    'its controller manifest the top card of their library',
    'its controller manifests the top card of your library',
    'you manifest the top card of their library',
    'its controller manifests the top two cards of their library',
    'its controller manifests dread',
    "its controller manifests the top card of target opponent's library",
    'its controller manifests the top card of their library face up',
    'its controller manifests the top card',
    'you and target opponent each manifest the top card of your library',
    'target player discards a card at random unless you discard an artifact card',
    'each creature draws a card',
    'target player discards',
    'its controller',
    'its owner gains 4 life',
    'you become the monarch and',
    'you becomes the monarch',
    'you become monarch',
    'you become the monarchy',
    'you become the monarch of the realm',
    'target player becomes the monarch',
    'each opponent becomes the monarch',
    'its controller becomes the monarch',
    'its controller become the monarch',
  ],
  parse: chain(
    sequence(family<IrNoun>('noun', { only: PLAYER_SUBJECTS }), literal(' ')),
    ([subject]) => {
      // "You and target opponent each draw ...": the verb has no "s", as it has none for "you".
      const several = subject.det === 'players';
      const they = subject.det === 'anaphor' && subject.filter.raw.toLowerCase() === 'they';
      const you = subject.det === 'you' || several || they;
      const part = (id: string, action: Action) => named(id, action(subject, you, 'effect.player'));
      const alone = (id: string, action: Action) => (several ? never(id) : part(id, action));
      const actions = choice(
        part('effect.player.draw', drawAction),
        part('effect.player.discard', discardAction),
        part('effect.player.life', lifeAction),
        part('effect.player.mill', millAction),
        alone('effect.player.manifest', manifestAction),
        part('effect.player.energy', energyAction),
        alone('effect.player.sacrifice', sacrificeAction),
        alone('effect.player.investigate', investigateAction),
        alone('effect.player.shuffle', shuffleAction),
        alone('effect.player.create-token', createAction),
        alone('effect.player.monarch', monarchAction),
        alone('effect.player.lose-game', loseGameAction),
      );
      return map(
        listWithJoins(actions, VERB_LIST_JOIN),
        ({ items, joins }): Clauses =>
          items.map((c, i) => {
            const join = joins[i];
            return join === undefined ? c : { ...c, connector: connectorOf(join) };
          }),
      );
    },
  ),
});

/** The player a bare imperative acts on: "you", with no words of its own. */
export function impliedYou(rule: string, at: number): IrNoun {
  return {
    kind: 'noun',
    det: 'you',
    filter: { raw: '' },
    upTo: false,
    plural: false,
    other: false,
    span: { start: at, end: at },
    rule,
  };
}

/** `effect.draw`: "Draw a card." with no subject: you draw (CR 121.1). */
export const EFFECT_DRAW = defineRule<Clauses>({
  id: 'effect.draw',
  family: 'effect',
  leading: ['draw'],
  cites: ['CR 121.1 (Drawing a Card)'],
  examples: [
    'draw a card',
    'draw two cards',
    'draw 3 cards',
    'draw X cards',
    'draw a card for each creature you control',
    'draw a card for each card in your hand',
    'draw a card for each time ~ was kicked',
    'draw a card for each time it was kicked',
    'draw two cards for each time it was kicked',
    'draw two cards for each creature you control',
    'draw a card for each burden counter on ~',
    'draw cards equal to the greatest power among creatures you control',
    'draw cards equal to the number of creatures you control',
    'draw a card for each opponent who has more cards in hand than you',
    // Stage P32 (D-147): a creature with a counter on it.
    'draw a card for each creature you control with a +1/+1 counter on it',
  ],
  rejects: [
    'draw a card, then discard a card',
    'draw a card for each time that creature was kicked',
    'draws a card',
    'draw cards',
    'draw cards equal to',
    'draw X cards for each creature you control',
    'draw a card for each creature',
    'draw a card for each creature you control with a +1/+1 counter',
    'draw a card for each opponent',
  ],
  parse: (ctx, pos) =>
    map(
      spanned(drawAmount(verbWord('draw', true))),
      ({ value: amount, span }): Clauses => [
        makeClause('effect.draw', 'draw', { player: impliedYou('effect.draw', pos), amount }, span),
      ],
    )(ctx, pos),
});

/** `effect.discard`: "Discard a card." with no subject: you discard (CR 701.9). */
export const EFFECT_DISCARD = defineRule<Clauses>({
  id: 'effect.discard',
  family: 'effect',
  leading: ['discard'],
  cites: ['CR 701.9 (Discard)', 'CR 701.9b (Discard)'],
  examples: [
    'discard a card',
    'discard two cards',
    'discard 3 cards',
    'discard X cards',
    'discard two cards unless you discard an artifact card',
    'discard two cards unless you discard a creature card',
    'discard a card at random',
    'discard two cards at random',
  ],
  rejects: [
    'discards a card',
    'discard',
    'discard your hand',
    'discard a card at random unless you discard an artifact card',
    'discard at random',
    'discard cards',
    'discard a creature card',
    'discard two cards unless you discard two artifact cards',
    'discard two cards unless you discard an artifact',
  ],
  parse: (ctx, pos) =>
    map(
      spanned(
        sequence(
          verbWord('discard', true),
          family<IrArg>('amount'),
          CARDS,
          optional(RANDOM_OR_UNLESS, null),
        ),
      ),
      ({ value, span }): Clauses => [
        makeClause(
          'effect.discard',
          'discard',
          {
            player: impliedYou('effect.discard', pos),
            amount: value[1],
            ...(value[3] === null
              ? {}
              : typeof value[3] === 'string'
                ? { random: { kind: 'flag', value: true, span, rule: 'effect.discard' } }
                : { unless: value[3] }),
          },
          span,
        ),
      ],
    )(ctx, pos),
});

/**
 * `effect.discard-hand`: "discard your hand", "discard their hand" (CR 701.9: every card of the hand, nobody chooses which; stage P52, D-210). The player is the one the
 * words say ("their" is the player of the sentence the clause belongs to: "each player may discard their hand and draw seven cards"); the engine's `discard` of as many cards
 * as the hand holds. Not read: "discard a hand", "discard its hand", "discard hands", "discard your hand and draw".
 */
export const EFFECT_DISCARD_HAND = defineRule<Clauses>({
  id: 'effect.discard-hand',
  family: 'effect',
  leading: ['discard'],
  cites: ['CR 701.9 (Discard)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['discard your hand', 'discard their hand', 'Discard your hand'],
  rejects: [
    'discard a hand',
    'discard its hand',
    'discard hand',
    'discard your hands',
    'discard your hand and draw seven cards',
    'discards their hand',
    'discard the hand',
  ],
  parse: (ctx, pos) =>
    map(
      spanned(pattern(/discard (?:your|their) hand(?![\p{L}\p{N}])/iu)),
      ({ span }): Clauses => [
        makeClause(
          'effect.discard-hand',
          'discard',
          {
            player: impliedYou('effect.discard-hand', pos),
            hand: { kind: 'flag', value: true, span, rule: 'effect.discard-hand' },
          },
          span,
        ),
      ],
    )(ctx, pos),
});

/**
 * `effect.mill`: "Mill two cards." with no subject: you mill (CR 701.17: the top cards of your library go to your
 * graveyard, one after another, all of them when there are fewer; milling is not drawing, CR 121.4). The count is a
 * number, X, "cards equal to ..." or a count of "for each" (stage P28, D-131).
 */
export const EFFECT_MILL = defineRule<Clauses>({
  id: 'effect.mill',
  family: 'effect',
  leading: ['mill'],
  cites: ['CR 701.17 (Mill)', 'CR 121.4 (Drawing a Card)'],
  examples: [
    'mill two cards',
    'mill a card',
    'mill 3 cards',
    'mill X cards',
    'mill cards equal to the number of creatures you control',
    'mill a card for each creature you control',
  ],
  rejects: [
    'mills two cards',
    'mill cards',
    'mill',
    'mill two',
    'mill your library',
    'mill two cards from target player’s library',
    'mill X cards for each creature you control',
  ],
  parse: (ctx, pos) =>
    map(
      spanned(cardsAmount(verbWord('mill', true))),
      ({ value: amount, span }): Clauses => [
        makeClause('effect.mill', 'mill', { player: impliedYou('effect.mill', pos), amount }, span),
      ],
    )(ctx, pos),
});

/**
 * `effect.manifest`: "Manifest the top card of your library." with no subject: you manifest it (CR 701.40a: the card is put onto the battlefield face down as a 2/2 creature with
 * no name, no subtypes, no mana cost and no text, under your control; a creature card with a mana cost can be turned face up for that cost, CR 701.40b). Only the top card of your
 * own library: several cards, another player's library and "manifest dread" (CR 701.62) are other instructions and do not read (D-314).
 */
export const EFFECT_MANIFEST = defineRule<Clauses>({
  id: 'effect.manifest',
  family: 'effect',
  leading: ['manifest'],
  cites: ['CR 701.40a (Manifest)', 'CR 701.40b (Manifest)'],
  examples: ['manifest the top card of your library', 'Manifest the top card of your library'],
  rejects: [
    'manifests the top card of your library',
    'manifest the top card',
    'manifest the top card of their library',
    "manifest the top card of target opponent's library",
    'manifest the top two cards of your library',
    'manifest dread',
    'manifest your library',
    'manifest',
    'manifest the top card of your libraryy',
    'cloak the top card of your library',
  ],
  parse: (ctx, pos) =>
    map(
      spanned(pattern(/[Mm]anifest the top card of your library(?![\p{L}\p{N}])/u)),
      ({ span }): Clauses => [
        makeClause(
          'effect.manifest',
          'manifest',
          { player: impliedYou('effect.manifest', pos) },
          span,
        ),
      ],
    )(ctx, pos),
});

/**
 * `effect.life`: "gain 3 life", "lose 2 life" with no subject: you gain or lose it (CR 119.3). It
 * is how "you may gain 1 life" and "draw a card and lose 1 life" say it, after the words that
 * already name the player.
 */
export const EFFECT_LIFE = defineRule<Clauses>({
  id: 'effect.life',
  family: 'effect',
  leading: ['gain', 'lose'],
  cites: ['CR 119.3 (Life)', 'CR 119.4 (Life)'],
  examples: [
    'gain 3 life',
    'lose 2 life',
    'gain X life',
    'gain life equal to its power',
    "lose life equal to that creature's power",
    'gain life equal to the number of lands you control',
    'gain 1 life for each creature you control',
    'lose life equal to the number of cards in your hand',
    'gain 1 life for each time ~ was kicked',
    'lose 1 life for each time it was kicked',
    'gain 2 life for each creature you control',
    'lose 2 life for each time it was kicked',
    'gain life equal to its toughness',
    'lose X life',
    'gain 2 life for each creature you control with power 4 or greater',
    'gain that much life',
    'lose that much life',
  ],
  rejects: [
    'gain life equal to the number of creatures',
    'gain that much',
    'gain that many life',
    'gains 3 life',
    'gain 3',
    'gain a life',
    'lose life',
    'gain life',
    'gain 3 cards',
    'gain X life for each creature you control',
  ],
  parse: (ctx, pos) =>
    map(
      lifeAction(impliedYou('effect.life', pos), true, 'effect.life'),
      (clause): Clauses => [clause],
    )(ctx, pos),
});

/** `effect.shuffle`: "Shuffle your library." and, since stage P63 (D-216), "You may shuffle." (Ponder: the library is the controller's) (CR 701.24). */
export const EFFECT_SHUFFLE = defineRule<Clauses>({
  id: 'effect.shuffle',
  family: 'effect',
  leading: ['shuffle'],
  cites: ['CR 701.24 (Shuffle)'],
  examples: ['shuffle your library', 'shuffle'],
  rejects: [
    'shuffles their library',
    'shuffle their library',
    'shuffle it into its owner’s library',
  ],
  parse: (ctx, pos) =>
    map(
      spanned(pattern(/shuffle your library|shuffle(?=\.|$)/i)),
      ({ span }): Clauses => [
        makeClause(
          'effect.shuffle',
          'shuffle',
          { player: impliedYou('effect.shuffle', pos) },
          span,
        ),
      ],
    )(ctx, pos),
});
