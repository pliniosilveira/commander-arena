/**
 * Effect rules of the Party Time deck, group "library": the instructions that exile permanents the controller chooses until a permanent leaves, and the looks at another player's
 * library. The lowerings are in `lower/party-time-library.ts`.
 */
import {
  literal,
  map,
  optional,
  type Parser,
  pattern,
  satisfy,
  separatedBy1,
  sequence,
} from '../../combinators';
import type { IrArg, IrFlag, IrNoun, IrNounList } from '../../ir/types';
import { defineRule, family } from '../registry';
import { UNTIL_SOURCE_LEAVES } from './angels';
import { TAKEN_CARD } from './library';
import { type Clauses, makeClause, single } from './operands';

/** The clauses of a rule that read "you may" themselves are optional (the sentence reader marks the same offer when it strips the words first). */
function asOffer(parser: Parser<Clauses>): Parser<Clauses> {
  return map(parser, (clauses) =>
    clauses.map((c) =>
      c.args.may?.kind === 'flag' && c.args.may.value ? { ...c, optional: true } : c,
    ),
  );
}

const EXILE_ANY_RULE = 'effect.exile-any-number-until-leaves';

/**
 * `effect.exile-any-number-until-leaves`: "you may exile any number of non-Angel creatures you control until ~ leaves the battlefield" (CR 608.2d: the permanents are chosen as the
 * ability resolves, none included; CR 610.3: they return when the permanent with the ability leaves the battlefield). The engine's `moveToZone` into exile of an `anyNumber` choice
 * among the controller's permanents with `until`. Only permanents the controller controls (nobody else's are chosen), and an offer. Not read: a target, "all", "up to", another
 * duration, a permanent an opponent controls, "exile any number of target creatures".
 */
export const EFFECT_EXILE_ANY_NUMBER_UNTIL_LEAVES = defineRule<Clauses>({
  id: EXILE_ANY_RULE,
  family: 'effect',
  leading: ['you', 'exile'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 610.3 (Duration of Continuous Effects)',
    'CR 701.13 (Exile)',
  ],
  examples: [
    'you may exile any number of non-Angel creatures you control until ~ leaves the battlefield',
    'exile any number of creatures you control until ~ leaves the battlefield',
    'you may exile any number of other nonland permanents you control until ~ leaves the battlefield',
  ],
  rejects: [
    'you may exile any number of non-Angel creatures you control',
    'you may exile any number of non-Angel creatures you control until end of turn',
    'you may exile any number of non-Angel creatures an opponent controls until ~ leaves the battlefield',
    'you may exile any number of target creatures you control until ~ leaves the battlefield',
    'you may exile all non-Angel creatures you control until ~ leaves the battlefield',
    'you may exile up to two non-Angel creatures you control until ~ leaves the battlefield',
    'you may exile any number of non-Angel creatures you control until ~ leaves the battlefield and draw a card',
  ],
  parse: asOffer(
    single(
      EXILE_ANY_RULE,
      sequence(
        optional(literal('you may '), null),
        literal('exile '),
        satisfy(
          family<IrNoun>('noun', { only: ['noun.any-number-permanents'] }),
          (n) => n.filter.controller === 'you' && n.anyNumber === true,
        ),
        UNTIL_SOURCE_LEAVES,
        pattern(/(?![\p{L}\p{N}])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/u),
      ),
      ([may, , objects]) => {
        const flag: IrFlag = {
          kind: 'flag',
          value: may !== null,
          span: { start: 0, end: 0 },
          rule: EXILE_ANY_RULE,
        };
        return { verb: 'exileAnyNumberUntilLeaves', args: { objects, may: flag } };
      },
    ),
  ),
});

const NUMBER = family<IrArg>('amount', { only: ['amount.number'] });
const KINDS_RULE = 'effect.look-take-kinds';

/**
 * `effect.look-take-kinds`: "look at the top four cards of your library. You may reveal a Cleric card, a Rogue card, a Warrior card, and/or a Wizard card from among them and put
 * those cards into your hand. Put the rest on the bottom of your library in a random order" (CR 701.20 Reveal, 401.4, 608.2d: one card for each description, each a different
 * card). Three sentences that `splitSentences` keeps together. The engine's `lookAtTop` with `take.kinds`. Not read: one kind (`effect.look-take`), "or", another place for the cards
 * taken or for the rest, one card looked at, another library.
 */
export const EFFECT_LOOK_TAKE_KINDS = defineRule<Clauses>({
  id: KINDS_RULE,
  family: 'effect',
  leading: ['look'],
  cites: ['CR 701.20 (Reveal)', 'CR 401.4 (Library)', 'CR 608.2d (Resolving Spells and Abilities)'],
  examples: [
    'look at the top four cards of your library. You may reveal a Cleric card, a Rogue card, a Warrior card, and/or a Wizard card from among them and put those cards into your hand. Put the rest on the bottom of your library in a random order',
    'look at the top five cards of your library. You may reveal a creature card, a land card, and/or an artifact card from among them and put those cards into your hand. Put the rest on the bottom of your library in a random order',
  ],
  rejects: [
    'look at the top four cards of your library. You may reveal a Cleric card, a Rogue card, a Warrior card, and/or a Wizard card from among them and put those cards into your hand',
    'look at the top four cards of your library. You may reveal a Cleric card, a Rogue card, a Warrior card, or a Wizard card from among them and put those cards into your hand. Put the rest on the bottom of your library in a random order',
    'look at the top four cards of your library. You may reveal a Cleric card, a Rogue card, a Warrior card, and/or a Wizard card from among them and put those cards onto the battlefield. Put the rest on the bottom of your library in a random order',
    'look at the top four cards of your library. You may reveal a Cleric card, a Rogue card, a Warrior card, and/or a Wizard card from among them and put those cards into your hand. Put the rest into your graveyard',
    'look at the top four cards of your library. You may reveal a Cleric card from among them and put those cards into your hand. Put the rest on the bottom of your library in a random order',
    "look at the top four cards of target opponent's library. You may reveal a Cleric card, a Rogue card, and/or a Wizard card from among them and put those cards into your hand. Put the rest on the bottom of your library in a random order",
  ],
  parse: single(
    KINDS_RULE,
    sequence(
      literal('look at the top '),
      satisfy(NUMBER, (a) => a.kind === 'number' && a.value >= 2),
      literal(' cards of your library. you may reveal '),
      satisfy(
        separatedBy1<IrNoun>(TAKEN_CARD, pattern(/, and\/or |, | and\/or /iu)),
        (kinds) => kinds.length >= 2,
      ),
      pattern(
        /(?<=card) from among them and put those cards into your hand\. put the rest on the bottom of your library in a random order(?![\p{L}\p{N}])/iu,
      ),
    ),
    ([, count, , kinds]) => {
      const first = kinds[0];
      const last = kinds[kinds.length - 1];
      const list: IrNounList = {
        kind: 'nounList',
        items: kinds,
        span: { start: first?.span.start ?? 0, end: last?.span.end ?? 0 },
        rule: KINDS_RULE,
      };
      return { verb: 'lookTakeKinds', args: { count, kinds: list } };
    },
  ),
});

const GONTI_RULE = 'effect.look-exile-cast-any-type';

/**
 * `effect.look-exile-cast-any-type`: "look at the top four cards of target opponent's library, exile one of them face down, then put the rest on the bottom of that library in a random
 * order. You may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell" (CR 401.2, 406.3: the card is exiled face down and its
 * controller may look at it; CR 609.4b: mana of any type; CR 611.2: for as long as it stays in exile). Two sentences that `splitSentences` keeps together. The engine's `lookAtTop`
 * with `from` and `take.to` `exileFaceDownUnlinked`, then a `mayPlay` of the card with `lookAt`, `castOnly` and `anyManaType`. Not read: your own library, each opponent, another number
 * of cards kept, another place for the rest, another length, "play", the card face up.
 */
export const EFFECT_LOOK_EXILE_CAST_ANY_TYPE = defineRule<Clauses>({
  id: GONTI_RULE,
  family: 'effect',
  leading: ['look'],
  cites: [
    'CR 401.2 (Library)',
    'CR 406.3 (Exile)',
    'CR 609.4b (Effects That Modify Cost)',
    'CR 611.2 (Continuous Effects)',
  ],
  examples: [
    "look at the top four cards of target opponent's library, exile one of them face down, then put the rest on the bottom of that library in a random order. You may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell",
    'look at the top three cards of target opponent’s library, exile one of them face down, then put the rest on the bottom of that library in a random order. you may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell',
  ],
  rejects: [
    "look at the top four cards of target opponent's library, exile one of them face down, then put the rest on the bottom of that library in a random order",
    'look at the top four cards of your library, exile one of them face down, then put the rest on the bottom of that library in a random order. You may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell',
    "look at the top four cards of each opponent's library, exile one of them face down, then put the rest on the bottom of that library in a random order. You may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell",
    "look at the top four cards of target opponent's library, exile one of them face down, then put the rest into their graveyard. You may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell",
    "look at the top four cards of target opponent's library, exile one of them face down, then put the rest on the bottom of that library in a random order. You may cast that card this turn, and mana of any type can be spent to cast that spell",
    "look at the top four cards of target opponent's library, exile one of them face down, then put the rest on the bottom of that library in a random order. You may cast that card for as long as it remains exiled",
    "look at the top one card of target opponent's library, exile one of them face down, then put the rest on the bottom of that library in a random order. You may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell",
  ],
  parse: single(
    GONTI_RULE,
    sequence(
      literal('look at the top '),
      satisfy(NUMBER, (a) => a.kind === 'number' && a.value >= 2),
      literal(' cards of '),
      satisfy(family<IrNoun>('noun', { only: ['noun.player'] }), (n) => n.det === 'target'),
      pattern(
        /['’]s library, exile one of them face down, then put the rest on the bottom of that library in a random order\. you may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell(?![\p{L}\p{N}])/iu,
      ),
    ),
    ([, count, , from]) => ({ verb: 'lookExileCastAnyType', args: { count, from } }),
  ),
});

/**
 * `effect.balance`: "each player chooses a number of lands they control equal to the number of lands controlled by the player who controls the fewest, then sacrifices the rest. Players
 * discard cards and sacrifice creatures the same way" (CR 101.4, 608.2d, 701.9, 701.21a: the instruction of Balance, in three parts: lands, cards in hand, creatures). Two sentences that
 * `splitSentences` keeps together. Three clauses, one engine `balance` for each part. Not read: another part, another order, "a player", only the lands.
 */
export const EFFECT_BALANCE = defineRule<Clauses>({
  id: 'effect.balance',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 101.4 (Golden Rules)',
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.9 (Discard)',
    'CR 701.21a (Sacrifice)',
  ],
  examples: [
    'each player chooses a number of lands they control equal to the number of lands controlled by the player who controls the fewest, then sacrifices the rest. Players discard cards and sacrifice creatures the same way',
  ],
  rejects: [
    'each player chooses a number of lands they control equal to the number of lands controlled by the player who controls the fewest, then sacrifices the rest',
    'each player chooses a number of lands they control equal to the number of lands controlled by the player who controls the fewest, then sacrifices the rest. Players discard cards the same way',
    'each player chooses a number of lands they control equal to the number of lands controlled by the player who controls the most, then sacrifices the rest. Players discard cards and sacrifice creatures the same way',
    'each opponent chooses a number of lands they control equal to the number of lands controlled by the player who controls the fewest, then sacrifices the rest. Players discard cards and sacrifice creatures the same way',
    'each player chooses a number of lands they control equal to the number of lands controlled by the player who controls the fewest, then sacrifices the rest. Players sacrifice creatures and discard cards the same way',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.balance';
    const r = pattern(
      /each player chooses a number of lands they control equal to the number of lands controlled by the player who controls the fewest, then sacrifices the rest\. players discard cards and sacrifice creatures the same way(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const span = { start: pos, end: r.pos };
    return {
      ok: true,
      value: [
        makeClause(id, 'balanceLands', {}, span),
        makeClause(id, 'balanceHand', {}, span),
        makeClause(id, 'balanceCreatures', {}, span),
      ],
      pos: r.pos,
    };
  },
});

export const PARTY_TIME_LIBRARY_EFFECT_RULES = [
  EFFECT_BALANCE,
  EFFECT_LOOK_EXILE_CAST_ANY_TYPE,
  EFFECT_EXILE_ANY_NUMBER_UNTIL_LEAVES,
  EFFECT_LOOK_TAKE_KINDS,
];
