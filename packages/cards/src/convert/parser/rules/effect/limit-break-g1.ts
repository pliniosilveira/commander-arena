/**
 * Effect rules of the Limit Break deck, group 1 (Zack Fair): what a permanent that was sacrificed to pay the cost of its ability hands on, "Put ~'s counters on that creature" and "attach an
 * Equipment that was attached to ~ to that creature" (CR 113.7a, 608.2h: the permanent is read as it last was on the battlefield).
 */
import { literal, pattern, sequence } from '../../combinators';
import type { IrNoun } from '../../ir/types';
import { defineRule, family, quietly, spanned } from '../registry';
import { type Clauses, single } from './operands';

/** "~" as the permanent the instruction takes from: the permanent with the ability (a noun `self`). */
function selfNoun(span: IrNoun['span'], rule: string): IrNoun {
  return {
    kind: 'noun',
    det: 'self',
    filter: { raw: '~' },
    upTo: false,
    plural: false,
    other: false,
    span,
    rule,
  };
}

const PUT_ID = 'effect.put-self-counters';

/**
 * `effect.put-self-counters`: "Put ~'s counters on that creature" (CR 122.1, 122.6, 113.7a, 608.2h: every counter the permanent had, of every kind, as it last was on the battlefield).
 * The permanent that receives them is the one an earlier instruction of the text named ("that creature"). The engine's `putCountersOf`. Not read: a kind or a number of counters, "its"
 * for `~`, another permanent's counters, a destination that is not "that creature", "each", a target of its own.
 */
export const EFFECT_PUT_SELF_COUNTERS = defineRule<Clauses>({
  id: PUT_ID,
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 122.1 (Counters)',
    'CR 122.6 (Counters)',
    'CR 113.7a (Handling Abilities)',
    'CR 608.2h (Resolving Spells and Abilities)',
  ],
  examples: ["put ~'s counters on that creature", 'put ~’s counters on that permanent'],
  rejects: [
    "put ~'s counters on target creature",
    "put ~'s +1/+1 counters on that creature",
    "put ~'s counter on that creature",
    "put ~'s counters on that creatures",
    "put ~'s counters on ~",
    'put its counters on that creature',
    "put ~'s counters on that creature and draw a card",
    "put ~'s counters",
  ],
  parse: single(
    PUT_ID,
    sequence(
      literal('put '),
      spanned(literal('~')),
      pattern(/['’]s counters on /iu),
      family<IrNoun>('noun', { only: ['noun.that-object'] }),
    ),
    ([, tilde, , to]) => ({
      verb: 'putCountersOf',
      args: { from: selfNoun(tilde.span, PUT_ID), to },
    }),
  ),
});

const ATTACH_ID = 'effect.attach-was-attached';

/**
 * `effect.attach-was-attached`: "attach an Equipment that was attached to ~ to that creature" (CR 701.3, 301.5, 113.7a): the controller of the ability picks one Equipment that was
 * attached to the permanent as it left the battlefield and attaches it to the creature an earlier instruction named. The engine's `chooseObjects` of the objects `attachedTo` the
 * sacrificed permanent, then `attach`. Not read: "an Aura", "each", "all", "target Equipment", a host that is not "that creature", "it" for `~`.
 */
export const EFFECT_ATTACH_WAS_ATTACHED = defineRule<Clauses>({
  id: ATTACH_ID,
  family: 'effect',
  leading: ['attach'],
  cites: [
    'CR 701.3 (Attach)',
    'CR 301.5 (Artifacts)',
    'CR 113.7a (Handling Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: ['attach an Equipment that was attached to ~ to that creature'],
  rejects: [
    'attach an Aura that was attached to ~ to that creature',
    'attach each Equipment that was attached to ~ to that creature',
    'attach all Equipment that was attached to ~ to that creature',
    'attach target Equipment that was attached to ~ to that creature',
    'attach an Equipment that was attached to it to that creature',
    'attach an Equipment that was attached to ~ to target creature',
    'attach an Equipment that was attached to ~ to ~',
    'attach an Equipment to that creature',
    'attach an Equipment that was attached to ~',
  ],
  parse: single(
    ATTACH_ID,
    sequence(
      literal('attach an Equipment that was attached to '),
      spanned(literal('~')),
      literal(' to '),
      family<IrNoun>('noun', { only: ['noun.that-object'] }),
    ),
    ([, tilde, , to]) => ({
      verb: 'attachWasAttached',
      args: { from: selfNoun(tilde.span, ATTACH_ID), to },
    }),
  ),
});

const ATTACH_OWN_ID = 'effect.attach-own-to-self';

/**
 * `effect.attach-own-to-self`: "attach an Equipment you control to ~" (CR 701.3, 301.5, 608.2d: Yuffie, Materia Hunter's "you may attach an Equipment you control to ~"): the controller
 * of the ability picks, as it resolves, one Equipment they control, or none, and attaches it to the permanent with the ability. The engine's `chooseObjects` of up to one Equipment, then
 * `attach` of what was chosen. Not read: "an Aura", "target Equipment" (`effect.attach`), "each", "all", another host than `~`, an Equipment that is not "you control".
 */
export const EFFECT_ATTACH_OWN_TO_SELF = defineRule<Clauses>({
  id: ATTACH_OWN_ID,
  family: 'effect',
  leading: ['attach'],
  cites: [
    'CR 701.3 (Attach)',
    'CR 301.5 (Artifacts)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: ['attach an Equipment you control to ~'],
  rejects: [
    'attach an Aura you control to ~',
    'attach each Equipment you control to ~',
    'attach all Equipment you control to ~',
    'attach an Equipment to ~',
    'attach an Equipment you control to that creature',
    'attach an Equipment you control to target creature',
    'attach an Equipment you control',
  ],
  parse: single(
    ATTACH_OWN_ID,
    sequence(literal('attach an Equipment you control to '), spanned(literal('~'))),
    ([, tilde]) => ({
      verb: 'attachOwnToSelf',
      args: { to: selfNoun(tilde.span, ATTACH_OWN_ID) },
    }),
  ),
});

export const LIMIT_BREAK_G1_EFFECT_RULES = [
  EFFECT_PUT_SELF_COUNTERS,
  EFFECT_ATTACH_WAS_ATTACHED,
  EFFECT_ATTACH_OWN_TO_SELF,
].map(quietly);
