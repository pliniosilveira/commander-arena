/**
 * Which block pairs the pointer or keyboard focus is on (owner playtest): hovering or focusing a
 * blocker or an attacker lights up its counterparts, so the player sees who blocks whom without
 * reading names. Tiles read the set and draw `is-pair-hot`; the board provides it.
 */
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

export interface PairFocus {
  /** Pair numbers (`resolve.ts` `combatRoles`) under the pointer or the keyboard focus. */
  readonly focus: ReadonlySet<number>;
  setFocus(numbers: readonly number[]): void;
}

const NONE: ReadonlySet<number> = new Set();

const PairFocusContext = createContext<PairFocus>({ focus: NONE, setFocus: () => {} });

export function PairFocusProvider({ children }: { children: ReactNode }) {
  const [focus, set] = useState<ReadonlySet<number>>(NONE);
  const setFocus = useCallback((numbers: readonly number[]) => {
    set((prev) => {
      if (prev.size === numbers.length && numbers.every((n) => prev.has(n))) return prev;
      return numbers.length === 0 ? NONE : new Set(numbers);
    });
  }, []);
  const value = useMemo(() => ({ focus, setFocus }), [focus, setFocus]);
  return <PairFocusContext.Provider value={value}>{children}</PairFocusContext.Provider>;
}

export function usePairFocus(): PairFocus {
  return useContext(PairFocusContext);
}
