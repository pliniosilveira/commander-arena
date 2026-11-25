/**
 * The memory of the art lookups: a successful answer and a definitive "no such card" are kept for the session, a failure that says
 * nothing about the card (offline, rate limited, a server error) is asked again after a wait. Remembering such a failure for good
 * left a token, a printing or an emblem without its picture until the page was reloaded.
 */
import type { QueueOutcome } from '@commander-arena/cards';

/** How long a failed lookup is believed before it is asked again. */
export const RETRY_AFTER_MS = 30_000;

/** How long a picture that failed again is believed before the next try: 30 s, 1 min, 2 min, then 4 min, so a longer rate limit is waited out. */
export function retryDelayMs(attempt: number): number {
  return RETRY_AFTER_MS * 2 ** Math.min(attempt, 3);
}

export interface LookupOutcome<T> {
  readonly value: T | null;
  /** The answer says nothing about the card: ask again later. */
  readonly transient: boolean;
}

/** What a queue answer means: a 2xx is parsed, any other answer (404, 400) is a definitive miss, a failure is not an answer. */
export function outcomeOf<T>(
  answer: QueueOutcome,
  parse: (json: unknown) => T | null,
): LookupOutcome<T> {
  if (answer.kind === 'failure') return { value: null, transient: true };
  return { value: answer.ok ? parse(answer.json) : null, transient: false };
}

export function createLookupCache<T>(now: () => number = () => performance.now()) {
  const entries = new Map<string, { promise: Promise<T | null>; retryAt: number | null }>();
  return (key: string, run: () => Promise<LookupOutcome<T>>): Promise<T | null> => {
    const known = entries.get(key);
    // In flight or settled for good: share it. A failure whose wait is over is asked again.
    if (known !== undefined && (known.retryAt === null || now() < known.retryAt)) {
      return known.promise;
    }
    const entry: { promise: Promise<T | null>; retryAt: number | null } = {
      promise: Promise.resolve(null),
      retryAt: null,
    };
    entry.promise = run().then(
      (outcome) => {
        entry.retryAt = outcome.transient ? now() + RETRY_AFTER_MS : null;
        return outcome.value;
      },
      () => {
        entry.retryAt = now() + RETRY_AFTER_MS;
        return null;
      },
    );
    entries.set(key, entry);
    return entry.promise;
  };
}

/** The pictures that failed to load and when to try them again. */
export function createFailureMemory(now: () => number = () => performance.now()) {
  const until = new Map<string, number>();
  return {
    mark(key: string): void {
      until.set(key, now() + RETRY_AFTER_MS);
    },
    has(key: string): boolean {
      const retryAt = until.get(key);
      if (retryAt === undefined) return false;
      if (now() < retryAt) return true;
      until.delete(key);
      return false;
    },
    clear(key: string): void {
      until.delete(key);
    },
  };
}
