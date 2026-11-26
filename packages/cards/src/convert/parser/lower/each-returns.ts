/**
 * Lowerings of "Each opponent returns a nonland permanent they control with the greatest mana value among permanents they control to its owner's hand, then discards a card."
 * (Discovery // Dispersal; CR 608.2d, 101.4, 701.9): the engine's `moveToZone` of a `choose` made by each player the subject names (`players`, with `greatest`), and the discard of
 * each of them (`lower/each-returns` is read by `rules/effect/each-returns.ts`).
 */
import type { ObjectFilter } from '@commander-arena/engine';
import type { IrClause } from '../ir/types';
import { arg, type Effects, failure, operand } from './clauses';
import { playerSelectorOf } from './nouns';
import type { Lowering } from './types';

const flagOf = (clause: IrClause, name: string): boolean | null => {
  const value = arg(clause, name);
  return value?.kind === 'flag' ? value.value : null;
};

/** "Each opponent returns a <permanent> they control ... to its owner's hand": each player chooses among their own, in APNAP order, and the permanents move together. */
export const EACH_RETURNS: Lowering<IrClause, Effects> = {
  head: 'eachReturns',
  id: 'lower.each-returns',
  needs: ['effect:moveToZone', 'selector:choose'],
  lower(clause, ctx) {
    const who = operand(clause, 'players');
    const nonland = flagOf(clause, 'nonland');
    const creature = flagOf(clause, 'creature');
    const greatest = flagOf(clause, 'greatest');
    if (who?.kind !== 'noun' || nonland === null || creature === null || greatest === null) {
      return failure(clause);
    }
    const players = playerSelectorOf(who, ctx);
    if (!players.ok) return players;
    const filter: ObjectFilter = {
      controller: 'you',
      ...(creature ? { types: ['creature'] } : {}),
      ...(nonland ? { notTypes: ['land'] } : {}),
    };
    return {
      ok: true,
      value: [
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter,
            players: players.value,
            ...(greatest ? { greatest: 'manaValue' as const } : {}),
          },
          to: 'hand',
        },
      ],
      rule: clause.rule,
    };
  },
};

/** "..., then discards a card": each of the players the sentence is about discards one card of their choice. */
export const EACH_DISCARDS_ONE: Lowering<IrClause, Effects> = {
  head: 'eachDiscardsOne',
  id: 'lower.each-discards-one',
  needs: ['effect:discard'],
  lower(clause, ctx) {
    const who = operand(clause, 'players');
    if (who?.kind !== 'noun') return failure(clause);
    const players = playerSelectorOf(who, ctx);
    if (!players.ok) return players;
    return {
      ok: true,
      value: [{ kind: 'discard', player: players.value, count: 1 }],
      rule: clause.rule,
    };
  },
};

export const EACH_RETURNS_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EACH_RETURNS,
  EACH_DISCARDS_ONE,
];
