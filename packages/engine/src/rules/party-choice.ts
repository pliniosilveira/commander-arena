/**
 * "Each player chooses a party from among creatures they control, then sacrifices the rest" (Stick Together, CR 700.8d, 701.21a, 101.4). The players choose in APNAP order, each
 * knowing the earlier choices (CR 101.4b); nothing is sacrificed until the last has chosen, then every creature that is not in its controller's party is sacrificed at once.
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { creaturesControlledBy, partySlots } from './party';
import { sacrificeInstructions } from './sacrifice-choice';
import { cantBeSacrificed } from './sacrifice-prevention';
import { recordTogether } from './simultaneous';
import { done, type StepOutcome } from './step-outcome';

type PartyInstruction = Extract<Instruction, { kind: 'chooseParty' }>;

/** The `chooseParty` instruction for the players `seats` (in APNAP order), or null with none. */
export function partyInstruction(seats: readonly SeatId[]): PartyInstruction | null {
  const [seat, ...later] = seats;
  return seat === undefined ? null : { kind: 'chooseParty', seat, later, held: [], chosen: null };
}

/** CR 701.21a: the creatures `seat` controls that are not in `party` and can be sacrificed (CR 101.2). */
function sacrificedBy(state: GameState, seat: SeatId, party: readonly ObjectId[]): ObjectId[] {
  return creaturesControlledBy(state, seat).filter(
    (id) => !party.includes(id) && !cantBeSacrificed(state, id),
  );
}

export function runChooseParty(
  state: GameState,
  res: ResolutionContext,
  instruction: PartyInstruction,
): StepOutcome {
  const seat = instruction.seat;
  const slots = partySlots(state, creaturesControlledBy(state, seat));
  const proceed = (
    party: readonly { type: (typeof slots)[number]['type']; object: ObjectId }[],
    automatic: boolean,
  ): StepOutcome => {
    const event: GameEvent = {
      kind: 'partyChosen',
      seat,
      source: res.object,
      party,
      automatic,
    };
    const held = [...instruction.held, { seat, party: party.map((m) => m.object) }];
    const next = instruction.later[0];
    if (next !== undefined) {
      return done(
        state,
        [event],
        [{ ...instruction, seat: next, later: instruction.later.slice(1), held, chosen: null }],
      );
    }
    // CR 101.4: all the choices are made; the sacrifices happen simultaneously. D-283 (CR 603.10a): what is sacrificed together is recorded before the first moves.
    const together = recordTogether(
      state,
      held.flatMap((h) => sacrificeInstructions(sacrificedBy(state, h.seat, h.party), h.seat)),
    );
    return done(together.state, [event], together.instructions);
  };
  if (instruction.chosen !== null) return proceed(instruction.chosen, false);
  // CR 700.8d: a player with no creature of a party type has nothing to choose, and sacrifices all of their creatures.
  if (slots.every((s) => s.legal.length === 0)) return proceed([], true);
  return {
    state,
    events: [],
    front: [],
    needs: { kind: 'chooseParty', seat, source: res.object, slots },
  };
}
