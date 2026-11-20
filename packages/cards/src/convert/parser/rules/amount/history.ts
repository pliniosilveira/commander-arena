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
  // D-638 (Prismari deck group 1, CR 601.2i): the spells the controller has cast this turn.
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
  // D-646 (Prismari deck group 2, CR 202.3, 601.2i): the greatest mana value among the spells the controller has cast this turn.
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
  // Grave Danger (issue 159, Liliana's Standard Bearer): "where X is the number of creatures that died under your control this turn".
  const died = pattern(
    /the number of creatures that died under your control this turn(?![\p{L}\p{N}])/iu,
  )(ctx, pos);
  if (died.ok) {
    return {
      ok: true,
      value: {
        kind: 'diedThisTurn',
        controller: 'you',
        types: ['creature'],
        span: { start: pos, end: died.pos },
      },
      pos: died.pos,
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
  examples: [
    'for each creature that died under your control this turn',
    'for each nontoken creature that died this turn',
  ],
  rejects: [
    'for each creature that died this turn',
    'for each token creature that died this turn',
    'for each nontoken creature that died last turn',
    'for each creature that died under your control last turn',
    'for each creature that died under an opponent’s control this turn',
    'for each creature card that died under your control this turn',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/for each creature that died under your control this turn(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (r.ok) {
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
    }
    // CR 700.4: "for each nontoken creature that died this turn" counts the creatures that died under any player's control; a token that died is not counted.
    const any = pattern(/for each nontoken creature that died this turn(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (!any.ok) return any;
    return {
      ok: true,
      value: {
        kind: 'diedThisTurn',
        controller: 'any',
        types: ['creature'],
        token: false,
        span: { start: pos, end: any.pos },
      },
      pos: any.pos,
    };
  },
});

/**
 * `amount.for-each-other-spell-cast`: "for each other instant and sorcery spell you've cast this turn" (Lock and Load, CR 601.2i, 608.2h): the spells the controller has cast so far this turn
 * of those types, counted as the effect resolves, not counting the spell that is resolving. Not read: spells of another type or of all types, another player's spells, "last turn".
 */
export const AMOUNT_FOR_EACH_OTHER_SPELL_CAST = defineRule<IrAmount>({
  id: 'amount.for-each-other-spell-cast',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 601.2i (Casting Spells)', 'CR 608.2h (Resolving Spells and Abilities)'],
  examples: [
    "for each other instant and sorcery spell you've cast this turn",
    'for each other instant and sorcery spell you have cast this turn',
    'for each other instant and sorcery spell you’ve cast this turn',
  ],
  rejects: [
    "for each instant and sorcery spell you've cast this turn",
    "for each other spell you've cast this turn",
    "for each other instant and sorcery spell you've cast",
    'for each other instant and sorcery spell an opponent has cast this turn',
    "for each other instant and sorcery spell you've cast last turn",
    "for each other creature spell you've cast this turn",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /for each other instant and sorcery spell you(?:['’]ve| have) cast this turn(?![\p{L}\p{N}])/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'spellsCastThisTurn',
        ofTypes: ['instant', 'sorcery'],
        otherThanThis: true,
        span: { start: pos, end: r.pos },
      },
      pos: r.pos,
    };
  },
});
