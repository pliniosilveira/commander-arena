/**
 * The opponent of the web game (D-164): which agent a `NewGameOptions.ai` names. `HeuristicAgent` is
 * what the player gets (it has one level, D-168); `CasualAgent` stays for the tests and `?ai=casual`.
 * Framework-free and clock-free: the agent reads time only through the `DecideContext` the host passes.
 */
import { type Agent, CasualAgent, HeuristicAgent } from '@commander-arena/ai';
import type { AiKind } from './protocol';

/** The agent for `kind`, seeded with `seed` (its own PRNG; the game's is never shared). */
export function createAgent(seed: number, kind: AiKind): Agent {
  if (kind === 'casual') return new CasualAgent({ seed });
  return new HeuristicAgent({ seed });
}
