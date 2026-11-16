/**
 * CasualAgent's answer to "gains protection from the color of your choice until end of turn" (`purpose` 'protectionColor', D-451, CR 702.16, 608.2d): the color
 * that hurts the opponents most. It reads only what the view shows (the stack and the battlefield are public):
 *   1. the colors of the spells and abilities on the stack that an opponent controls and that target one of the permanents about to gain the protection (the Bolt
 *      this spell was cast in response to): 100 for each;
 *   2. the colors of the permanents the opponents control, a creature counting more than another permanent (it can block or attack the protected one): 3 and 1.
 * The color with the most points wins, ties to the option listed first (W, U, B, R, G), so the answer is deterministic and uses no randomness. With nothing to count it
 * takes the first option.
 */
import type { Action, ChooseOptionDecision, GameView } from '@commander-arena/engine';

export function chooseProtectionColor(view: GameView, d: ChooseOptionDecision): Action {
  const protects = new Set(d.protects ?? []);
  const points = new Map<string, number>();
  const add = (colors: readonly string[], n: number): void => {
    for (const c of new Set(colors)) points.set(c, (points.get(c) ?? 0) + n);
  };
  for (const o of view.stack) {
    if (o.controller === view.viewer) continue;
    if (o.targets.some((t) => t.kind === 'object' && protects.has(t.id))) add(o.colors, 100);
  }
  for (const o of view.battlefield) {
    if (o.controller === view.viewer) continue;
    add(o.colors, o.types.includes('creature') ? 3 : 1);
  }
  let best: string | undefined;
  let bestPoints = -1;
  for (const option of d.options) {
    const n = points.get(option) ?? 0;
    if (n > bestPoints) {
      best = option;
      bestPoints = n;
    }
  }
  if (best === undefined) throw new Error('a choice with no options');
  return { kind: 'chooseOption', option: best };
}

/**
 * CasualAgent's answer to "gains protection from the card type of your choice until end of turn" (`purpose` 'protectionCardType', D-514, CR 702.16a, 608.2d): the card type
 * that hurts the opponents most, from what the view shows (the stack and the battlefield are public):
 *   1. the card types of the spells and abilities on the stack that an opponent controls and that target one of the permanents about to gain the protection: 100 for each type of the
 *      object (an ability has the types of its source, which the view lists as the stack object's types);
 *   2. the card types of the permanents the opponents control, a creature counting more than another kind (it can block the protected creature, which protection from creatures
 *      stops, CR 702.16f, or be blocked by it): 3 and 1. A land counts nothing: it does nothing to the creature.
 * The type with the most points wins, ties to the option listed first (the order of the card types), so the answer is deterministic and uses no randomness. With nothing to
 * count it takes `creature`, the type of the things that block and damage.
 */
export function chooseProtectionCardType(view: GameView, d: ChooseOptionDecision): Action {
  const protects = new Set(d.protects ?? []);
  const points = new Map<string, number>();
  const add = (types: readonly string[], n: number): void => {
    for (const t of new Set(types)) points.set(t, (points.get(t) ?? 0) + n);
  };
  for (const o of view.stack) {
    if (o.controller === view.viewer) continue;
    if (o.targets.some((t) => t.kind === 'object' && protects.has(t.id))) add(o.types, 100);
  }
  for (const o of view.battlefield) {
    if (o.controller === view.viewer) continue;
    add(
      o.types.filter((t) => t !== 'land'),
      o.types.includes('creature') ? 3 : 1,
    );
  }
  let best: string | undefined;
  let bestPoints = 0;
  for (const option of d.options) {
    const n = points.get(option) ?? 0;
    if (n > bestPoints) {
      best = option;
      bestPoints = n;
    }
  }
  const chosen = best ?? (d.options.includes('creature') ? 'creature' : d.options[0]);
  if (chosen === undefined) throw new Error('a choice with no options');
  return { kind: 'chooseOption', option: chosen };
}
