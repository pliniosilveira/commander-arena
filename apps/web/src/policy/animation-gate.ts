/**
 * The animation gate (issue 9, D-228): the one place where the page's autopilot may wait for a
 * picture. The combat effects (`ui/board/CombatEffects.tsx`) `hold` it for as long as the effects of
 * a snapshot play; the autopilot of the store `wait`s on it before each automatic pass it sends for
 * the human, so the next step of the game does not start while a hit or a death is still on screen.
 *
 * It is small on purpose, and never a way to block anything:
 * - A wait ends when the hold ends, and a hold is never longer than `MAX_WAIT_MS`, whatever the
 *   effects need (the effects then finish while the game goes on).
 * - Only the autopilot's automatic passes wait. A decision of the human, the engine, the Worker and
 *   the AI's own search never look at the gate.
 * - `release` ends every wait at once (the player clicked, took something back, left the game).
 * - A page with the effects off, under `prefers-reduced-motion`, or in a hidden tab never holds it.
 */

/** The longest the autopilot waits for the effects of one snapshot, in milliseconds. */
export const MAX_WAIT_MS = 2500;

export interface AnimationGate {
  /** The effects of a snapshot will play for `ms` milliseconds from now. */
  hold(ms: number): void;
  /** Resolves when the effects held have played (at most `MAX_WAIT_MS`), or at once when none are. */
  wait(): Promise<void>;
  /** Ends the hold and every wait now. */
  release(): void;
}

export interface GateClock {
  readonly now: () => number;
  readonly setTimer: (run: () => void, ms: number) => unknown;
  readonly clearTimer: (timer: unknown) => void;
}

const realClock: GateClock = {
  now: () => performance.now(),
  setTimer: (run, ms) => setTimeout(run, ms),
  clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

export function createAnimationGate(
  clock: GateClock = realClock,
  maxWaitMs: number = MAX_WAIT_MS,
): AnimationGate {
  let until = 0;
  const waiting = new Set<{ readonly done: () => void }>();
  return {
    hold(ms) {
      if (!(ms > 0)) return;
      until = Math.max(until, clock.now() + Math.min(ms, maxWaitMs));
    },
    wait() {
      const remaining = until - clock.now();
      if (remaining <= 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const entry = {
          done: () => {
            clock.clearTimer(timer);
            waiting.delete(entry);
            resolve();
          },
        };
        const timer = clock.setTimer(entry.done, remaining);
        waiting.add(entry);
      });
    },
    release() {
      until = 0;
      for (const entry of [...waiting]) entry.done();
    },
  };
}

/** The gate of the running page: the effects hold it, the store's autopilot waits on it. */
export const animationGate: AnimationGate = createAnimationGate();
