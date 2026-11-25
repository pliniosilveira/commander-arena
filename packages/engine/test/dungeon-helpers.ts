// Shared by the initiative and Undercity scenario tests: answers every question of a resolving venture until the stack is empty.
import type { ScenarioGame } from '../src/testing/index';

const BEARS = 'Grizzly Bears';

export interface Policy {
  /** The names of the rooms to choose, in the order the questions come; the first room offered when it runs out. */
  readonly rooms?: string[];
  /** The player or card to target, in the order the questions come; the first legal target when it runs out. */
  readonly targets?: ({ player: number } | string)[];
}

/** Answers every question until the stack is empty and a player has priority. Returns the seats asked for a room, in order. */
export function settle(g: ScenarioGame, policy: Policy = {}): number[] {
  const rooms = [...(policy.rooms ?? [])];
  const targets = [...(policy.targets ?? [])];
  const asked: number[] = [];
  for (let i = 0; i < 60; i += 1) {
    const d = g.state.pending;
    if (d?.kind === 'chooseOption' && d.purpose === 'dungeonRoom') {
      asked.push(d.seat);
      g.act(d.seat).chooseOption(rooms.shift() ?? d.options[0] ?? '');
    } else if (d?.kind === 'chooseCards') {
      g.act(d.seat).choose({ kind: 'chooseCards', objects: d.legal.slice(0, Math.max(d.min, 1)) });
    } else if (d?.kind === 'arrangeCards') {
      g.act(d.seat).choose({ kind: 'arrangeCards', top: d.cards, other: [] });
    } else if (d?.kind === 'targets') {
      const next = targets.shift();
      if (next !== undefined) g.act(d.seat).chooseTargets(next);
      else {
        const first = d.specs[0]?.legal[0];
        if (first === undefined) throw new Error('no legal target');
        g.act(d.seat).chooseTargets(
          first.kind === 'player' ? { player: first.seat } : { name: BEARS, zone: 'battlefield' },
        );
      }
    } else if (d?.kind === 'orderTriggers') {
      g.act(d.seat).orderTriggers(...d.triggers.map((_, n) => n));
    } else if (g.state.stack.length === 0 && d?.kind === 'priority') {
      return asked;
    } else {
      g.pass();
    }
  }
  throw new Error('the stack did not settle');
}
