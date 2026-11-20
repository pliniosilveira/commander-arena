/**
 * CasualAgent's answer to "Remove any number of counters from among permanents" and "Move a counter ..." (`purpose` 'counterPick', CR 122.1, 122.5, 608.2d): the counter to take
 * next, or "Done". It reads only what the view shows (counters are public):
 *   - a counter that hurts its permanent (a -1/-1, a stun counter) on the agent's own permanent is worth taking; so is a counter that helps an opponent's permanent (a +1/+1, a loyalty
 *     counter, the keyword counters and any other kind);
 *   - a helpful counter on its own permanent, or a harmful one on an opponent's, is left alone.
 * It takes the first counter that is worth taking, then stops when none is left. A move (no way to stop) takes the first counter listed that scores best. No randomness.
 */
import type { Action, ChooseOptionDecision, GameView } from '@commander-arena/engine';

const HARMFUL = new Set(['-1/-1', 'stun']);

export function chooseCounterPick(view: GameView, d: ChooseOptionDecision): Action {
  const picks = d.counterPicks ?? [];
  const canStop = d.options.length > picks.length;
  let best = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  picks.forEach((pick, i) => {
    const owner = view.battlefield.find((o) => o.id === pick.object)?.controller;
    const mine = owner === view.viewer;
    const score = mine === HARMFUL.has(pick.counter) ? 1 : -1;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  if (best < 0 || (canStop && bestScore <= 0)) {
    const fallback = canStop ? d.options[picks.length] : d.options[0];
    if (fallback === undefined) throw new Error('a choice with no options');
    return { kind: 'chooseOption', option: fallback };
  }
  const option = d.options[best];
  if (option === undefined) throw new Error('a choice with no options');
  return { kind: 'chooseOption', option };
}
