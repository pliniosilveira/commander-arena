/**
 * Effect rules of the Multiverse Reforged deck (issue 81, Dack Fayden): reveal a creature for each opponent, goad them for good, and give each to a different opponent.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule, quietly, spanned } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.reveal-until-opponents`: "reveal cards from the top of your library until you reveal X creature cards, where X is the number of opponents you have. Put those creature cards onto
 * the battlefield, then shuffle" (CR 701.20, 701.24, 107.3c, 102.2, 110.2a): the cards are revealed one at a time until as many creature cards as the controller has opponents have been
 * revealed (all of them if the library runs out first); those creature cards are put onto the battlefield and the rest of the library is shuffled. The engine's `revealUntil` with the
 * opponent count and `rest: 'stay'`, then a `shuffle`. The permanents are what a following sentence names ("they", "those permanents").
 */
export const EFFECT_REVEAL_UNTIL_OPPONENTS = defineRule<Clauses>({
  id: 'effect.reveal-until-opponents',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20 (Reveal)',
    'CR 701.24 (Shuffle)',
    'CR 107.3c (Numbers and Symbols)',
    'CR 102.2 (Players)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'reveal cards from the top of your library until you reveal X creature cards, where X is the number of opponents you have. Put those creature cards onto the battlefield, then shuffle',
    'reveal cards from the top of your library until you reveal X creature cards, where X is the number of opponents you have, put those creature cards onto the battlefield, then shuffle',
  ],
  rejects: [
    'reveal cards from the top of your library until you reveal X creature cards, where X is the number of opponents you have',
    'reveal cards from the top of your library until you reveal X creature cards, where X is the number of opponents you have. Put those creature cards onto the battlefield',
    'reveal cards from the top of your library until you reveal X land cards, where X is the number of opponents you have. Put those creature cards onto the battlefield, then shuffle',
    'reveal cards from the top of your library until you reveal X creature cards, where X is the number of creatures you control. Put those creature cards onto the battlefield, then shuffle',
    'reveal cards from the top of your library until you reveal X creature cards, where X is the number of opponents you have. Put those creature cards onto the battlefield tapped, then shuffle',
    'reveal cards from the top of your library until you reveal X creature cards, where X is the number of opponents you have. Put those creature cards into your hand, then shuffle',
    'reveal cards from the top of your library until you reveal two creature cards, where X is the number of opponents you have. Put those creature cards onto the battlefield, then shuffle',
  ],
  parse: single(
    'effect.reveal-until-opponents',
    sequence(
      literal(
        'reveal cards from the top of your library until you reveal X creature cards, where X is ',
      ),
      spanned(pattern(/the number of opponents you have(?![\p{L}\p{N}'’])/iu)),
      pattern(/[.,] put those creature cards onto the battlefield, then shuffle(?![\p{L}\p{N}])/iu),
    ),
    ([, count]) => ({
      verb: 'revealUntilOpponents',
      args: {
        count: { kind: 'opponentCount', span: count.span } satisfies IrAmount,
      },
    }),
  ),
});

/**
 * `effect.goad-moved-forever`: "they're goaded for the rest of the game" (CR 701.15a): the creatures the instruction before it put onto the battlefield are goaded by the controller with
 * no end. The engine's `goad` of `moved` with `forTheRestOfTheGame`; the lowering refuses it after any instruction but a reveal. Not read: "it", "until your next turn", another duration.
 */
export const EFFECT_GOAD_MOVED_FOREVER = defineRule<Clauses>({
  id: 'effect.goad-moved-forever',
  family: 'effect',
  leading: ['they', "they're", 'they’re'],
  cites: ['CR 701.15a (Goad)', 'CR 611.2a (Continuous Effects)'],
  examples: ["they're goaded for the rest of the game", 'they’re goaded for the rest of the game'],
  rejects: [
    "they're goaded for the rest of the game.",
    "they're goaded until your next turn",
    "they're goaded",
    "it's goaded for the rest of the game",
    "they're goaded for the rest of the turn",
    'they are goaded for the rest of the game',
    "they're goaded for the rest of the game and draw a card",
  ],
  parse: single(
    'effect.goad-moved-forever',
    pattern(/they['’]re goaded for the rest of the game(?![\p{L}\p{N}])/iu),
    () => ({ verb: 'goadMovedForever', args: {} }),
  ),
});

/**
 * `effect.assign-control-to-opponents`: "for each of those permanents, choose a different opponent. Each opponent gains control of the permanent for which they were chosen" (CR 613.1b,
 * 611.2a, 101.4): the controller chooses an opponent for each permanent the instruction before it put onto the battlefield, a different one each time, and each opponent gains control of
 * theirs. Two sentences that `splitSentences` keeps together. The engine's `assignControlToOpponents` of `moved`.
 */
export const EFFECT_ASSIGN_CONTROL_TO_OPPONENTS = defineRule<Clauses>({
  id: 'effect.assign-control-to-opponents',
  family: 'effect',
  leading: ['for'],
  cites: [
    'CR 613.1b (Interaction of Continuous Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 101.4 (Strive for Fairness)',
  ],
  examples: [
    'for each of those permanents, choose a different opponent. Each opponent gains control of the permanent for which they were chosen',
  ],
  rejects: [
    'for each of those permanents, choose a different opponent',
    'for each of those permanents, choose an opponent. Each opponent gains control of the permanent for which they were chosen',
    'for each of those creatures, choose a different opponent. Each opponent gains control of the permanent for which they were chosen',
    'for each of those permanents, choose a different opponent. Each opponent gains control of the permanent for which they were chosen.',
    'for each of those permanents, choose a different player. Each player gains control of the permanent for which they were chosen',
    'for each of those permanents, choose a different opponent. You gain control of the permanent for which they were chosen',
    'for each of those permanents, choose a different opponent. Each opponent gains control of the permanent for which they were chosen until end of turn',
  ],
  parse: single(
    'effect.assign-control-to-opponents',
    pattern(
      /for each of those permanents, choose a different opponent\. each opponent gains control of the permanent for which they were chosen(?![\p{L}\p{N}])/iu,
    ),
    () => ({ verb: 'assignControlToOpponents', args: {} }),
  ),
});

export const DACK_EFFECT_RULES = [
  EFFECT_REVEAL_UNTIL_OPPONENTS,
  EFFECT_GOAD_MOVED_FOREVER,
  EFFECT_ASSIGN_CONTROL_TO_OPPONENTS,
].map(quietly);
