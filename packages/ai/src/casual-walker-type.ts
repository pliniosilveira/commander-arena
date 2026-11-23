/**
 * CasualAgent's answer to "As this enchantment enters, choose a planeswalker type" (`purpose` 'planeswalkerType', CR 614.12a, 205.3j): the planeswalker type
 * that protects the most planeswalkers it controls (hexproof and the loyalty floor of such a card help only those of the chosen type). It counts the
 * planeswalkers it controls on the battlefield, then in the command zone and the hand (those it will play), and picks the type with the most, ties to the
 * option listed first; with none it falls back on the first option. Deterministic, no randomness; only what the view shows is read.
 */
import type { Action, ChooseOptionDecision, GameView, ObjectView } from '@commander-arena/engine';
import { ownCommandZone, ownHand } from './casual-view';

function count(objects: readonly ObjectView[], options: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const o of objects) {
    if (!o.types.includes('planeswalker')) continue;
    for (const type of new Set(o.subtypes)) {
      if (options.includes(type)) counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }
  return counts;
}

export function chooseWalkerType(view: GameView, d: ChooseOptionDecision): Action {
  const mine = view.battlefield.filter((o) => o.controller === view.viewer);
  for (const pool of [mine, [...ownCommandZone(view), ...ownHand(view)]]) {
    const counts = count(pool, d.options);
    let best: string | null = null;
    let bestCount = 0;
    for (const option of d.options) {
      const n = counts.get(option) ?? 0;
      if (n > bestCount) {
        best = option;
        bestCount = n;
      }
    }
    if (best !== null) return { kind: 'chooseOption', option: best };
  }
  const option = d.options[0];
  if (option === undefined) throw new Error('a choice with no options');
  return { kind: 'chooseOption', option };
}
