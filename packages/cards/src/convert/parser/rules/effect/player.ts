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
import type { IrAmount, IrArg, IrClause, IrCost, IrNoun, IrToken, Span } from '../../ir/types';
import { NUMBER_OR_X, quantity } from '../amount/index';
import { EQUAL_AMOUNTS, FOR_EACH_TAIL as FOR_EACH, scaled } from '../amount/scaled';
import { CARD_TYPES, typeWords } from '../noun/phrases';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, connectorOf, listWithJoins, makeClause, VERB_LIST_JOIN } from './operands';
import { exileGraveyardCardsAction, putExiledCardsAction } from './player-exiled';
import { playerSearchAction } from './player-search';
import { tokenWithEach } from './token';

const CARDS = pattern(/ cards?(?![\p{L}\p{N}])/iu);
/** A draw's card word may be "additional": "draws an additional card" is one more card drawn (CR 121.1). */
const DRAW_CARDS = pattern(/ (?:additional )?cards?(?![\p{L}\p{N}])/iu);
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
const cardsAmount = (verb: Parser<unknown>, cards: Parser<unknown> = CARDS): Parser<IrAmount> =>
  choice(
    quantityForEach(verb, cards),
    map(
      sequence(verb, literal('cards '), family<IrAmount>('amount', { only: EQUAL_AMOUNTS })),
      ([, , amount]) => amount,
    ),
    map(sequence(verb, family<IrAmount>('amount'), cards), ([, amount]) => amount),
  );
/**
 * "draw that many cards plus one" (CR 608.2c, 121.1): what the instruction before it did, and a whole number more. The two are summed, so "that many" stays the
 * `thisWay` count `lowerSentences` checks against the instruction before it.
 */
const thatManyPlus = (verb: Parser<unknown>): Parser<IrAmount> =>
  map(
    spanned(
      sequence(
        verb,
        family<IrAmount>('amount', { only: ['amount.that-many'] }),
        DRAW_CARDS,
        literal(' plus '),
        family<IrAmount>('amount', { only: ['amount.number'] }),
      ),
    ),
    ({ value: [, many, , , more], span }): IrAmount => ({
      kind: 'sum',
      of: [many, more],
      span,
    }),
  );
const drawAmount = (verb: Parser<unknown>): Parser<IrAmount> =>
  choice(thatManyPlus(verb), cardsAmount(verb, DRAW_CARDS));

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
const unlessDiscard = (who: 'you' | 'they'): Parser<IrNoun> =>
  map(
    spanned(
      sequence(
        literal(` unless ${who} discard `),
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

const UNLESS_DISCARD = unlessDiscard('you');
/** " unless they discard a land card" (CR 701.9, Compulsive Research): said of a player other than the controller, who is the one who chooses what to discard. */
const UNLESS_THEY_DISCARD = unlessDiscard('they');

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

/**
 * "discards their hand" (CR 701.9a, 402.1; Lorehold group 3): the whole hand of each player the subject names, nobody chooses. Said of a subject other than plain "you" ("each player discards
 * their hand", "target opponent discards their hand"); "discard your hand" has no subject and is `effect.discard-hand`'s.
 */
const discardHandAction: Action = (subject, you, rule) =>
  subject.det === 'you'
    ? never(rule)
    : map(
        spanned(sequence(verbWord('discard', you), pattern(/their hand(?![\p{L}\p{N}])/iu))),
        ({ span }) =>
          actionClause(
            rule,
            'discard',
            { player: subject, hand: { kind: 'flag', value: true, span, rule } },
            span,
          ),
      );

const discardAction: Action = (subject, you, rule) =>
  choice(
    discardHandAction(subject, you, rule),
    map(
      spanned(
        sequence(
          verbWord('discard', you),
          family<IrArg>('amount'),
          CARDS,
          you
            ? optional(RANDOM_OR_UNLESS, null)
            : optional(choice<string | IrNoun>(AT_RANDOM, UNLESS_THEY_DISCARD), null),
        ),
      ),
      ({ value, span }) => {
        const tail = value[3];
        const args: Record<string, IrArg> = { player: subject, amount: value[1] };
        if (typeof tail === 'string') args.random = { kind: 'flag', value: true, span, rule };
        else if (tail !== null && tail !== undefined) args.unless = tail as IrNoun;
        return actionClause(rule, 'discard', args, span);
      },
    ),
  );

/**
 * "gain 3 life" and "lose 3 life" (CR 119.3), "gain life equal to its power" and "gain 1 life for
 * each creature you control": the amount is a number, X, the power or mana value of an object (CR
 * 208.1, 202.3), or a count of objects (CR 608.2c, D-095); since stage P28 (D-131) also any value phrase of the
 * amount family ("gain life equal to that creature's toughness", "lose X life, where X is your devotion to black")
 * and a quantity above one for each ("gain 2 life for each creature you control").
 */
export const lifeAction: Action = (subject, you, rule) => {
  const halfTheirLife: Parser<IrAmount> = map(
    spanned(
      sequence(
        verbWord('lose', you),
        pattern(/(half|a third of) their life, rounded (down|up)(?![\p{L}\p{N}])/iu),
      ),
    ),
    ({ value, span }) => {
      // "a third of their life, rounded up" (Dire Fleet Ravager, CR 107.1a): the same amount divided by 3.
      const third = (value[1][1] ?? '').toLowerCase() === 'a third of';
      const words = value[1][0] ?? '';
      const halfSpan = { start: span.start + words.length, end: span.end };
      const total: IrAmount = { kind: 'lifeTotalOf', of: subject, span: halfSpan };
      return {
        kind: 'half',
        of: total,
        round: (value[1][2] ?? '').toLowerCase() as 'down' | 'up',
        ...(third ? { divisor: 3 as const } : {}),
        span,
      };
    },
  );
  // "gain half X life, rounded down" (Quandrix Unlimited group E, Brass Infiniscope; CR 107.1a, 107.3): half the X the text names, the life after it, the rounding last.
  const halfX: Parser<IrAmount> = map(
    spanned(
      sequence(verbWord('gain', you), pattern(/half X life, rounded (down|up)(?![\p{L}\p{N}])/u)),
    ),
    ({ value, span }) => ({
      kind: 'half',
      of: { kind: 'x', span },
      round: (value[1][1] ?? '').toLowerCase() as 'down' | 'up',
      span,
    }),
  );
  const life = (base: 'gain' | 'lose', verb: 'gainLife' | 'loseLife') =>
    map(
      spanned(
        choice(
          quantityForEach(verbWord(base, you), LIFE),
          map(
            sequence(
              verbWord(base, you),
              // "gain that much life" (stage P29, D-133): the damage of the event that caused the trigger.
              family<IrArg>('amount', {
                only: [...NUMBER_OR_X, 'amount.that-much', 'amount.half-x', 'amount.twice-x'],
              }),
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
                      [
                        ...EQUAL_AMOUNTS,
                        'amount.life-lost-this-way',
                        'amount.damage-dealt-this-way',
                        // Cramped Vents (CR 120.10): "You gain life equal to the excess damage dealt this way."
                        'amount.excess-damage-dealt-this-way',
                      ]
                    : // D-365: "loses life equal to the life that player lost this turn" (a loss only; the lowering reads it for another player than "you").
                      [
                        ...EQUAL_AMOUNTS,
                        'amount.life-lost-this-turn',
                        'amount.attackers-of-affected',
                      ],
              }),
            ),
            ([, , amount]) => amount,
          ),
          ...(base === 'lose' ? [halfTheirLife] : [halfX]),
        ),
      ),
      ({ value, span }) => actionClause(rule, verb, { player: subject, amount: value }, span),
    );
  return choice(life('gain', 'gainLife'), life('lose', 'loseLife'));
};

/**
 * "get {E}{E}", "gets {E}", "get six {E}", "get {E} for each creature you control", "get an amount of {E} equal to the greatest power among creatures you control" and
 * "get that many {E}" (CR 107.14, 122.1: the player puts that many energy counters on themselves; stage P51, D-209; issue 105). "That many" after combat damage is the
 * damage of the trigger, as "that much" is.
 */
const energyAction: Action = (subject, you, rule) => {
  const symbols = pattern(/(?:\{E\}){1,8}(?![\p{L}\p{N}{])/u);
  const amount: Parser<IrAmount> = choice(
    map(
      sequence(verbWord('get', you), pattern(/\{E\}(?![\p{L}\p{N}{])/u), FOR_EACH),
      ([, , each]) => each,
    ),
    map(
      spanned(sequence(verbWord('get', you), symbols)),
      ({ value, span }): IrAmount => ({
        kind: 'number',
        value: value[1][0].length / 3,
        span,
      }),
    ),
    map(
      sequence(
        verbWord('get', you),
        satisfy(QUANTITY, (a) => a.kind === 'number' && a.value >= 2),
        pattern(/ \{E\}(?![\p{L}\p{N}{])/u),
      ),
      ([, quantity]) => quantity,
    ),
    map(
      sequence(
        verbWord('get', you),
        pattern(/an amount of \{E\} /iu),
        family<IrAmount>('amount', { only: EQUAL_AMOUNTS }),
      ),
      ([, , equal]) => equal,
    ),
    map(
      spanned(sequence(verbWord('get', you), pattern(/that many \{E\}(?![\p{L}\p{N}{])/iu))),
      ({ span }): IrAmount => ({ kind: 'triggerDamage', span }),
    ),
  );
  return map(spanned(amount), ({ value, span }) =>
    actionClause(rule, 'gainEnergy', { player: subject, amount: value }, span),
  );
};

/**
 * "you may pay eight {E}" and "you may pay one or more {E}" after ", then" (issue 105, Lightning Runner, CR 107.14, 118.3): the offer of an energy payment that comes second in a sentence
 * about the player. Only "you may" (the player chooses as the ability resolves); the clause is optional, and the sentences after it say what the payment buys.
 */
const energyOfferAction: Action = (subject, you, rule) =>
  subject.det !== 'you' || !you
    ? never(rule)
    : choice(
        map(
          spanned(
            sequence(
              literal('you may '),
              family<IrCost>('cost', { only: ['cost.pay-energy', 'cost.pay-energy-amount'] }),
            ),
          ),
          ({ value, span }): IrClause => ({
            ...actionClause(
              rule,
              'pay',
              { cost: { kind: 'costList', costs: [value[1]], span, rule } },
              span,
            ),
            optional: true,
          }),
        ),
        map(
          spanned(pattern(/you may pay one or more \{E\}(?![\p{L}\p{N}{])/u)),
          ({ span }): IrClause => ({
            ...actionClause(rule, 'payEnergyAny', {}, span),
            optional: true,
          }),
        ),
      );

/** "get an experience counter", "gets two experience counters" (CR 122.1: the player puts that many experience counters on themselves; Meren of Clan Nel Toth). */
const experienceAction: Action = (subject, you, rule) =>
  map(
    spanned(
      sequence(
        verbWord('get', you),
        choice(
          map(pattern(/an experience counter(?![\p{L}\p{N}])/iu), () => 1),
          map(
            sequence(
              satisfy(quantity, (n) => n >= 2),
              pattern(/ experience counters(?![\p{L}\p{N}])/iu),
            ),
            ([n]) => n,
          ),
        ),
      ),
    ),
    ({ value, span }) =>
      actionClause(
        rule,
        'gainExperience',
        { player: subject, amount: { kind: 'number', value: value[1], span } },
        span,
      ),
  );

/**
 * "gets two poison counters", "get a poison counter" (CR 122.1, 704.5c: the player puts that many poison counters on themselves; Bloodroot Apothecary): the engine's `givePoison`. A
 * player with ten or more is out of the game as a state-based action. Not read: an amount that is not a number ("that many"), another kind of counter.
 */
const poisonAction: Action = (subject, you, rule) =>
  map(
    spanned(
      sequence(
        verbWord('get', you),
        choice(
          map(pattern(/a poison counter(?![\p{L}\p{N}])/iu), () => 1),
          map(
            sequence(
              satisfy(quantity, (n) => n >= 2),
              pattern(/ poison counters(?![\p{L}\p{N}])/iu),
            ),
            ([n]) => n,
          ),
        ),
      ),
    ),
    ({ value, span }) =>
      actionClause(
        rule,
        'givePoison',
        { player: subject, amount: { kind: 'number', value: value[1], span } },
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
 * "manifests the top card of their library", "manifest the top card of your library", "you manifest the top card of that player's library" (CR 701.40a, D-314): the player puts
 * the top card of a library onto the battlefield face down as a 2/2 creature, under their control (CR 110.2a): their own, or, said of "you", the one of the player an earlier part
 * of the text named ("that player": the player of the trigger). Several cards, "target opponent's library" and "manifest dread" are other instructions that the engine does not
 * run through this effect, so they do not read.
 */
const manifestAction: Action = (subject, you, rule) => {
  const own = map(
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
  if (!(you && subject.det === 'you')) return own;
  // Thieving Amalgam, Orochi Soul-Reaver: "you manifest the top card of that player's library".
  return choice(
    own,
    map(
      spanned(
        sequence(
          verbWord('manifest', you),
          literal('the top card of '),
          spanned(pattern(/that player/iu)),
          pattern(/['’]s library(?![\p{L}\p{N}])/iu),
        ),
      ),
      ({ value, span }) =>
        actionClause(
          rule,
          'manifest',
          {
            // The library's player is read before "you": "that player" is never the subject of the sentence.
            from: {
              kind: 'noun',
              det: 'anaphor',
              filter: { raw: 'that player' },
              upTo: false,
              plural: false,
              other: false,
              span: value[2].span,
              rule,
            },
            player: subject,
          },
          span,
        ),
    ),
  );
};

/** "mills two cards", "mill X cards", "mills cards equal to ..." (CR 701.17: the top cards of the library go to the graveyard). */
export const millAction: Action = (subject, you, rule) =>
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
  // D-486: "any number of target players each ... sacrifice a creature of their choice" takes the plural verb; "you", "they" and the others stay as they were.
  you && !(subject.det === 'target' && subject.anyNumber === true)
    ? (ctx, pos) => fail(ctx, pos)
    : map(
        spanned(
          satisfy(
            sequence(
              verbWord('sacrifice', you),
              // Stage P30 (D-135): "a creature with the greatest power among creatures they control" is read too.
              // Stage P31 (D-140): "all permanents they control that are one or more colors" (each permanent by its controller).
              family<IrNoun>('noun', {
                only: [
                  'noun.a-greatest-permanent',
                  // Witch-king of Angmar (CR 510.2): "a creature of their choice that dealt combat damage to you this turn", before the plain noun, of which it is a longer reading.
                  'noun.a-creature-that-dealt-damage-to-you',
                  'noun.a-permanent',
                  'noun.all-they-control',
                ],
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
 * monarch at a time). Said of one player: "you" (stage P25, D-127: "When ~ enters, you become the monarch.") or "target
 * player" / "target opponent" ("Target player becomes the monarch."): the engine's effect names one player. Several
 * players ("each opponent becomes the monarch") are not read, as the monarch is only one of them.
 */
const monarchAction: Action = (subject, you, rule) =>
  !(subject.det === 'you' || (subject.det === 'target' && subject.anyNumber !== true))
    ? (ctx, pos) => fail(ctx, pos)
    : map(
        spanned(sequence(verbWord('become', you), pattern(/the monarch(?![\p{L}\p{N}])/iu))),
        ({ span }) => actionClause(rule, 'becomeMonarch', { player: subject }, span),
      );

/**
 * "take the initiative" (CR 726.1: "There is no initiative in a game until an effect instructs a player to take the initiative"; CR 726.3: only one player has it at a time).
 * Said of one player: "you" ("When ~ enters, you take the initiative.") or "target player" / "target opponent" ("Target player takes the initiative."): the engine's
 * `takeInitiative` names one player. Several players are not read, as the initiative is held by one of them.
 */
const initiativeAction: Action = (subject, you, rule) =>
  !(subject.det === 'you' || (subject.det === 'target' && subject.anyNumber !== true))
    ? (ctx, pos) => fail(ctx, pos)
    : map(
        spanned(sequence(verbWord('take', you), pattern(/the initiative(?![\p{L}\p{N}])/iu))),
        ({ span }) => actionClause(rule, 'takeInitiative', { player: subject }, span),
      );

/**
 * "takes an extra turn after this one" (CR 500.7) said of a player: "target player takes an extra turn after this one". Not read: a number of turns, a turn after another
 * turn, a rider about the turn.
 */
const extraTurnAction: Action = (subject, you, rule) =>
  map(
    spanned(
      pattern(
        new RegExp(`take${you ? '' : 's'} an extra turn after this one(?![\\p{L}\\p{N}])`, 'iu'),
      ),
    ),
    ({ span }) => actionClause(rule, 'extraTurn', { player: subject }, span),
  );

/**
 * "gains control of ~" said of "that player" (CR 613.1b, 611.2a, 110.2: a control-changing effect with no duration lasts until the game ends or another effect changes it; the player
 * who gains control is the one the subject names): the player the event of a trigger is about, taking the permanent with the ability ("that player draws three cards and gains
 * control of ~"), or the one player a target names ("target opponent gains control of ~", Humble Defector). The engine's `gainControl` of `this` for that player. Not read: any other subject,
 * another object ("gains control of target creature"), a duration.
 */
const gainControlOfSelfAction: Action = (subject, you, rule) =>
  you ||
  (subject.det === 'playerToRight' ||
  // Riders of Rohan deck, group B (Humble Defector): "Target opponent gains control of ~." (CR 115.1, 613.1b): one chosen player takes the permanent with the ability.
  (subject.det === 'target' && subject.anyNumber !== true && !subject.upTo)
    ? false
    : subject.det !== 'anaphor' || subject.filter.raw.toLowerCase() !== 'that player')
    ? (ctx, pos) => fail(ctx, pos)
    : map(
        spanned(
          sequence(literal('gains control of '), family<IrNoun>('noun', { only: ['noun.self'] })),
        ),
        ({ value, span }) =>
          actionClause(rule, 'gainControl', { player: subject, objects: value[1] }, span),
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
        tokenWithEach([
          'token.predefined',
          'token.custom',
          'token.number-of',
          // Saw in Half: "its controller creates two tokens that are copies of that creature, except their power is half ...", before the plain copy.
          'token.copies-half-pt',
          'token.copy',
          'token.copy-that-creature',
        ]),
      ),
    ),
    ({ value, span }) =>
      actionClause(rule, 'createToken', { player: subject, token: value[1] }, span),
  );

/** The nouns that can be the subject of a player verb: a player or players, or the controller of an earlier object. */
export const PLAYER_SUBJECTS = [
  // Stage P52 (D-210): "each player who discarded a card this way draws a card".
  'noun.each-player-discarded',
  // CR 701.21a: "each player who can't discards a card" after a sacrifice.
  'noun.each-player-cant-sacrifice',
  // D-269: "each player ~ attacked this turn loses the game".
  'noun.each-player-attacked',
  // Gollum, Obsessed Stalker: "each opponent dealt combat damage this game by a creature named ~ loses life equal to ...".
  'noun.each-opponent-dealt-combat-damage-by-named',
  // Shatter the Sky: "each player who controls a creature with power 4 or greater draws a card".
  'noun.each-player-who-controls',
  // Papalymo Totolymo: "each opponent who lost life this turn sacrifices a creature with the greatest power among creatures they control".
  'noun.each-player-who-lost-life',
  'noun.each-player-who-dealt-combat-damage',
  'noun.you-and-player',
  // D-486: "any number of target players each lose 2 life and sacrifice a creature of their choice".
  'noun.any-number-target-players',
  // Will of the Abzan: "any number of target opponents each sacrifice a creature with the greatest power among creatures that player controls and lose 3 life".
  'noun.any-number-target-opponents',
  'noun.each-other-player',
  // Fractured Identity: "each player other than its controller creates a token that's a copy of it".
  'noun.each-player-other-than-its-controller',
  // Bounty Board: "each of its controller's opponents draws a card and gains 2 life".
  'noun.each-of-its-controllers-opponents',
  'noun.defending-player',
  'noun.player-to-your-right',
  'noun.player',
  'noun.its-controller',
  // Oft-Nabbed Goat: "its owner draws that many cards".
  'noun.its-owner',
  'noun.each-exiled-controller',
  // Terastodon: "for each permanent put into a graveyard this way, its controller creates a 3/3 green Elephant creature token".
  'noun.each-graveyarded-controller',
  'noun.that-player',
  // D-648: "that attacking player draws a card" (the player of a trigger about a player attacking one of your opponents).
  'noun.that-attacking-player',
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
  leading: ['you', 'target', 'each', 'its', 'that', 'defending', 'they', 'any', 'for', 'the'],
  cites: [
    'CR 119.3 (Life)',
    'CR 121.1 (Drawing a Card)',
    'CR 701.9 (Discard)',
    'CR 402.1 (Hand)',
    'CR 701.17 (Mill)',
    'CR 701.40a (Manifest)',
    'CR 701.21 (Sacrifice)',
    'CR 701.16 (Investigate)',
    'CR 701.24 (Shuffle)',
    'CR 111.2 (Tokens)',
    'CR 725.1 (The Monarch)',
    'CR 725.3 (The Monarch)',
    'CR 726.1 (The Initiative)',
    'CR 726.3 (The Initiative)',
    'CR 101.4 (Handling Simultaneous Decisions)',
    'CR 104.3e (Ending the Game)',
  ],
  examples: [
    'you become the monarch',
    'target player becomes the monarch',
    'target opponent becomes the monarch',
    'you take the initiative',
    'target player takes the initiative',
    'target opponent takes the initiative',
    'target player takes an extra turn after this one',
    'you take an extra turn after this one',
    'you draw a card',
    'you gain 4 life',
    'each opponent loses 3 life',
    'target player draws two cards and loses 2 life',
    'target player shuffles their library',
    'its controller manifests the top card of their library',
    'you manifest the top card of your library',
    "you manifest the top card of that player's library",
    'target player manifests the top card of their library',
    'each player manifests the top card of their library',
    'you draw two cards, then lose 2 life',
    'each player discards a card',
    'target player discards two cards',
    // Compulsive Research (CR 701.9): the player who discards may discard one card of a kind instead.
    'target player discards two cards unless they discard a land card',
    // Lorehold group 3 (CR 701.9a): the whole hand of each player the subject names.
    'each player discards their hand',
    'each player discards their hand, then draws seven cards',
    'target opponent discards their hand',
    'you draw a card, then discard a card',
    'target opponent discards a card',
    'its controller gains 4 life',
    // Oft-Nabbed Goat: the owner of the object an earlier part of the text named.
    'its owner draws a card',
    "that creature's controller loses 2 life",
    'that player loses 2 life',
    'that player discards a card',
    'you gain life equal to its power',
    'you lose life equal to that card’s mana value',
    'its controller creates a 3/3 green Beast creature token',
    // Issue 145 (Bramble Sovereign, CR 111.2): the controller of the creature makes the copy of it.
    'its controller creates a token that’s a copy of it',
    'that creature’s controller creates a token that’s a copy of that creature',
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
    // Cramped Vents (CR 120.10): the damage beyond lethal damage the instruction before it dealt.
    'you gain life equal to the excess damage dealt this way',
    'each opponent loses X life',
    'you draw X cards and lose X life',
    // CR 613.1b: the player of the trigger takes the permanent with the ability.
    'that player draws three cards and gains control of ~',
    'the player to your right gains control of ~',
    'The player to your right gains control of ~',
    // Riders of Rohan deck, group B (Humble Defector, CR 115.1, 613.1b): a chosen player takes the permanent with the ability.
    'target opponent gains control of ~',
    'target player gains control of ~',
    'you and target opponent each draw two cards',
    'you and target player each discard a card',
    // Sylvan Offering (CR 111.2, 101.4): you and the chosen opponent each create the tokens, you first (the active player's turn order).
    'you and that player each create a 3/3 green Treefolk creature token',
    'you and target opponent each create two 1/1 green Elf Warrior creature tokens',
    'each player sacrifices a creature of their choice',
    'any number of target players each lose 2 life and sacrifice a creature of their choice',
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
    // Living Death (CR 404.1, 608.2c): each player's own graveyard, then what they exiled this way.
    'each player exiles all creature cards from their graveyard',
    'each player puts all cards they exiled this way onto the battlefield',
    'each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield',
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
    'you get six {E}',
    'you get {E} for each creature you control',
    'you get an amount of {E} equal to the greatest power among creatures you control',
    'you get that many {E}',
    'target player gets {E}',
    // CR 122.1: experience counters.
    'you get an experience counter',
    'you get two experience counters',
    'target player gets an experience counter',
    // Bloodroot Apothecary (CR 122.1, 704.5c): poison counters.
    'that player gets two poison counters',
    'target opponent gets a poison counter',
    'each opponent gets a poison counter',
    'you draw a card, then discard a card at random',
    'target opponent discards a card at random',
    // D-269, CR 104.3e: an effect says that a player loses the game.
    'each opponent loses the game',
    'each player ~ attacked this turn loses the game',
    'target player loses the game',
    // Howling Mine: the extra card of the draw step (CR 121.1).
    'target player draws an additional card',
    'each player draws two additional cards',
    'you lose the game',
    'that player loses the game',
    'target opponent loses 3 life and loses the game',
    // D-372 (CR 608.2c): a bare comma between the verbs of one subject.
    'you gain 2 life, draw two cards, then discard two cards',
    'target opponent sacrifices a creature or planeswalker of their choice, discards a card, and loses 3 life',
    'target opponent discards a card, loses 3 life',
    // Riders of Rohan deck, group B (Field of Ruin, CR 701.23a, 701.24): each player searches their own library, puts the card onto the battlefield, then shuffles.
    'each player searches their library for a basic land card, puts it onto the battlefield, then shuffles',
    'each opponent searches their library for a basic land card, puts it onto the battlefield tapped, then shuffles',
    'target player searches their library for a Forest card, puts that card onto the battlefield, then shuffles',
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
    'you get an experience counters',
    'you get 1 experience counters',
    'you get an experience',
    'you get a experience counter',
    'that player gets two poison counter',
    'that player get two poison counters',
    'that player gets 1 poison counters',
    'you gets an experience counter',
    'you get an energy counter',
    'you get {E}{R}',
    'you get {E} {E}',
    'you get one {E}',
    'you get an amount of {E}',
    'you get that much {E}',
    'you get E',
    'you gets {E}',
    'target player get {E}',
    'you get',
    'you gain life equal to the number of creatures',
    'you gain X life for each creature you control',
    'you draw a card for each time',
    'you draw a card for each creature',
    'its controller creates a 2/2 blue Bird creature token with flash',
    'its controller creates',
    'its controller create a Treasure token',
    'its controller investigate',
    'you investigates',
    'you sacrifice a creature of their choice',
    'you exile all creature cards from your graveyard',
    'each opponent exiles all creature cards from their graveyard',
    'each player exiles a creature card from their graveyard',
    'each player exiles all creature cards from your graveyard',
    'each player puts all cards they exiled this way onto the battlefield tapped',
    'you put all cards they exiled this way onto the battlefield',
    'each player sacrifices a creature of your choice',
    'each player sacrifices target creature of their choice',
    'each player sacrifices a creature an opponent controls of their choice',
    'you and target opponent each mill two cards and become the monarch',
    'you and target opponent each investigate',
    'you and each opponent each draw a card',
    'you and target creature each draw a card',
    'each other player draw a card',
    'target player mills',
    'you discard their hand',
    'each player discards your hand',
    'each player discards their hands',
    'each player discards its hand',
    'target player discards the hand',
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
    'target player discards two cards unless you discard a land card',
    'you discard two cards unless they discard a land card',
    'each creature draws a card',
    'target player discards',
    'its controller',
    'its owners gain 4 life',
    'its owner',
    'you become the monarch and',
    'you becomes the monarch',
    'you take the initiative and',
    'you takes the initiative',
    'you take initiative',
    'you take the initiatives',
    'target player take the initiative',
    'any number of target players take the initiative',
    'each opponent takes the initiative',
    'its controller takes the initiative',
    'you become monarch',
    'you become the monarchy',
    'you become the monarch of the realm',
    'target player become the monarch',
    'any number of target players become the monarch',
    'target player take an extra turn after this one',
    'target player takes two extra turns after this one',
    'you takes an extra turn after this one',
    'each opponent becomes the monarch',
    'its controller becomes the monarch',
    'its controller become the monarch',
    'that player gains control of ~ until end of turn',
    'target opponent gains control of ~ until end of turn',
    'target opponent gains control of target creature',
    'each opponent gains control of ~',
    'target opponents gain control of ~',
    'that player gains control of target creature',
    'that player gain control of ~',
    'you gain control of ~',
    'the player to your right gains control of target creature',
    'the player to your right gains control of ~ until end of turn',
    'the player to your right draw a card',
    'each player search their library for a basic land card, puts it onto the battlefield, then shuffles',
    'each player searches their library for a basic land card, puts it into their hand, then shuffles',
    'each player searches their library for a basic land card, puts it onto the battlefield',
    'each player searches their library for basic land cards, puts them onto the battlefield, then shuffles',
    'each player searches your library for a basic land card, puts it onto the battlefield, then shuffles',
    'each player may search their library for a basic land card, put it onto the battlefield, then shuffle',
    'each player searches their library for a basic land card, reveals it, puts it onto the battlefield, then shuffles',
    'you and target opponent each search their library for a basic land card, puts it onto the battlefield, then shuffles',
  ],
  parse: chain(
    sequence(family<IrNoun>('noun', { only: PLAYER_SUBJECTS }), literal(' ')),
    ([subject]) => {
      // "You and target opponent each draw ...": the verb has no "s", as it has none for "you".
      const several = subject.det === 'players';
      const they = subject.det === 'anaphor' && subject.filter.raw.toLowerCase() === 'they';
      // D-486: "any number of target players each" takes the plural verb, as "you" does.
      const eachOfMany = subject.det === 'target' && subject.anyNumber === true;
      const you = subject.det === 'you' || several || they || eachOfMany;
      const part = (id: string, action: Action) => named(id, action(subject, you, 'effect.player'));
      const alone = (id: string, action: Action) => (several ? never(id) : part(id, action));
      const actions = choice(
        part('effect.player.draw', drawAction),
        part('effect.player.discard', discardAction),
        part('effect.player.life', lifeAction),
        part('effect.player.mill', millAction),
        alone('effect.player.manifest', manifestAction),
        part('effect.player.energy', energyAction),
        // Issue 105: ", then you may pay eight {E}".
        alone('effect.player.energy-offer', energyOfferAction),
        part('effect.player.experience', experienceAction),
        // Bloodroot Apothecary (CR 122.1): "that player gets two poison counters".
        part('effect.player.poison', poisonAction),
        alone('effect.player.sacrifice', sacrificeAction),
        alone('effect.player.exile-graveyard', exileGraveyardCardsAction),
        alone('effect.player.put-exiled', putExiledCardsAction),
        alone('effect.player.investigate', investigateAction),
        alone('effect.player.shuffle', shuffleAction),
        part('effect.player.create-token', createAction),
        alone('effect.player.monarch', monarchAction),
        alone('effect.player.initiative', initiativeAction),
        alone('effect.player.extra-turn', extraTurnAction),
        alone('effect.player.lose-game', loseGameAction),
        alone('effect.player.gain-control-of-self', gainControlOfSelfAction),
        // Riders of Rohan deck, group B (Field of Ruin): the players the subject names search their own libraries.
        alone('effect.player.search', playerSearchAction),
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
    // "that many" and a number more (Celes, Rune Knight).
    'draw that many cards plus one',
  ],
  rejects: [
    'draw that many cards plus',
    'draw that many cards plus a creature',
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
    'discard cards equal to the number of creatures you control',
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
        choice(
          map(
            sequence(
              verbWord('discard', true),
              family<IrArg>('amount'),
              CARDS,
              optional(RANDOM_OR_UNLESS, null),
            ),
            ([, amount, , rest]) => ({ amount, rest }),
          ),
          // "discard cards equal to its power" (CR 701.9, 107.1): the number comes from the amount.
          map(
            sequence(
              verbWord('discard', true),
              literal('cards '),
              family<IrArg>('amount', { only: EQUAL_AMOUNTS }),
            ),
            ([, , amount]) => ({ amount, rest: null }),
          ),
        ),
      ),
      ({ value, span }): Clauses => [
        makeClause(
          'effect.discard',
          'discard',
          {
            player: impliedYou('effect.discard', pos),
            amount: value.amount,
            ...(value.rest === null
              ? {}
              : typeof value.rest === 'string'
                ? { random: { kind: 'flag', value: true, span, rule: 'effect.discard' } }
                : { unless: value.rest }),
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
  examples: [
    'discard your hand',
    'discard their hand',
    'Discard your hand',
    'discard all the cards in your hand',
    'discard all the cards in their hand',
  ],
  rejects: [
    'discard all the cards in your hands',
    'discard all the cards in a hand',
    'discard all cards in your hand',
    'discard all the cards in your hand and draw seven cards',
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
      spanned(pattern(/discard (?:all the cards in )?(?:your|their) hand(?![\p{L}\p{N}])/iu)),
      ({ span }): Clauses => [
        makeClause(
          'effect.discard-hand',
          'discard',
          {
            player: impliedYou('effect.discard-hand', pos),
            hand: { kind: 'flag', value: true, span, rule: 'effect.discard-hand' },
            // "Discard all the cards in your hand" counts as what "that many" reads (CR 608.2c); "discard your hand" keeps its old reading.
            ...(/all the cards/iu.test(ctx.text.slice(span.start, span.end))
              ? {
                  allCards: {
                    kind: 'flag' as const,
                    value: true,
                    span,
                    rule: 'effect.discard-hand',
                  },
                }
              : {}),
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
  examples: [
    'manifest the top card of your library',
    'Manifest the top card of your library',
    "manifest the top card of that player's library",
  ],
  rejects: [
    'manifests the top card of your library',
    'manifest the top card',
    "manifest the top card of that player's libraryy",
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
    choice(
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
      ),
      // Orochi Soul-Reaver: "manifest the top card of that player's library" (the player of the trigger).
      map(
        spanned(
          sequence(
            pattern(/[Mm]anifest the top card of /u),
            spanned(pattern(/that player/iu)),
            pattern(/['’]s library(?![\p{L}\p{N}])/iu),
          ),
        ),
        ({ value, span }): Clauses => [
          makeClause(
            'effect.manifest',
            'manifest',
            {
              player: impliedYou('effect.manifest', pos),
              from: {
                kind: 'noun',
                det: 'anaphor',
                filter: { raw: 'that player' },
                upTo: false,
                plural: false,
                other: false,
                span: value[1].span,
                rule: 'effect.manifest',
              },
            },
            span,
          ),
        ],
      ),
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

/**
 * "Until that player's next turn, they gain protection from everything and their life total can't change." Perch Protection (issue 112): "until your next turn, your life
 * total can't change and you gain protection from everything", the same two effects for the controller, in the other order (CR 702.16b, 702.16e, 119.10). Not read: one of the
 * two halves alone, another duration.
 */
export const EFFECT_PLAYER_LOCK = defineRule<Clauses>({
  id: 'effect.player-lock',
  family: 'effect',
  leading: ['until'],
  cites: ['CR 702.16 (Protection)', 'CR 119 (Life)'],
  examples: [
    "until that player's next turn, they gain protection from everything and their life total can't change",
    "until your next turn, your life total can't change and you gain protection from everything",
    'until your next turn, you gain protection from everything and your life total can’t change',
  ],
  rejects: [
    "until that player's next turn, they gain protection from everything",
    "until that player's next turn, their life total can't change",
    "until your next turn, your life total can't change",
    "until your next turn, your life total can't change and they gain protection from everything",
    "until their next turn, your life total can't change and you gain protection from everything",
  ],
  parse: (ctx, pos) => {
    const mine = spanned(
      pattern(
        /until your next turn, (?:your life total can(?:not|'t|’t) change and you gain protection from everything|you gain protection from everything and your life total can(?:not|'t|’t) change)(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (mine.ok) {
      return {
        ok: true,
        value: [
          makeClause(
            'effect.player-lock',
            'playerLock',
            { player: impliedYou('effect.player-lock', pos) },
            mine.value.span,
          ),
        ],
        pos: mine.pos,
      };
    }
    const r = spanned(
      pattern(
        /until that player['’]s next turn, they gain protection from everything and their life total can(?:not|'t|’t) change(?![\p{L}\p{N}])/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const player = family<IrNoun>('noun', { only: ['noun.they'] })(ctx, pos + 31);
    if (!player.ok) return player;
    return {
      ok: true,
      value: [
        makeClause('effect.player-lock', 'playerLock', { player: player.value }, r.value.span),
      ],
      pos: r.pos,
    };
  },
});

/**
 * "You gain protection from everything until your next turn" (The One Ring, CR 702.16 Protection): the controller has protection from everything, as the engine's
 * `grantPlayerProtectionEverything` has it. Only the controller, and only until their next turn; "until end of turn", another player and a creature are other statements.
 */
export const EFFECT_PLAYER_PROTECTION = defineRule<Clauses>({
  id: 'effect.player-protection',
  family: 'effect',
  leading: ['you'],
  cites: ['CR 702.16 (Protection)', 'CR 611.2 (Continuous Effects from Resolving Effects)'],
  examples: ['you gain protection from everything until your next turn'],
  rejects: [
    'you gain protection from everything',
    'you gain protection from everything until end of turn',
    'you gain protection from red until your next turn',
    'target player gains protection from everything until your next turn',
    'you gain protection from everything until their next turn',
    'you gain protection from everything and your life total can’t change',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(/you gain protection from everything until your next turn(?![\p{L}\p{N}])/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: [
        makeClause(
          'effect.player-protection',
          'playerProtection',
          { player: impliedYou('effect.player-protection', pos) },
          r.value.span,
        ),
      ],
      pos: r.pos,
    };
  },
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
