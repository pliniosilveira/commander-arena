/**
 * Condition of issue 89 (the Silverquill deck): "it's attacking one of your opponents" (CR 508.1b, 506.3, 113.7a): the object the trigger is about is an attacker whose
 * attack target is an opponent of the controller of the ability as a player (not a planeswalker or a battle).
 */

import { pattern } from '../../combinators';
import type { IrCondition, IrNoun } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule } from '../registry';

/**
 * `condition.it-attacking-opponents`: "it's attacking one of your opponents" (CR 508.1b, 506.3). The engine's `objectMatches` of the object "it" names against a filter with
 * `attackingOpponents: 'players'`, in a `conditional` effect: read as the combat is when the effect resolves. Not read: "it's attacking you", "it's attacking an opponent",
 * "it's attacking your opponents", "it's not attacking one of your opponents", "that creature is attacking one of your opponents".
 */
export const CONDITION_IT_ATTACKING_OPPONENTS = defineRule<IrCondition>({
  id: 'condition.it-attacking-opponents',
  family: 'condition',
  leading: ['it’s', "it's"],
  cites: ['CR 508.1b (Declare Attackers Step)', 'CR 506.3 (Combat Phase)'],
  examples: ["it's attacking one of your opponents", 'it’s attacking one of your opponents'],
  rejects: [
    "it's attacking you",
    "it's attacking an opponent",
    "it's attacking your opponents",
    "it's not attacking one of your opponents",
    "it's attacking one of your opponents and",
    "it's attacking one of you opponents",
    'it is attacking one of your opponents',
    "that's attacking one of your opponents",
    "it's attacking one of your opponent",
  ],
  parse: (ctx, pos) => {
    const r = pattern(new RegExp(`it['’]s attacking one of your opponents${BOUNDARY}`, 'iu'))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    const it: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: 'it' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 2 },
      rule: 'condition.it-attacking-opponents',
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'objectMatches',
          who: it,
          filter: {
            types: ['creature'],
            attackingOpponents: 'players',
            raw: 'attacking one of your opponents',
          },
        },
        span: { start: pos, end: r.pos },
        rule: 'condition.it-attacking-opponents',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.it-was-attacking`: "it was attacking" (issue 101, Zurgo Stormrender; CR 506.4, 603.10a, 113.7a): the object the trigger is about was an attacking creature, as it is or, once it
 * has left the battlefield, as it last was. The engine's `objectMatches` of the object "it" names against a filter with `attacking`, in a `conditional` effect. Not read: the present
 * "it's attacking", "it was not attacking", "it was attacking you", "that creature was attacking".
 */
export const CONDITION_IT_WAS_ATTACKING = defineRule<IrCondition>({
  id: 'condition.it-was-attacking',
  family: 'condition',
  leading: ['it'],
  cites: [
    'CR 506.4 (Combat Phase)',
    'CR 603.10a (Handling Triggered Abilities)',
    'CR 113.7a (Abilities)',
  ],
  examples: ['it was attacking'],
  rejects: [
    "it's attacking",
    'it is attacking',
    'it was not attacking',
    'it was attacking you',
    'it was attacking one of your opponents',
    'that creature was attacking',
    'it was attacking and',
  ],
  parse: (ctx, pos) => {
    const r = pattern(new RegExp(`it was attacking${BOUNDARY}`, 'iu'))(ctx, pos);
    if (!r.ok) return r;
    const it: IrNoun = {
      kind: 'noun',
      det: 'anaphor',
      filter: { raw: 'it' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos + 2 },
      rule: 'condition.it-was-attacking',
    };
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'objectMatches',
          who: it,
          filter: { types: ['creature'], attacking: true, raw: 'attacking' },
        },
        span: { start: pos, end: r.pos },
        rule: 'condition.it-was-attacking',
      },
      pos: r.pos,
    };
  },
});

export const ATTACKING_OPPONENTS_CONDITION_RULES = [
  CONDITION_IT_ATTACKING_OPPONENTS,
  CONDITION_IT_WAS_ATTACKING,
];
