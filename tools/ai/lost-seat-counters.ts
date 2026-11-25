// What the view of a decision shows about a player who has left the game (CR 800.4a): shared by the
// N-seat probe (`multiplayer-probe.ts`) and the 3 and 4 seat soak (`table-soak.test.ts`, issue 585).
// An agent wrapper counts decisions, not games; the wrapper plays exactly like the agent inside it.
import type { Agent, AgentFactory } from '@commander-arena/ai';

export interface LostSeatCounters {
  /** Decisions whose view shows a permanent under a seat that has left. */
  permanentsOfLostPlayer: number;
  /** Decisions whose view has a seat that has left as the active seat (CR 800.4j: a known limit). */
  activeSeatLost: number;
  /** Decisions asked of a seat that has left. */
  lostSeatAsked: number;
  /** Decisions whose view shows a stack object controlled by a seat that has left. */
  stackOfLostPlayer: number;
}

export const newLostSeatCounters = (): LostSeatCounters => ({
  permanentsOfLostPlayer: 0,
  activeSeatLost: 0,
  lostSeatAsked: 0,
  stackOfLostPlayer: 0,
});

/** Counts what the view of each decision shows about players who have lost; plays like the inner agent. */
export function watchLostSeats(inner: Agent, counters: LostSeatCounters): Agent {
  const wrapper: Agent = {
    get name() {
      return inner.name;
    },
    async decide(view, decision, ctx) {
      const lost = new Set(view.seats.filter((s) => s.hasLost).map((s) => s.id));
      if (lost.size > 0) {
        if (view.battlefield.some((o) => lost.has(o.controller))) {
          counters.permanentsOfLostPlayer += 1;
        }
        if (lost.has(view.activeSeat)) counters.activeSeatLost += 1;
        if (lost.has(view.viewer)) counters.lostSeatAsked += 1;
        if (view.stack.some((o) => lost.has(o.controller))) counters.stackOfLostPlayer += 1;
      }
      return inner.decide(view, decision, ctx);
    },
  };
  if (inner.fallbacks !== undefined) {
    Object.defineProperty(wrapper, 'fallbacks', { get: () => inner.fallbacks });
  }
  return wrapper;
}

/** The same factory, its agents watched. */
export const watchedFactory = (
  factory: AgentFactory,
  counters: LostSeatCounters,
): AgentFactory => ({
  label: factory.label,
  create: (seed) => watchLostSeats(factory.create(seed), counters),
});
