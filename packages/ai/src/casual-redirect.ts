/**
 * CasualAgent and the change of a target (D-181, CR 115.7a): the new target the agent chooses when its "change the target of target spell or ability
 * with a single target" resolves. The engine lists the legal targets other than the current one, so any answer is legal; the choice is which side
 * takes the effect. A harmful spell or ability goes to a thing of the opponent's (the ordinary order of the agent's targets: the opponent first, its
 * best creature before its other permanents), and a helpful one (a pump, a keyword gain) to one of the agent's own, whoever cast it.
 */
import type { Action, ChosenTarget, GameView, TargetsDecision } from '@commander-arena/engine';
import { isHelpfulSpell } from './casual-helpful';
import { findObject } from './casual-view';

/** The player who has the target: the player itself, or the controller of the permanent. */
function sideOf(view: GameView, target: ChosenTarget): number | undefined {
  return target.kind === 'player' ? target.seat : findObject(view, target.id)?.controller;
}

/**
 * The answer to the question of a change of target, or null when the decision is not one (or the ordinary choice of targets is the answer: a
 * harmful spell).
 */
export function chooseNewTarget(view: GameView, d: TargetsDecision): Action | null {
  if (d.forChange !== true) return null;
  const subject = d.subject === undefined ? undefined : findObject(view, d.subject);
  if (subject === undefined || !isHelpfulSpell(subject)) return null;
  const [slot] = d.specs;
  const own = slot?.legal.find((t) => sideOf(view, t) === view.viewer);
  return own === undefined ? null : { kind: 'chooseTargets', targets: [own] };
}
