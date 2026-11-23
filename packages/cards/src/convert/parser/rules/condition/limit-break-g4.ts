/**
 * Condition rules of group 4 of the Limit Break deck (issue 96): "~'s power is 7 or greater" (Vincent, Vengeful Atoner).
 */
import { fail, pattern } from '../../combinators';
import type { IrCondition } from '../../ir/types';
import { defineRule } from '../registry';

const END = "(?![\\p{L}\\p{N}'’])";

/**
 * `condition.this-power`: "~'s power is 7 or greater", "~'s power is 3 or less" (CR 208.1, 613.4: the power the permanent with the ability has as the ability is read, after the layers
 * have been applied; CR 608.2c: read as the instruction comes up). The engine's `thisMatches` with a power comparison. The number is written in digits. Not read: the toughness, "it", another
 * permanent, a word for the number, a power with no comparison ("~'s power is 7"), "greater than" (the other rules of a comparison).
 */
export const CONDITION_THIS_POWER = defineRule<IrCondition>({
  id: 'condition.this-power',
  family: 'condition',
  leading: ["~'s", '~’s'],
  cites: [
    'CR 208.1 (Power/Toughness)',
    'CR 613.4 (Interaction of Continuous Effects)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ["~'s power is 7 or greater", "~'s power is 3 or less", '~’s power is 10 or greater'],
  rejects: [
    "~'s power is 7",
    "~'s toughness is 7 or greater",
    "it's power is 7 or greater",
    "~'s power is seven or greater",
    "~'s power is 7 or greater and",
    "~'s power was 7 or greater",
    "~'s power is greater than 7",
    "another creature's power is 7 or greater",
    "~'s power is 7 or more",
  ],
  parse: (ctx, pos) => {
    const r = pattern(new RegExp(`~['’]s power is (\\d+) or (greater|less)${END}`, 'iu'))(ctx, pos);
    if (!r.ok) return r;
    const value = Number(r.value[1]);
    if (!Number.isSafeInteger(value)) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: {
          kind: 'thisMatches',
          filter: {
            power: {
              cmp: (r.value[2] ?? '').toLowerCase() === 'less' ? 'atMost' : 'atLeast',
              value,
            },
            raw: r.value[0],
          },
          who: 'self',
        },
        span: { start: pos, end: r.pos },
        rule: 'condition.this-power',
      },
      pos: r.pos,
    };
  },
});

/**
 * `condition.first-combat-phase`: "it's the first combat phase of your turn" (CR 506.1, 500.8: the first combat phase of a turn to begin, so an additional combat phase is the second; Tifa,
 * Martial Artist). The engine's `yourCombatPhase` with `first`, read as the instruction runs. Not read: another phase or ordinal ("second"), another turn ("of each turn", "of the turn"),
 * "it's not", "it's your first combat phase" (the turn is said), a step.
 */
export const CONDITION_FIRST_COMBAT_PHASE = defineRule<IrCondition>({
  id: 'condition.first-combat-phase',
  family: 'condition',
  leading: ["it's", 'it’s', 'it'],
  cites: ['CR 506.1 (Combat Phase)', 'CR 500.8 (Extra Turns)'],
  examples: [
    "it's the first combat phase of your turn",
    'it’s the first combat phase of your turn',
    'it is the first combat phase of your turn',
  ],
  rejects: [
    "it's the first combat phase of your turn.",
    "it's the second combat phase of your turn",
    "it's the first combat phase of the turn",
    "it's the first combat phase of each turn",
    "it's not the first combat phase of your turn",
    "it's the first main phase of your turn",
    "it's your first combat phase",
    "it's the first combat phase of your turn and",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(`it(?:['’]s| is) the first combat phase of your turn${END}`, 'iu'),
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'condition',
        test: { kind: 'yourCombatPhase', first: true },
        span: { start: pos, end: r.pos },
        rule: 'condition.first-combat-phase',
      },
      pos: r.pos,
    };
  },
});

export const LIMIT_BREAK_G4_CONDITION_RULES = [CONDITION_THIS_POWER, CONDITION_FIRST_COMBAT_PHASE];
