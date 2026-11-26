/**
 * The board print of the turn planner (issue 624, phase 3): a short string built from the agent's own view
 * only, so it never depends on a hidden card. A plan step records the print the agent's view showed just
 * before it on the sample; at the real decision the print of the real view is compared with it, and the step
 * is taken only when they are equal: nothing the plan relied on has changed.
 *
 * What goes in: the turn, the step, the active seat, whether the stack is empty, the agent's own hand (object
 * ids), every permanent on the battlefield (id, tapped, power and toughness, damage, counters, controller),
 * the combat (attackers, their targets, their blockers), and each seat's life, poison and commander damage.
 * The agent's own objects have the same ids on the sample and in the real game, because a sample only deals
 * again what the agent cannot see.
 */
import type { GameView } from '@commander-arena/engine';

export type BoardPrint = string;

const counterText = (counters: Readonly<Record<string, number>>): string =>
  Object.keys(counters)
    .sort()
    .map((k) => `${k}${counters[k]}`)
    .join('.');

export function boardPrint(view: GameView): BoardPrint {
  const me = view.seats.find((s) => s.id === view.viewer);
  const hand = (me?.hand ?? []).map((o) => o.id).sort();
  const field = view.battlefield
    .map(
      (o) =>
        `${o.id}:${o.controller}${o.tapped ? 't' : ''}:${o.power ?? '-'}/${o.toughness ?? '-'}:${o.damage}:${counterText(o.counters)}`,
    )
    .sort();
  const combat =
    view.combat === null
      ? '-'
      : view.combat.attackers
          .map(
            (a) => `${a.object}>${JSON.stringify(a.target)}<${[...a.blockedBy].sort().join('+')}`,
          )
          .sort()
          .join(',');
  const seats = view.seats.map((s) => `${s.id}:${s.life}:${s.poison}:${s.hasLost ? 'x' : ''}`);
  const damage = Object.keys(view.commanderDamage)
    .sort()
    .map((k) => `${k}=${view.commanderDamage[k]}`);
  return [
    `${view.turn}/${view.activeSeat}/${view.step}/${view.stack.length === 0 ? 'empty' : 'stack'}`,
    hand.join(','),
    field.join(','),
    combat,
    seats.join(','),
    damage.join(','),
  ].join('|');
}
