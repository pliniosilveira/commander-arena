/**
 * Effect rules of the Death Toll deck, group C (Mulch, Wrenn and Seven, Professor Onyx, Ob Nixilis Reignited, Grist the Hunger Tide): reveal the top cards and put the lands into the
 * hand, look and put one into the hand and the rest into the graveyard.
 */
import { literal, optional, type Parser, pattern, satisfy, sequence } from '../../combinators';
import type { IrArg, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';
import { EMBLEM_ABILITY } from './planeswalker';
import { KIND, kindOfCards } from './reveal-x-cards';

/** A number of cards: digits or a word from one to ten (X is not read). */
const NUMBER = family<IrArg>('amount', { only: ['amount.number'] });

/**
 * `effect.reveal-put-all-hand`: "reveal the top four cards of your library. Put all land cards revealed this way into your hand and the rest into your graveyard" (Mulch; CR 701.20a
 * Reveal: every one of the cards is shown, 608.2c: the cards of the kind all go, no choice). The engine's `lookAtTop` of a reveal with `take.all` into the hand, the rest into the
 * graveyard. Two sentences that `splitSentences` keeps together. Not read: a count of fewer than two cards or X, another library, "from among them" (the Animist's Awakening wording is
 * `effect.reveal-put-all`), another place for either group, a kind the rule does not list.
 */
export const EFFECT_REVEAL_PUT_ALL_HAND = defineRule<Clauses>({
  id: 'effect.reveal-put-all-hand',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20a (Reveal)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 404.1 (Graveyard)',
  ],
  examples: [
    'Reveal the top four cards of your library. Put all land cards revealed this way into your hand and the rest into your graveyard',
    'reveal the top five cards of your library. put all creature cards revealed this way into your hand and the rest into your graveyard',
  ],
  rejects: [
    'reveal the top four cards of your library',
    'reveal the top four cards of your library. put all land cards revealed this way into your hand',
    'reveal the top four cards of your library. put all land cards revealed this way onto the battlefield and the rest into your graveyard',
    'reveal the top four cards of your library. put all land cards revealed this way into your hand and the rest on the bottom of your library in a random order',
    'reveal the top four cards of your library. put all land cards from among them into your hand and the rest into your graveyard',
    'reveal the top four cards of your library. put a land card revealed this way into your hand and the rest into your graveyard',
    'reveal the top one card of your library. put all land cards revealed this way into your hand and the rest into your graveyard',
    'reveal the top x cards of your library. put all land cards revealed this way into your hand and the rest into your graveyard',
    'reveal the top four cards of target player’s library. put all land cards revealed this way into your hand and the rest into your graveyard',
    'reveal the top four cards of your library. put all instant cards revealed this way into your hand and the rest into your graveyard',
  ],
  parse: single(
    'effect.reveal-put-all-hand',
    sequence(
      literal('reveal the top '),
      satisfy(NUMBER, (a) => a.kind === 'number' && a.value >= 2),
      literal(' cards of your library. put all '),
      spanned(pattern(new RegExp(`${KIND}(?= cards revealed this way)`, 'u'))),
      literal(' cards revealed this way into your hand and the rest into your graveyard'),
    ),
    ([, count, , kind]) => ({
      verb: 'revealPutAllHand',
      args: {
        count,
        card: kindOfCards('effect.reveal-put-all-hand', kind.value[1] ?? '', kind.span),
      },
    }),
  ),
});

/**
 * `effect.look-take-one-graveyard`: "look at the top three cards of your library. Put one of them into your hand and the rest into your graveyard" (Professor Onyx; CR 401.2
 * Library, 701.20a Reveal: nothing says reveal, so the card taken stays hidden). Two sentences that `splitSentences` keeps together. The engine's `lookAtTop`: exactly one card of any
 * kind into the hand, the rest into the graveyard. Not read: a count under two or X, another library, another number taken, another place for either group.
 */
export const EFFECT_LOOK_TAKE_ONE_GRAVEYARD = defineRule<Clauses>({
  id: 'effect.look-take-one-graveyard',
  family: 'effect',
  leading: ['look'],
  cites: ['CR 401.2 (Library)', 'CR 701.20a (Reveal)', 'CR 404.1 (Graveyard)'],
  examples: [
    'Look at the top three cards of your library. Put one of them into your hand and the rest into your graveyard',
    'look at the top five cards of your library. put one of them into your hand and the rest into your graveyard',
  ],
  rejects: [
    'look at the top three cards of your library. put one of them into your hand',
    'look at the top three cards of your library. put one of them into your hand and the rest on the bottom of your library in any order',
    'look at the top three cards of your library. put two of them into your hand and the rest into your graveyard',
    'look at the top three cards of your library. put one of them into your hand and the rest into exile',
    'look at the top one card of your library. put one of them into your hand and the rest into your graveyard',
    'look at the top x cards of your library. put one of them into your hand and the rest into your graveyard',
    'look at the top three cards of target player’s library. put one of them into your hand and the rest into your graveyard',
  ],
  parse: single(
    'effect.look-take-one-graveyard',
    sequence(
      literal('look at the top '),
      satisfy(NUMBER, (a) => a.kind === 'number' && a.value >= 2),
      literal(
        ' cards of your library. put one of them into your hand and the rest into your graveyard',
      ),
    ),
    ([, count]) => ({ verb: 'lookTakeOneGraveyard', args: { count } }),
  ),
});

/**
 * `effect.repeat-process-times`: "repeat this process six more times" (Professor Onyx; CR 608.2c: the instructions of the ability before it are carried out again, that many more times).
 * A whole number of two to ten and the words "more times"; "once" is `effect.repeat-process`. What the process is, the lowering decides (the one step before it).
 */
export const EFFECT_REPEAT_PROCESS_TIMES = defineRule<Clauses>({
  id: 'effect.repeat-process-times',
  family: 'effect',
  leading: ['repeat'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['repeat this process six more times', 'Repeat this process two more times'],
  rejects: [
    'repeat this process more times',
    'repeat this process six times',
    'repeat this process six more time',
    'repeat this process one more times',
    'repeat this process x more times',
    'repeat this process once more',
    'repeat this process six more times and draw a card',
    'repeat the process six more times',
    'repeat this six more times',
  ],
  parse: single(
    'effect.repeat-process-times',
    sequence(
      literal('repeat this process '),
      satisfy(NUMBER, (a) => a.kind === 'number' && a.value >= 2),
      literal(' more times'),
    ),
    ([, times]) => ({ verb: 'repeatProcess', args: { times } }),
  ),
});

/**
 * `effect.repeat-process-again`: "repeat this process" with nothing after it (Grist, the Hunger Tide: "If an Insect card was milled this way, put a loyalty counter on ~ and repeat this
 * process"; CR 608.2c): the instructions of the ability before it are carried out again, as long as the test of the sentence holds. The lowering reads the test and the instructions, and
 * refuses the sentence with no test (that would never stop). Not read: "repeat this process once" and "N more times" (`effect.repeat-process`, `effect.repeat-process-times`),
 * "repeat this process for each", "repeat this process twice".
 */
export const EFFECT_REPEAT_PROCESS_AGAIN = defineRule<Clauses>({
  id: 'effect.repeat-process-again',
  family: 'effect',
  leading: ['repeat'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['repeat this process', 'Repeat this process'],
  rejects: [
    'repeat this process once',
    'repeat this process twice',
    'repeat this process six more times',
    'repeat this process for each creature',
    'repeat this process again',
    'repeat the process',
    'repeat this',
    'repeats this process',
  ],
  parse: single('effect.repeat-process-again', pattern(/repeat this process(?=\.|$)/iu), () => ({
    verb: 'repeatProcessAgain',
    args: {},
  })),
});

/** A player a spell or ability targets: "target opponent", "target player" (the chosen player gets the emblem). */
const TARGET_PLAYER: Parser<IrNoun> = satisfy(
  family<IrNoun>('noun', { only: ['noun.player'] }),
  (noun) => noun.det === 'target' && noun.filter.player !== undefined,
);

/**
 * `effect.player-gets-emblem`: `Target opponent gets an emblem with "Whenever a player draws a card, you lose 2 life."` (Ob Nixilis Reignited; CR 114.1, 114.2: the player gets an object
 * in the command zone, CR 114.3: with the abilities in the quotes and nothing else; the player owns and controls it, so "you" in the quotes is them). A chosen player, "target player" or
 * "target opponent", and one quoted ability as `effect.get-emblem` reads it. Not read: "you get" (`effect.get-emblem`), "each opponent gets", "target player gets two emblems", an emblem with
 * no quote.
 */
export const EFFECT_PLAYER_GETS_EMBLEM = defineRule<Clauses>({
  id: 'effect.player-gets-emblem',
  family: 'effect',
  leading: ['target'],
  cites: ['CR 114.1 (Emblems)', 'CR 114.2 (Emblems)', 'CR 114.3 (Emblems)', 'CR 114.4 (Emblems)'],
  examples: [
    'target opponent gets an emblem with "Whenever a player draws a card, you lose 2 life."',
    'Target player gets an emblem with "Creatures you control get +1/+1."',
  ],
  rejects: [
    'target opponent gets an emblem',
    'target opponent gets an emblem with',
    'target opponent gets an emblem with Creatures you control get +1/+1.',
    'target opponent gets two emblems with "Creatures you control get +1/+1."',
    'each opponent gets an emblem with "Creatures you control get +1/+1."',
    'you get an emblem with "Creatures you control get +1/+1."',
    'target creature gets an emblem with "Creatures you control get +1/+1."',
    'target opponent gets an emblem with "Draw a card."',
  ],
  parse: single(
    'effect.player-gets-emblem',
    sequence(TARGET_PLAYER, literal(' gets an emblem with '), EMBLEM_ABILITY),
    ([who, , quoted]) => ({ verb: 'getEmblem', args: { emblem: quoted, who } }),
  ),
});

/**
 * `effect.put-any-number-from-hand`: "put any number of land cards from your hand onto the battlefield tapped" (Wrenn and Seven; CR 608.2d: the player chooses, none up to every card of
 * the kind in their hand; CR 110.2a: the cards enter under their control; CR 614.1 is not needed, tapped is part of the instruction). The engine's `moveToZone` of a `choose` selector
 * of the hand, optional, up to the number of cards of the kind in the hand. Not read: a number, "up to", another zone, "attacking", a count of cards that is not "any number", a kind the
 * rule does not list.
 */
export const EFFECT_PUT_ANY_NUMBER_FROM_HAND = defineRule<Clauses>({
  id: 'effect.put-any-number-from-hand',
  family: 'effect',
  leading: ['put'],
  cites: ['CR 608.2d (Resolving Spells and Abilities)', 'CR 110.2a (Permanents)'],
  examples: [
    'put any number of land cards from your hand onto the battlefield tapped',
    'Put any number of land cards from your hand onto the battlefield',
    'put any number of creature cards from your hand onto the battlefield',
  ],
  rejects: [
    'put any number of land cards from your hand onto the battlefield tapped and attacking',
    'put any number of land cards from your graveyard onto the battlefield tapped',
    'put any number of land cards from your hand into your graveyard',
    'put any number of land cards from your hand onto the battlefield under your control',
    'put up to two land cards from your hand onto the battlefield',
    'put two land cards from your hand onto the battlefield',
    'put any number of land from your hand onto the battlefield',
    'put any number of instant cards from your hand onto the battlefield',
    'you may put any number of land cards from your hand onto the battlefield',
    "put any number of land cards from an opponent's hand onto the battlefield",
  ],
  parse: single(
    'effect.put-any-number-from-hand',
    sequence(
      literal('put any number of '),
      spanned(pattern(new RegExp(`${KIND}(?= cards from your hand onto the battlefield)`, 'u'))),
      literal(' cards from your hand onto the battlefield'),
      optional(pattern(/ tapped(?![\p{L}\p{N}])/iu), null),
    ),
    ([, kind, , tapped]) => ({
      verb: 'putAnyNumberFromHand',
      args: {
        card: {
          ...kindOfCards('effect.put-any-number-from-hand', kind.value[1] ?? '', kind.span),
          filter: {
            ...kindOfCards('effect.put-any-number-from-hand', kind.value[1] ?? '', kind.span)
              .filter,
            zone: 'hand' as const,
            controller: 'you' as const,
          },
        },
        tapped: {
          kind: 'flag' as const,
          value: tapped !== null,
          span: kind.span,
          rule: 'effect.put-any-number-from-hand',
        },
      },
    }),
  ),
});

export const DEATH_TOLL_C_EFFECT_RULES = [
  EFFECT_PUT_ANY_NUMBER_FROM_HAND,
  EFFECT_PLAYER_GETS_EMBLEM,
  EFFECT_REPEAT_PROCESS_AGAIN,
  EFFECT_REVEAL_PUT_ALL_HAND,
  EFFECT_LOOK_TAKE_ONE_GRAVEYARD,
  EFFECT_REPEAT_PROCESS_TIMES,
];
