/**
 * "The first activated ability of an artifact you activate each turn costs {2} less to activate." (Tezzeret, Betrayer of Flesh, issue 128; CR 602.2b, 605.1a): the log of the activations of
 * artifacts, `TurnLog.artifactActivated`, which `rules/activate-adjust.ts` reads and the activation of an ability (`rules/activate.ts`) and of a mana ability (`rules/mana-abilities.ts`) write.
 */
import type { SeatId } from '../ids';
import type { GameObject, GameState } from '../state/types';
import { copiableValues } from './copiable';
import { derive } from './derive';
import { abilityReductionSources } from './derive-statics';

/**
 * Whether some permanent has "the first activated ability of an artifact you activate each turn costs {2} less" (Tezzeret, issue 128): only then are the activations of artifacts
 * logged (`TurnLog.artifactActivated`).
 */
export function tracksArtifactActivations(state: GameState): boolean {
  // False without looking at any layer when no permanent's copiable abilities hold the reduction (the usual game): the check runs on every activation, a mana ability included.
  const mayHave = state.battlefield.some((id) => {
    const obj = state.objects[id];
    return (
      obj !== undefined &&
      copiableValues(state, obj).abilities.some(
        (a) =>
          a.kind === 'static' &&
          a.static.kind === 'abilityCostReduction' &&
          a.static.abilities === 'ofObjects' &&
          a.static.firstOfArtifactEachTurn === true,
      )
    );
  });
  return mayHave && abilityReductionSources(state).some((s) => s.firstOfArtifactEachTurn === true);
}

/** The log with this activation of an ability of `source` by `seat` added, when it is of an artifact and something reads the log (`tracksArtifactActivations`). */
export function withArtifactActivation(
  state: GameState,
  seat: SeatId,
  source: GameObject | undefined,
): GameState {
  if (source === undefined || !tracksArtifactActivations(state)) return state;
  if (!derive(state, source).types.includes('artifact')) return state;
  return {
    ...state,
    turnLog: {
      ...state.turnLog,
      artifactActivated: [...(state.turnLog.artifactActivated ?? []), seat],
    },
  };
}
