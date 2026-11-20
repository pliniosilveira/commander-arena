/**
 * Effect rules of the Tannuk deck's land-ramp group (issue 347): "look at the top twenty cards of your library, put any number of land cards from among them onto the battlefield
 * tapped, then shuffle" (Through the Forest Gate; CR 401.2, 110.2a, 701.24: the cards are only looked at, not revealed).
 */
import { fail, literal, pattern, quiet, sequence } from '../../combinators';
import type { IrAmount, IrNoun } from '../../ir/types';
import { FOR_EACH_AMOUNTS } from '../amount/kicked';
import { defineRule, family } from '../registry';
import { type Clauses, single } from './operands';
import { impliedYou } from './player';

const LOOK_PUT_LANDS = 'effect.look-put-lands';

/**
 * `effect.look-put-lands`: "look at the top twenty cards of your library, put any number of land cards from among them onto the battlefield tapped, then shuffle" (CR 401.2: the
 * player may look at the cards, 110.2a: the lands enter under their control, 701.24: the library is shuffled afterwards, with the cards not put onto the battlefield still in it).
 * The engine's `lookAtTop` taking up to as many lands as cards looked at, tapped, the rest staying in the library, and a `shuffle`. Not read: "up to", a number of lands, another
 * kind of card, untapped lands, no shuffle, another library, X.
 */
export const EFFECT_LOOK_PUT_LANDS = defineRule<Clauses>({
  id: LOOK_PUT_LANDS,
  family: 'effect',
  leading: ['look'],
  cites: [
    'CR 401.2 (Library)',
    'CR 110.2a (Permanents)',
    'CR 701.24 (Shuffle)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'look at the top twenty cards of your library, put any number of land cards from among them onto the battlefield tapped, then shuffle',
    'look at the top ten cards of your library, put any number of land cards from among them onto the battlefield tapped, then shuffle',
  ],
  rejects: [
    'look at the top twenty cards of your library, put any number of land cards from among them onto the battlefield tapped',
    'look at the top twenty cards of your library, put any number of land cards from among them onto the battlefield, then shuffle',
    'look at the top twenty cards of your library, put up to two land cards from among them onto the battlefield tapped, then shuffle',
    'look at the top twenty cards of your library, put any number of creature cards from among them onto the battlefield tapped, then shuffle',
    "look at the top twenty cards of target player's library, put any number of land cards from among them onto the battlefield tapped, then shuffle",
    'look at the top X cards of your library, put any number of land cards from among them onto the battlefield tapped, then shuffle',
    'look at the top card of your library, put any number of land cards from among them onto the battlefield tapped, then shuffle',
  ],
  parse: single(
    LOOK_PUT_LANDS,
    sequence(
      literal('look at the top '),
      family<IrAmount>('amount', { only: ['amount.number'] }),
      literal(
        ' cards of your library, put any number of land cards from among them onto the battlefield tapped, then shuffle',
      ),
    ),
    ([, count]) => ({ verb: 'lookPutLands', args: { count } }),
  ),
});

const FOR_EACH_DRAW = 'effect.for-each-draw';

/**
 * `effect.for-each-draw`: "for each land sacrificed this way, draw a card" (Nahiri's Lithoforming; CR 608.2c, 121.1: the count is taken as the instruction runs; the same
 * instruction as "draw a card for each land sacrificed this way", said with the count first). One card for each of the count. Not read: another number of cards ("draw two
 * cards"), "you draw", a count that is not one of the "for each" amounts, no comma, more words after "card".
 */
export const EFFECT_FOR_EACH_DRAW = defineRule<Clauses>({
  id: FOR_EACH_DRAW,
  family: 'effect',
  leading: ['for'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 121.1 (Drawing a Card)'],
  examples: [
    'for each land sacrificed this way, draw a card',
    'for each creature you control, draw a card',
    'for each creature sacrificed this way, draw a card',
  ],
  rejects: [
    'for each land sacrificed this way, draw two cards',
    'for each land sacrificed this way, you draw a card',
    'for each land sacrificed this way draw a card',
    'for each land sacrificed this way, draw a card and gain 1 life',
    'for each land, draw a card',
    'for each land sacrificed this way, draw cards',
    'for each land sacrificed this way, create a Treasure token',
  ],
  parse: single(
    FOR_EACH_DRAW,
    // Quiet: another instruction after "For each ..." stops where the older rules stop (at "For each").
    sequence(
      quiet(family<IrAmount>('amount', { only: FOR_EACH_AMOUNTS })),
      pattern(/, draw a card(?![\p{L}\p{N}])/u),
    ),
    ([each]) => ({
      verb: 'draw',
      args: { player: impliedYou(FOR_EACH_DRAW, each.span.start), amount: each },
    }),
  ),
});

const ENTERS_TAPPED_THIS_TURN = 'effect.lands-enter-tapped-this-turn';

/**
 * `effect.lands-enter-tapped-this-turn`: "lands you control enter tapped this turn" (Nahiri's Lithoforming; CR 614.1c, 614.12, 611.2a: a replacement effect for a group of
 * permanents as they enter, until the turn ends). The permanents are lands of the controller; the engine's `permanentsEnterTapped` with the duration `untilEndOfTurn`. Not read: the
 * lands of an opponent or of anyone, another kind of permanent, "until your next turn" (`effect.group-enters-tapped`), no "this turn", a singular, "enter the battlefield tapped".
 */
export const EFFECT_LANDS_ENTER_TAPPED_THIS_TURN = defineRule<Clauses>({
  id: ENTERS_TAPPED_THIS_TURN,
  family: 'effect',
  leading: ['lands'],
  cites: [
    'CR 614.1c (Replacement Effects)',
    'CR 614.12 (Replacement Effects)',
    'CR 611.2a (Continuous Effects)',
    'CR 514.2 (Cleanup Step)',
  ],
  examples: ['lands you control enter tapped this turn'],
  rejects: [
    'lands your opponents control enter tapped this turn',
    'lands enter tapped this turn',
    'lands you control enter tapped',
    'lands you control enter untapped this turn',
    'land you control enters tapped this turn',
    'lands you control enter the battlefield tapped this turn',
    'lands you control enter tapped this turn and draw a card',
    'creatures you control enter tapped this turn',
  ],
  parse: single(
    ENTERS_TAPPED_THIS_TURN,
    (ctx, pos) => {
      const subject = family<IrNoun>('noun', { only: ['noun.plain-permanents'] })(ctx, pos);
      if (!subject.ok) return subject;
      const noun = subject.value;
      const lands = noun.filter.types?.length === 1 && noun.filter.types[0] === 'land';
      if (!lands || noun.filter.controller !== 'you' || !noun.plural || noun.other) {
        return fail(ctx, pos);
      }
      const words = literal(' enter tapped this turn')(ctx, subject.pos);
      if (!words.ok) return words;
      return { ok: true, value: noun, pos: words.pos };
    },
    (objects) => ({ verb: 'landsEnterTappedThisTurn', args: { objects } }),
  ),
});

export const RAMP_LANDS_EFFECT_RULES = [
  EFFECT_LOOK_PUT_LANDS,
  EFFECT_FOR_EACH_DRAW,
  EFFECT_LANDS_ENTER_TAPPED_THIS_TURN,
];
