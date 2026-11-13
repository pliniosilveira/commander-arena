/**
 * CasualAgent's answer to "As this creature enters, choose a card type" (`purpose` 'cardType', D-376, CR 614.12a): the card type that protection from it
 * hurts the opponents most. It counts the types of the permanents the opponents control (the battlefield is public) and picks the type most of them
 * have, ties to the option listed first; a land is not counted (protection from lands stops almost nothing), so a creature land counts as a creature
 * only. With nothing to count it falls back on `creature`. Deterministic, no randomness; only what the view shows is read.
 */
import type { Action, ChooseOptionDecision, GameView } from '@commander-arena/engine';

export function chooseCardType(view: GameView, d: ChooseOptionDecision): Action {
  const counts = new Map<string, number>();
  for (const o of view.battlefield) {
    if (o.controller === view.viewer) continue;
    for (const type of new Set(o.types)) {
      if (type !== 'land') counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const option of d.options) {
    const n = counts.get(option) ?? 0;
    if (n > bestCount) {
      best = option;
      bestCount = n;
    }
  }
  const option = best ?? (d.options.includes('creature') ? 'creature' : d.options[0]);
  if (option === undefined) throw new Error('a choice with no options');
  return { kind: 'chooseOption', option };
}
