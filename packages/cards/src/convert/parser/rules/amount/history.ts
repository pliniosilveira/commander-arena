import { type Parser, pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

/** Counts use event-time characteristics, not objects currently on the battlefield or in a graveyard. */
export const HISTORY_VALUE: Parser<IrAmount> = (ctx, pos) => {
  const gain = pattern(/the amount of life you gained this turn(?![\p{L}\p{N}])/iu)(ctx, pos);
  if (gain.ok) {
    return {
      ok: true,
      value: { kind: 'lifeGainedThisTurn', span: { start: pos, end: gain.pos } },
      pos: gain.pos,
    };
  }
  // D-625 (Prismari deck group 1, CR 601.2i): the spells the controller has cast this turn.
  const spells = pattern(
    /the number of (instant and sorcery )?spells you(?:['’]ve| have) cast this turn(?![\p{L}\p{N}])/iu,
  )(ctx, pos);
  if (spells.ok) {
    return {
      ok: true,
      value: {
        kind: 'spellsCastThisTurn',
        ...(spells.value[1] === undefined ? {} : { ofTypes: ['instant', 'sorcery'] }),
        span: { start: pos, end: spells.pos },
      },
      pos: spells.pos,
    };
  }
  // D-633 (Prismari deck group 2, CR 202.3, 601.2i): the greatest mana value among the spells the controller has cast this turn.
  const greatest = pattern(
    /the greatest mana value among (instant and sorcery )?spells you(?:['’]ve| have) cast this turn(?![\p{L}\p{N}])/iu,
  )(ctx, pos);
  if (greatest.ok) {
    return {
      ok: true,
      value: {
        kind: 'greatestManaValueCast',
        ...(greatest.value[1] === undefined ? {} : { ofTypes: ['instant', 'sorcery'] }),
        span: { start: pos, end: greatest.pos },
      },
      pos: greatest.pos,
    };
  }
  const entries = pattern(
    /the number of (nontoken |token )?(creatures|permanents) you had enter the battlefield under your control this turn(?![\p{L}\p{N}])/iu,
  )(ctx, pos);
  if (!entries.ok) return entries;
  return {
    ok: true,
    value: {
      kind: 'enteredThisTurn',
      controller: 'you',
      ...(entries.value[2]?.toLowerCase() === 'creatures' ? { types: ['creature'] } : {}),
      ...(entries.value[1] === undefined
        ? {}
        : { token: entries.value[1].toLowerCase() === 'token ' }),
      span: { start: pos, end: entries.pos },
    },
    pos: entries.pos,
  };
};

export const AMOUNT_FOR_EACH_DIED = defineRule<IrAmount>({
  id: 'amount.for-each-died',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 700.4 (General)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: ['for each creature that died under your control this turn'],
  rejects: [
    'for each creature that died this turn',
    'for each creature that died under your control last turn',
    'for each creature that died under an opponent’s control this turn',
    'for each creature card that died under your control this turn',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/for each creature that died under your control this turn(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'diedThisTurn',
        controller: 'you',
        types: ['creature'],
        span: { start: pos, end: r.pos },
      },
      pos: r.pos,
    };
  },
});
