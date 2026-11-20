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
    // D-412 (Danitha deck group 2, Town Greeter): the card went to the hand.
    'you put a Town card into your hand this way',
    'you put a land card into your hand this way',
  ],
  rejects: [
    'you put a Cave onto the battlefield',
    'you put a Cave onto the battlefield this way.',
    'you put a card onto the battlefield this way',
    'you put a Banana onto the battlefield this way',
    'you put Caves onto the battlefield this way',
    'you put a Cave into your graveyard this way',
    'you put a Cave into your hand',
    'you put a Cave into your hand this way.',
    'you put a Cave into their hand this way',
    "you don't put a Cave onto the battlefield this way",
    'you put a Cave onto the battlefield this way or',
    'an opponent puts a Cave onto the battlefield this way',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        pattern(/you put (?:a|an) /iu),
        WHAT_IT_IS,
        // D-412: "into your hand this way" says where the card went (the lowering reads the card there, `objectMatches` with `inZone`).
        pattern(/ (onto the battlefield|into your hand) this way(?![\p{L}\p{N}])/iu),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const what = r.value.value[1];
    const toHand = r.value.value[2][1]?.toLowerCase() === 'into your hand';
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'putThisWay', filter: what, ...(toHand ? { zone: 'hand' as const } : {}) },
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

/**
 * `condition.milled-this-way`: "at least one Zombie card is milled this way", "a Zombie card is milled this way", "an Insect card was milled this way" (issue 159, Liliana, Untouched by Death; Death Toll deck, group C, Grist, the Hunger Tide; CR 608.2c, 701.17a,
 * 400.7j: what the mill before it put into the graveyard is what the condition asks about; with nothing milled it is false). The kind is any description of what a card is. The
 * engine's `objectMatches` of the objects that were moved, with `any`, in a `conditional` effect after a mill; the lowering refuses it when the clause before is not a mill of
 * your own library.
 */
export const CONDITION_MILLED_THIS_WAY = defineRule<IrCondition>({
  id: 'condition.milled-this-way',
  family: 'condition',
  leading: ['at', 'a', 'an'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 701.17a (Mill)', 'CR 400.7j (General)'],
  examples: [
    'at least one Zombie card is milled this way',
    'a Zombie card is milled this way',
    'at least one creature card is milled this way',
    'at least one land card is milled this way',
    'an Insect card was milled this way',
    'at least one Zombie card was milled this way',
  ],
  rejects: [
    'at least one Zombie card is milled',
    'at least one Zombie card was milled',
    'at least one Zombie card were milled this way',
    'at least two Zombie cards are milled this way',
    'at least one Zombie card is milled this way.',
    'at least one Zombie card is milled this way and',
    'at least one Zombie card is discarded this way',
    'Zombie cards are milled this way',
    'at least one Banana card is milled this way',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      sequence(
        // A lookahead first: "a player cast two or more spells last turn" and the like stop where they always did.
        pattern(/(?=(?:at least one|an?) [^.,]* (?:is|was) milled this way)/iu),
        pattern(/(?:at least one|an?) /iu),
        WHAT_IT_IS,
        pattern(/ (?:is|was) milled this way(?![\p{L}\p{N}])/iu),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'milledThisWay', filter: r.value.value[2] },
        span: { start: pos, end: r.pos },
        rule: 'condition.milled-this-way',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.your-combat-phase`: "it's your combat phase" (CR 506.1: the combat phase has the beginning of combat, declare attackers, declare blockers, combat damage and end of
 * combat steps; it is your combat phase when it is the combat phase of a turn of yours; issue 144, Great Train Heist). The engine's `yourCombatPhase`, read as the instruction
 * runs. Not read: another phase ("it's your main phase" is `condition.your-main-phase`), another turn ("it's not your combat phase"), "a combat phase", a step ("it's your declare
 * attackers step").
 */
export const CONDITION_YOUR_COMBAT_PHASE = defineRule<IrCondition>({
  id: 'condition.your-combat-phase',
  family: 'condition',
  leading: ["it's", 'it’s', 'it'],
  cites: ['CR 506.1 (Combat Phase)', 'CR 500.1 (General)'],
  examples: ["it's your combat phase", 'it’s your combat phase', 'it is your combat phase'],
  rejects: [
    "it's your combat phase.",
    "it's your first combat phase",
    "it's not your combat phase",
    "it's a combat phase",
    "it's an opponent's combat phase",
    "it's your turn",
    "it's your combat phase or",
    "that's your combat phase",
    "it's your main phase",
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/it(?:['’]s| is) your combat phase(?![\p{L}\p{N}])/iu))(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'yourCombatPhase' },
        span: { start: pos, end: r.pos },
        rule: 'condition.your-combat-phase',
      },
      pos: r.pos,
    };
  },
});

export const KORVOLD_CONDITION_RULES = [
  CONDITION_PUT_THIS_WAY,
  CONDITION_MILLED_THIS_WAY,
  CONDITION_YOUR_MAIN_PHASE,
  CONDITION_YOUR_COMBAT_PHASE,
  CONDITION_RING_BEARER,
];
