/**
 * The creation of the tokens of one effect as it resolves (CR 111.2, 614.1a, 616.1; D-221): the replacement effects of the creation are settled for all the
 * tokens the effect creates at once, with the answers of their creator to the question of the order (`token-replacement.ts`), and then the tokens are made.
 * A token that asks a question as it enters (`enter-token.ts`) is made by an instruction of its own, with its event already settled; the others are made
 * at once. The question comes back with nothing changed, and the instruction runs again with the answer (`ResolutionContext.damageAnswers`).
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import type { OrderFlow } from './damage-order';
import { enterTokenInstructions, tokenAsks } from './enter-token';
import { settleTokens, type TokenBatch, type TokensAsked } from './token-replacement';
import { makeTokens } from './tokens';

export interface MadeTokens {
  readonly kind: 'made';
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  /** The instructions that still create the tokens that ask a question. */
  readonly front: readonly Instruction[];
  /** The tokens made now. */
  readonly created: readonly ObjectId[];
}

/** Settles and makes `parts` for `seat`; `tapped` is what the instruction says about the tokens it describes ("create a tapped Treasure token"). */
export function makeSettled(
  state: GameState,
  res: ResolutionContext,
  seat: SeatId,
  parts: readonly TokenBatch[],
  tapped: boolean,
  flow: OrderFlow,
): MadeTokens | TokensAsked {
  const settled = settleTokens(state, seat, res.source, parts, flow);
  if (settled.kind === 'asked') return settled;
  let next = state;
  const events: GameEvent[] = [];
  const front: Instruction[] = [];
  for (const part of settled.parts) {
    const partTapped = part.original && tapped;
    if (tokenAsks(next, seat, part.definition)) {
      front.push(...enterTokenInstructions(seat, part.definition, part.count, partTapped, true));
      continue;
    }
    const r = makeTokens(next, seat, part.definition, part.count, undefined, partTapped);
    next = r.state;
    events.push(...r.events);
  }
  const created = events.flatMap((e) => (e.kind === 'tokenCreated' ? [e.object] : []));
  return { kind: 'made', state: next, events, front, created };
}
