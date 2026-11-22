/**
 * Effect rules of the Abzan Armor precon, group C (spells with choices): "Choose a number between 0 and 10." (Expel the Interlopers, CR 608.2d).
 */
import { fail, pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

/**
 * `effect.choose-a-number`: "choose a number between 0 and 10" (CR 608.2d: the controller of the spell chooses as it resolves; CR 107.1: a whole number, the least and the most
 * included). The engine's `chooseNumber`; the number is what "the chosen number" of the sentences after it means. Not read: another range wording ("from 1 to 10", "any number"),
 * "a number greater than ...", a choice by another player, a range that runs backwards, more words after it.
 */
export const EFFECT_CHOOSE_A_NUMBER = defineRule<Clauses>({
  id: 'effect.choose-a-number',
  family: 'effect',
  leading: ['choose'],
  cites: ['CR 608.2d (Resolving Spells and Abilities)', 'CR 107.1 (Numbers)'],
  examples: ['choose a number between 0 and 10', 'choose a number between 1 and 5'],
  rejects: [
    'choose a number from 1 to 10',
    'choose a number',
    'choose a number between 10 and 0',
    'choose a number between 0 and 10 at random',
    'choose a number between 0 and ten',
    'choose two numbers between 0 and 10',
    'chooses a number between 0 and 10',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/choose a number between (\d{1,3}) and (\d{1,3})(?![\p{L}\p{N}])/iu))(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    const [, least, most] = r.value.value;
    if (least === undefined || most === undefined) return fail(ctx, pos);
    const min = Number(least);
    const max = Number(most);
    if (min > max) return fail(ctx, pos);
    const amount = (value: number): IrAmount => ({ kind: 'number', value, span: r.value.span });
    return {
      ok: true,
      value: [
        makeClause(
          'effect.choose-a-number',
          'chooseNumber',
          { min: amount(min), max: amount(max) },
          r.value.span,
        ),
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.each-player-keeps-creatures-and-sacrifices-the-rest`: "each player chooses any number of creatures they control with total power 4 or less, then sacrifices all other creatures
 * they control" (Slaughter the Strong, CR 608.2d, 701.21a, 101.4, 208.1): the engine's `keepOrSacrifice` of every player. The choices are made in APNAP order, each knowing the earlier ones,
 * and the sacrifice is made together after the last (the engine does both). Not read: another kind of permanent, a player other than "each player", another limit than a whole number
 * of power, "total toughness", "or greater", "at random", more words after it.
 */
export const EFFECT_EACH_PLAYER_KEEPS_AND_SACRIFICES = defineRule<Clauses>({
  id: 'effect.each-player-keeps-creatures-and-sacrifices-the-rest',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 701.21a (Sacrifice)',
    'CR 101.4 (Strict Timing Order)',
    'CR 208.1 (Power/Toughness)',
  ],
  examples: [
    'each player chooses any number of creatures they control with total power 4 or less, then sacrifices all other creatures they control',
    'each player chooses any number of creatures they control with total power 10 or less, then sacrifices all other creatures they control',
  ],
  rejects: [
    'each player chooses any number of creatures they control with total toughness 4 or less, then sacrifices all other creatures they control',
    'each player chooses any number of creatures they control with total power 4 or greater, then sacrifices all other creatures they control',
    'each player chooses any number of artifacts they control with total power 4 or less, then sacrifices all other artifacts they control',
    'each opponent chooses any number of creatures they control with total power 4 or less, then sacrifices all other creatures they control',
    'each player chooses any number of creatures they control with total power 4 or less, then sacrifices all other creatures they control and draws a card',
    'each player chooses any number of creatures they control, then sacrifices all other creatures they control',
    'each player chooses any number of creatures they control with total power 4 or less, then discards all other creatures they control',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        /each player chooses any number of creatures they control with total power (\d{1,3}) or less, then sacrifices all other creatures they control(?![\p{L}\p{N}]| and )/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, limit] = r.value.value;
    if (limit === undefined) return fail(ctx, pos);
    return {
      ok: true,
      value: [
        makeClause(
          'effect.each-player-keeps-creatures-and-sacrifices-the-rest',
          'keepOrSacrifice',
          { limit: { kind: 'number', value: Number(limit), span: r.value.span } },
          r.value.span,
        ),
      ],
      pos: r.pos,
    };
  },
});

export const ABZAN_SPELLS_EFFECT_RULES = [
  EFFECT_CHOOSE_A_NUMBER,
  EFFECT_EACH_PLAYER_KEEPS_AND_SACRIFICES,
];
