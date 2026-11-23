import { createContext, type ReactNode, useContext } from 'react';
import type { Precons } from '../precons';

/** Without a provider no precon is installed: the menus say so and nothing can start from them. */
const NONE: Precons = {
  list: [],
  prepare: (id) =>
    Promise.resolve({ ok: false, info: null, reason: `There is no precon "${id}".` }),
  editorService: () => ({
    run: () => Promise.reject(new Error('No precon is installed.')),
  }),
};

const PreconsContext = createContext<Precons>(NONE);
const ChallengesContext = createContext<Precons>(NONE);

/** Provides the real precons (D-137): the list for the menus and `prepare` for starting one. */
export function PreconsProvider({
  precons,
  challenges = NONE,
  children,
}: {
  precons: Precons;
  /** The challenge opponents; none when left out. */
  challenges?: Precons;
  children: ReactNode;
}) {
  return (
    <PreconsContext.Provider value={precons}>
      <ChallengesContext.Provider value={challenges}>{children}</ChallengesContext.Provider>
    </PreconsContext.Provider>
  );
}

/** The challenge opponents of the Challenges block; empty until a challenge snapshot exists. */
export function useChallenges(): Precons {
  return useContext(ChallengesContext);
}

export function usePrecons(): Precons {
  return useContext(PreconsContext);
}
