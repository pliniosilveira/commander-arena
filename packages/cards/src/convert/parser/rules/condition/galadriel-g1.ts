/**
 * Conditions of group 1 of the Galadriel deck (issue 43): "this is the second time this ability has resolved this turn" (Elrond, Lord of Rivendell; CR 608.2c: read as the instruction
 * comes up, counting this resolution) and "you chose a creature other than ~ as your Ring-bearer" (Galadriel of Lothlorien; CR 701.54a: the creature the Ring tempted the player to
 * choose, CR 603.4: the intervening "if" of the trigger "whenever the Ring tempts you").
 */
import { fail, pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { BOUNDARY } from '../noun/phrases';
import { defineRule } from '../registry';

const ORDINALS: Readonly<Record<string, number>> = { first: 1, second: 2, third: 3, fourth: 4 };

/**
 * `condition.resolved-times`: "this is the second time this ability has resolved this turn" (CR 608.2c: the instruction is read as it comes up, so the resolution that is
 * happening counts). The engine's `abilityResolvedTimes`. "First" (issue 81, Nissa, Leyline Tamer) is the resolution that is happening when no other has begun this turn. Not read: a number word that is not an ordinal ("two
 * times"), another subject ("this spell", "that ability"), another span than the turn, the plural, the past tense of "is".
 */
export const CONDITION_RESOLVED_TIMES = defineRule<IrCondition>({
  id: 'condition.resolved-times',
  family: 'condition',
  leading: ['this'],
  cites: ['CR 608.2c (Resolving Spells and Abilities)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    'this is the second time this ability has resolved this turn',
    'This is the third time this ability has resolved this turn',
    'this is the fourth time this ability has resolved this turn',
    'this is the first time this ability has resolved this turn',
  ],
  rejects: [
    'this is the first time this ability has resolved',
    'this is the second time this ability has resolved',
    'this is the second time this spell has resolved this turn',
    'this is the second time that ability has resolved this turn',
    'this is the second time this ability has resolved this game',
    'this is the two times this ability has resolved this turn',
    'this is the second time this ability resolves this turn',
    'this was the second time this ability has resolved this turn',
    'this is the second time this ability has resolved this turn and',
    'this is the fifth time this ability has resolved this turn',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `this is the (first|second|third|fourth) time this ability has resolved this turn${BOUNDARY}(?! and\\b)`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const times = ORDINALS[(r.value[1] ?? '').toLowerCase()];
    if (times === undefined) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'abilityResolvedTimes', times },
        span: { start: pos, end: r.pos },
        rule: 'condition.resolved-times',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.chose-ring-bearer`: "you chose a creature other than ~ as your Ring-bearer" (CR 701.54a: each time the Ring tempts you, you choose a creature you control as your Ring-bearer).
 * The creature chosen is not the permanent with the ability. The engine's `ringBearerChosen` with `other`. Not read: the creature itself ("you chose ~ as your Ring-bearer"), another
 * player's Ring-bearer, another noun than creature, "a creature you control", the present tense.
 */
export const CONDITION_CHOSE_RING_BEARER = defineRule<IrCondition>({
  id: 'condition.chose-ring-bearer',
  family: 'condition',
  leading: ['you'],
  cites: ['CR 701.54a (The Ring Tempts You)', 'CR 603.4 (Handling Triggered Abilities)'],
  examples: [
    'you chose a creature other than ~ as your Ring-bearer',
    'You chose a creature other than ~ as your Ring-bearer',
  ],
  rejects: [
    'you chose ~ as your Ring-bearer',
    'you chose a creature as your Ring-bearer',
    'you chose a creature other than ~ as their Ring-bearer',
    'you chose an artifact other than ~ as your Ring-bearer',
    'you choose a creature other than ~ as your Ring-bearer',
    'you chose a creature other than ~ as your Ring-bearer and',
    'you chose a creature you control other than ~ as your Ring-bearer',
    'you chose a creature other than this creature as your Ring-bearer',
    'you chose a creature other than ~',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `you chose a creature other than ~ as your Ring-bearer${BOUNDARY}(?! and\\b)`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'ringBearerChosen' },
        span: { start: pos, end: r.pos },
        rule: 'condition.chose-ring-bearer',
      },
      pos: r.pos,
    };
  },
});

export const GALADRIEL_G1_CONDITION_RULES = [CONDITION_RESOLVED_TIMES, CONDITION_CHOSE_RING_BEARER];
