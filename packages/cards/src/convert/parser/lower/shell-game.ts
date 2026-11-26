/**
 * The lowering of `rules/effect/shell-game.ts` (Sadistic Shell Game): the engine's `chooseObjects` with `perPlayer` and the `destroy` of the creatures chosen.
 */
import type { IrClause } from '../ir/types';
import type { Effects } from './clauses';
import type { Lowering } from './types';

const CHOSEN = 'shellGame';

/** "Starting with the next opponent in turn order, each player chooses a creature you don't control. Destroy the chosen creatures." (CR 101.4, 608.2d, 701.8) */
const EACH_PLAYER_CHOOSES_DESTROY_CHOSEN: Lowering<IrClause, Effects> = {
  head: 'eachPlayerChoosesDestroyChosen',
  id: 'lower.each-player-chooses-destroy-chosen',
  needs: ['effect:chooseObjects', 'effect:destroy'],
  lower: (clause) => ({
    ok: true,
    value: [
      {
        kind: 'chooseObjects',
        id: CHOSEN,
        filter: { types: ['creature'], controller: 'opponent' },
        count: 1,
        exactly: true,
        perPlayer: true,
      },
      { kind: 'destroy', objects: { kind: 'chosen', id: CHOSEN } },
    ],
    rule: clause.rule,
  }),
};

export const SHELL_GAME_LOWERINGS: readonly Lowering<IrClause, Effects>[] = [
  EACH_PLAYER_CHOOSES_DESTROY_CHOSEN,
];
