/**
 * Lowering of "Each player chooses two nontoken, non-Vehicle creatures they control. Exile them until ~ leaves the battlefield." (Foreboding Steamboat; CR 608.2d, 101.4, 610.3, 607.2a): the
 * engine's `moveToZone` of a `choose` made by each player (`players`), exiled until the permanent of the ability leaves the battlefield (`until`); the face's linking (`parse-face.ts`) marks it `linked`
 * when its other ability reads "a card exiled with it". Read by `rules/effect/each-player-chooses-exile.ts`.
 */
import type { IrClause } from '../ir/types';
import { type Effects, failure, operand } from './clauses';
import { lowerFilter, playerSelectorOf } from './nouns';
import type { Lowering } from './types';

export const EACH_PLAYER_CHOOSES_EXILE_UNTIL: Lowering<IrClause, Effects> = {
  head: 'eachPlayerChoosesExileUntil',
  id: 'lower.each-player-chooses-exile-until',
  needs: ['effect:moveToZone', 'selector:choose'],
  lower(clause, ctx) {
    const who = operand(clause, 'players');
    const what = operand(clause, 'creatures');
    // CR 610.3: only an ability of a permanent can last until that permanent leaves the battlefield.
    if (who?.kind !== 'noun' || what?.kind !== 'noun' || ctx.owner !== 'ability') {
      return failure(clause);
    }
    const count = what.count?.kind === 'number' ? what.count.value : null;
    if (count === null) return failure(clause);
    const players = playerSelectorOf(who, ctx);
    if (!players.ok) return players;
    const filter = lowerFilter(what);
    if (!filter.ok) return filter;
    return {
      ok: true,
      value: [
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            filter: { ...filter.value, controller: 'you' },
            players: players.value,
            count,
          },
          to: 'exile',
          until: 'sourceLeaves',
        },
      ],
      rule: clause.rule,
    };
  },
};

export const EACH_PLAYER_CHOOSES_EXILE_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EACH_PLAYER_CHOOSES_EXILE_UNTIL,
];
