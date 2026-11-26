/**
 * The targets of another player's triggered ability that this agent chooses ("destroy target nonland permanent of that player's choice that one of your opponents controls", Bladegriff
 * Prototype, CR 603.3d, `TargetSpec.chosenBy`): the effect harms whatever is chosen, so the agent chooses what costs it least, the permanent with the lowest mana value (a token or a cheap
 * permanent, its own or another opponent's of the controller), the first one the engine lists when they tie.
 */
import type { ChosenTarget, GameView, TargetsDecision } from '@commander-arena/engine';
import { findObject, manaValueOf } from './casual-view';

/** The cost to the chooser of losing `target`: its mana value; a player or an object not in the view is worth nothing. */
function worth(view: GameView, target: ChosenTarget): number {
  if (target.kind !== 'object') return 0;
  const object = findObject(view, target.id);
  return object === undefined ? 0 : manaValueOf(object);
}

/** Fills each slot with its `min` least valuable legal targets (a slot that is asked for another player's ability takes no more than it must). */
export function chooseForController(view: GameView, d: TargetsDecision) {
  const targets: ChosenTarget[] = [];
  for (const spec of d.specs) {
    const ranked = spec.legal
      .map((t, index) => ({ t, index, cost: worth(view, t) }))
      .sort((a, b) => a.cost - b.cost || a.index - b.index);
    for (const r of ranked.slice(0, Math.min(spec.min, spec.max, ranked.length))) {
      targets.push(r.t);
    }
  }
  return { kind: 'chooseTargets' as const, targets };
}
