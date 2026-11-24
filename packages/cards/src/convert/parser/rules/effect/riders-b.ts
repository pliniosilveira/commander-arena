/**
 * Effect rules of group B of the Riders of Rohan deck (Tales of Middle-earth Commander): the sentences about the group of creatures the sentence before named.
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrArg, IrDuration, IrNoun } from '../../ir/types';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, single } from './operands';

/**
 * `effect.restrict-those-until-next-turn`: "until your next turn, those creatures can't block" (Taunt from the Rampart: "Goad all creatures your opponents control. Until your next turn, those
 * creatures can't block."; CR 611.2a, 611.2c, 500.1, 509.1b). The creatures are the group the sentence before it named, as that sentence left them (the lowering reads it from there
 * and refuses the sentence after any other); they can't block until the next turn of the controller of the effect begins. Not read: another restriction, another duration, "this turn",
 * another subject ("they", "those creatures you control", "target creatures"), a singular.
 */
export const EFFECT_RESTRICT_THOSE = defineRule<Clauses>({
  id: 'effect.restrict-those-until-next-turn',
  family: 'effect',
  leading: ['until'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
    'CR 500.1 (Beginning Phase)',
    'CR 509.1b (Declare Blockers Step)',
  ],
  examples: [
    "until your next turn, those creatures can't block",
    'Until your next turn, those creatures can’t block',
  ],
  rejects: [
    "until your next turn, those creatures can't attack",
    "until your next turn, those creatures can't be blocked",
    "until end of turn, those creatures can't block",
    "those creatures can't block until your next turn",
    "until your next turn, those creatures can't block this turn",
    "until your next turn, they can't block",
    "until your next turn, those creature can't block",
    "until your next turn, those creatures you control can't block",
    "until your next turn, target creatures can't block",
    "until your next turn, those creatures can't block and draw a card",
    "until the end of your next turn, those creatures can't block",
  ],
  parse: single(
    'effect.restrict-those-until-next-turn',
    spanned(pattern(/until your next turn, those creatures can['’]t block(?![\p{L}\p{N}])/iu)),
    (found) => {
      const kind: IrArg = {
        kind: 'restrictionKind',
        restriction: 'cantBlock',
        span: found.span,
        rule: 'effect.restrict-those-until-next-turn',
      };
      const duration: IrDuration = {
        kind: 'duration',
        scope: 'untilYourNextTurn',
        span: found.span,
        rule: 'effect.restrict-those-until-next-turn',
      };
      return { verb: 'restrictThose', args: { restriction: kind }, duration };
    },
  ),
});

/**
 * `effect.cant-attack-player`: "you can't attack that player this turn" (Call for Aid: "Gain control of all creatures target opponent controls until end of turn. ... You can't attack that player this
 * turn."; CR 508.1a, 611.2a, 611.2c). The player the text named before ("that player", bound by the binding pass to the target of the sentence before it) can't be attacked by any creature the controller of
 * the effect controls this turn: the engine's `youCantAttackPlayers`. Not read: another subject than "you", a planeswalker or a creature, another duration, "any player", "target opponent".
 */
export const EFFECT_CANT_ATTACK_PLAYER = defineRule<Clauses>({
  id: 'effect.cant-attack-player',
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 508.1a (Declare Attackers Step)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
  ],
  examples: [
    "you can't attack that player this turn",
    'You can’t attack that player this turn',
    "you can't attack that opponent this turn",
  ],
  rejects: [
    "you can't attack that player",
    "you can't attack that player until end of turn",
    "you can't attack that player this combat",
    "you can't attack target opponent this turn",
    "you can't attack each opponent this turn",
    "you can't attack that creature this turn",
    "you can't attack that player or planeswalkers that player controls this turn",
    "they can't attack that player this turn",
    "you can't attack that player this turn and draw a card",
    'you can attack that player this turn',
    "you can't attack those players this turn",
  ],
  parse: single(
    'effect.cant-attack-player',
    (ctx, pos) => {
      const head = spanned(pattern(/you can['’]t attack /iu))(ctx, pos);
      if (!head.ok) return head;
      const player = sequence(
        family<IrNoun>('noun', { only: ['noun.that-player'] }),
        literal(' this turn'),
      )(ctx, head.pos);
      if (!player.ok) return player;
      return { ok: true, value: player.value[0], pos: player.pos };
    },
    (player) => ({ verb: 'youCantAttackPlayer', args: { player } }),
  ),
});

/**
 * `effect.cant-sacrifice-those`: "you can't sacrifice those creatures this turn" (Call for Aid; CR 701.21a, 101.2, 611.2a, 611.2c). The creatures are the group the sentences before it took by "gain control of
 * all creatures ..." (the lowering reads that and refuses the sentence after any other instruction): the engine's `youCantSacrifice` of the permanents that were taken. Not read: another subject
 * than "you", "those permanents", "this creature", another duration, a singular.
 */
export const EFFECT_CANT_SACRIFICE_THOSE = defineRule<Clauses>({
  id: 'effect.cant-sacrifice-those',
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 701.21a (Sacrifice)',
    'CR 101.2 (Golden Rules)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
  ],
  examples: [
    "you can't sacrifice those creatures this turn",
    'You can’t sacrifice those creatures this turn',
  ],
  rejects: [
    "you can't sacrifice those creatures",
    "you can't sacrifice those creatures until end of turn",
    "you can't sacrifice those permanents this turn",
    "you can't sacrifice that creature this turn",
    "you can't sacrifice those creature this turn",
    "you can't sacrifice creatures this turn",
    "they can't sacrifice those creatures this turn",
    "you can't sacrifice those creatures this turn and draw a card",
    'you can sacrifice those creatures this turn',
  ],
  parse: single(
    'effect.cant-sacrifice-those',
    pattern(/you can['’]t sacrifice those creatures this turn(?![\p{L}\p{N}])/iu),
    () => ({ verb: 'youCantSacrificeThose', args: {} }),
  ),
});

export const RIDERS_B_EFFECT_RULES = [
  EFFECT_RESTRICT_THOSE,
  EFFECT_CANT_ATTACK_PLAYER,
  EFFECT_CANT_SACRIFICE_THOSE,
];
