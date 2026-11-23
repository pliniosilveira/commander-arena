/**
 * Effect rule of the Scions & Spellcraft deck (Hraesvelgr of the First Brood): "target creature gets +1/+0 until end of turn and can't be blocked this turn." One target creature
 * getting a change of power and toughness and an evasion restriction for the turn, in one sentence.
 */
import { fail, literal, pattern, refuseAt, sequence } from '../../combinators';
import type { IrArg, IrDuration, IrNoun } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';
import { ptChange } from './pump';

const RULE = 'effect.pump-cant-be-blocked';

/**
 * `effect.pump-cant-be-blocked`: "target creature gets +1/+0 until end of turn and can't be blocked this turn" (CR 611.2a, 613.4c, 509.1b, 514.2): the same target creature gets a fixed
 * change of power and toughness until end of turn and cannot be blocked this turn. The engine's `modifyPt` and `restrict` of one target. Not read: a missing duration of either part, an
 * X, several targets, another restriction, an exception to who may block.
 */
export const EFFECT_PUMP_CANT_BE_BLOCKED = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['target'],
  cites: [
    'CR 611.2a (Continuous Effects)',
    'CR 613.4c (Interaction of Continuous Effects)',
    'CR 509.1b (Declare Blockers Step)',
    'CR 514.2 (Cleanup Step)',
  ],
  examples: [
    "target creature gets +1/+0 until end of turn and can't be blocked this turn",
    'target creature gets +2/+2 until end of turn and can’t be blocked this turn',
    "target creature you control gets +1/+0 until end of turn and can't be blocked this turn",
  ],
  rejects: [
    "target creature gets +1/+0 and can't be blocked this turn",
    "target creature gets +1/+0 until end of turn and can't be blocked",
    "target creature gets +X/+0 until end of turn and can't be blocked this turn",
    "target creature gets +1/+0 until end of turn and can't block this turn",
    "target creature gets +1/+0 until end of turn and can't be blocked this turn except by Spirits",
    "target creatures get +1/+0 until end of turn and can't be blocked this turn",
    "target creature gets +1/+0 until end of turn and can't be blocked this turn and draw a card",
  ],
  parse: (ctx, pos) => {
    const subject = refuseAt(
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
      (n) =>
        !n.plural &&
        !n.upTo &&
        n.minTargets === undefined &&
        n.det === 'target' &&
        n.filter.anyOf === undefined &&
        n.filter.types?.length === 1 &&
        n.filter.types[0] === 'creature',
      (_n, _ctx, start) => start,
    );
    const r = sequence(
      subject,
      literal(' gets '),
      ptChange(RULE),
      literal(' '),
      family<IrDuration>('duration', { only: ['duration.until-end-of-turn'] }),
      spanned(pattern(/ and can['’]t be blocked this turn(?![\p{L}\p{N}])/iu)),
    )(ctx, pos);
    if (!r.ok) return r;
    const [objects, , pt, , duration, blocked] = r.value;
    if (typeof pt.power !== 'number' || typeof pt.toughness !== 'number') return fail(ctx, pos);
    const restriction: IrArg = {
      kind: 'restrictionKind',
      restriction: 'cantBeBlocked',
      span: blocked.span,
      rule: RULE,
    };
    const forTurn: IrDuration = {
      kind: 'duration',
      scope: 'thisTurn',
      span: blocked.span,
      rule: RULE,
    };
    const pump = makeClause(RULE, 'modifyPt', { objects, pt }, pt.span);
    const restrict = makeClause(RULE, 'restrict', { objects, restriction }, blocked.span);
    return {
      ok: true,
      value: [
        { ...pump, duration, connector: 'and' },
        { ...restrict, duration: forTurn },
      ],
      pos: r.pos,
    };
  },
});

/** Quiet: a line this rule does not read stops where it always did. */
export const PUMP_UNBLOCKABLE_EFFECT_RULES = [quietly(EFFECT_PUMP_CANT_BE_BLOCKED)];
