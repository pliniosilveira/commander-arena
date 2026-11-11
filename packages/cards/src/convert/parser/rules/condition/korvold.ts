/**
 * Conditions of stage P37 (D-180): "If you put a Cave onto the battlefield this way" (CR 608.2c: what an earlier instruction of the same text put
 * onto the battlefield was).
 */
import { pattern, sequence } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { WHAT_IT_IS } from './recursion';

/**
 * `condition.put-this-way`: "you put a Cave onto the battlefield this way", "you put a land onto the battlefield this way" (CR 608.2c, 400.7j: the
 * card an earlier instruction of the text put onto the battlefield is what the condition asks about, as it is; with nothing put there is nothing to
 * ask and it is false). The kind is any description of what an object is (a land type, a card type, modifiers). The engine's `objectMatches` of the
 * object that was moved, in a `conditional` effect after an instruction that moves a card; the engine refuses it when no instruction before it does.
 */
export const CONDITION_PUT_THIS_WAY = defineRule<IrCondition>({
  id: 'condition.put-this-way',
  family: 'condition',
  leading: ['you'],
  cites: [
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 400.7j (General)',
    'CR 205.3 (Subtypes)',
  ],
  examples: [
    'you put a Cave onto the battlefield this way',
    'you put an Island onto the battlefield this way',
    'you put a land onto the battlefield this way',
    'you put a creature onto the battlefield this way',
  ],
  rejects: [
    'you put a Cave onto the battlefield',
    'you put a Cave onto the battlefield this way.',
    'you put a card onto the battlefield this way',
    'you put a Banana onto the battlefield this way',
    'you put Caves onto the battlefield this way',
    'you put a Cave into your hand this way',
    "you don't put a Cave onto the battlefield this way",
    'you put a Cave onto the battlefield this way or',
    'an opponent puts a Cave onto the battlefield this way',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        pattern(/you put (?:a|an) /iu),
        WHAT_IT_IS,
        pattern(/ onto the battlefield this way(?![\p{L}\p{N}])/iu),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const what = r.value.value[1];
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'putThisWay', filter: what },
        span: { start: pos, end: r.pos },
        rule: 'condition.put-this-way',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.your-main-phase`: "it's your main phase" (CR 505.1: the precombat main phase and the postcombat main phase; it is your main phase when
 * it is a main phase of a turn of yours; stage P41, D-188). The engine's `yourMainPhase`, read as the event happens and again as the ability resolves
 * (CR 603.4). Not read: another phase ("it's your combat"), another turn ("it's not your main phase", "it's an opponent's main phase"), or "a main phase".
 */
export const CONDITION_YOUR_MAIN_PHASE = defineRule<IrCondition>({
  id: 'condition.your-main-phase',
  family: 'condition',
  leading: ["it's", 'it’s', 'it'],
  cites: ['CR 505.1 (Main Phase)', 'CR 603.4 (Handling Triggered Abilities)', 'CR 500.1 (General)'],
  examples: ["it's your main phase", 'it’s your main phase', 'it is your main phase'],
  rejects: [
    "it's your main phase.",
    "it's your first main phase",
    "it's not your main phase",
    "it's a main phase",
    "it's an opponent's main phase",
    "it's your turn",
    "it's your main phase or",
    "that's your main phase",
    "it's your combat phase",
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/it(?:['’]s| is) your main phase(?![\p{L}\p{N}])/iu))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'yourMainPhase' },
        span: { start: pos, end: r.pos },
        rule: 'condition.your-main-phase',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.ring-bearer`: "you control your Ring-bearer" (CR 701.54e, stage P45, D-197): a creature that is on the battlefield under your control
 * and has the Ring-bearer designation of yours. The engine's `controlsRingBearer`, read as the event happens and again as the ability resolves
 * (CR 603.4). Not read: another player's Ring-bearer ("an opponent controls their Ring-bearer"), a count, "you don't control your Ring-bearer" and
 * "your Ring-bearer is ..." (a creature the effect or the condition names is another line).
 */
export const CONDITION_RING_BEARER = defineRule<IrCondition>({
  id: 'condition.ring-bearer',
  family: 'condition',
  leading: ['you'],
  cites: [
    'CR 701.54e (The Ring Tempts You)',
    'CR 701.54a (The Ring Tempts You)',
    'CR 603.4 (Handling Triggered Abilities)',
  ],
  examples: ['you control your Ring-bearer'],
  rejects: [
    'you control your Ring-bearer.',
    "you don't control your Ring-bearer",
    'you control a Ring-bearer',
    'you control their Ring-bearer',
    'an opponent controls their Ring-bearer',
    'you control your Ring-bearers',
    'you control your Ring-bearer or',
    'you control your ring',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/you control your Ring-bearer(?![\p{L}\p{N}-])/iu))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'controlsRingBearer' },
        span: { start: pos, end: r.pos },
        rule: 'condition.ring-bearer',
      },
      pos: r.pos,
    };
  },
});

export const KORVOLD_CONDITION_RULES = [
  CONDITION_PUT_THIS_WAY,
  CONDITION_YOUR_MAIN_PHASE,
  CONDITION_RING_BEARER,
];
