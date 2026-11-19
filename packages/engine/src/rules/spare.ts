/**
 * "For each player, you choose from among the permanents that player controls an artifact, a creature, an enchantment, and a planeswalker. Then each player
 * sacrifices all other nonland permanents they control" (Tragic Arrogance; CR 608.2d, 701.21a, 101.4, D-231). With `own` (D-484, Liliana, Dreadhorde General: "Each
 * opponent chooses a permanent they control of each permanent type and sacrifices the rest") each player the effect names chooses among their own permanents and
 * sacrifices everything else they control, lands included. The controller of the effect makes every choice, one
 * for each card type and each player, the players in turn order starting with the active player (APNAP) and the types in the order the text lists them. A type of
 * which the player controls no permanent is skipped; with one candidate the engine chooses (and says so); otherwise a `choosePermanent` decision (purpose `spare`)
 * asks. The same permanent may be chosen for more than one type it has (an artifact creature as the artifact and as the creature: the text names no other limit).
 * When every choice is made, each player sacrifices every nonland permanent they control that was not chosen, all at once as one batch in turn order.
 *
 * "Each player puts a vow counter on a creature they control and sacrifices the rest" (Promise of Loyalty; CR 608.2d, 701.21a, 122.1): with `own` and `onlyTypes` only the permanents of
 * the chosen types are sacrificed (the lands stay); with `counter` each permanent kept gets the counter first, put by its controller, in turn order (a permanent that can't have counters of
 * the kind gets none); with `keptAs` the permanents kept are remembered under that name for the instructions after this one ("each of those creatures", `chosen`).
 */
import type { CardType } from '../characteristics';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { patchObject, seatsInOrder } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { controllerOf } from './control';
import { blocks, counterBlockers } from './counter-prevention';
import { derive } from './derive';
import { sacrificeInstructions } from './sacrifice-choice';
import { apnapOrder } from './select';
import { recordTogether } from './simultaneous';
import { done, type StepOutcome } from './step-outcome';

type SpareInstruction = Extract<Instruction, { kind: 'spare' }>;

/** The nonland and other permanents on the battlefield, with who controls them. */
function permanentsOf(
  state: GameState,
): { id: ObjectId; controller: SeatId; types: readonly CardType[] }[] {
  return Object.values(state.objects).flatMap((o) =>
    o.zone === 'battlefield'
      ? [{ id: o.id, controller: controllerOf(state, o), types: derive(state, o).types }]
      : [],
  );
}

/**
 * The instruction that starts the choices of the effect: the players still in the game, in turn order from the active player. With `own` (D-484, "Each opponent chooses a
 * permanent they control of each permanent type and sacrifices the rest") only the players the effect names, each choosing for themselves.
 */
export function startSpare(
  state: GameState,
  types: readonly CardType[],
  own?: readonly SeatId[],
  options: { readonly onlyTypes?: true; readonly counter?: string; readonly keptAs?: string } = {},
): SpareInstruction {
  const players = seatsInOrder(state, state.turn.activeSeat);
  return {
    kind: 'spare',
    ...(own === undefined ? {} : { own: true as const }),
    ...(options.onlyTypes === true ? { onlyTypes: true as const } : {}),
    ...(options.counter === undefined ? {} : { counter: options.counter }),
    ...(options.keptAs === undefined ? {} : { keptAs: options.keptAs }),
    players: own === undefined ? players : players.filter((seat) => own.includes(seat)),
    types,
    step: 0,
    spared: [],
    chosen: null,
  };
}

export function runSpare(
  state: GameState,
  res: ResolutionContext,
  ins: SpareInstruction,
): StepOutcome {
  const pairs = ins.players.flatMap((player) => ins.types.map((type) => ({ player, type })));
  const pair = pairs[ins.step];
  if (pair === undefined) {
    // Every choice is made: each player sacrifices all the other nonland permanents they control, or with `own` all the other permanents they control (CR 701.21a, 101.4); with
    // `onlyTypes` only the ones of the types asked.
    const kept = new Set(ins.spared);
    // CR 122.1, 101.4: the permanents kept get the counter first, put by the player who controls each, in turn order.
    let counted = state;
    const events: GameEvent[] = [];
    if (ins.counter !== undefined) {
      const counter = ins.counter;
      const blockers = counterBlockers(counted);
      for (const id of [...new Set(ins.spared)]) {
        const obj = counted.objects[id];
        if (obj === undefined || obj.zone !== 'battlefield') continue;
        if (blocks(counted, blockers, obj, counter)) continue;
        counted = patchObject(counted, id, {
          counters: { ...obj.counters, [counter]: (obj.counters[counter] ?? 0) + 1 },
        });
        events.push({
          kind: 'counterAdded',
          object: id,
          counter,
          count: 1,
          by: controllerOf(counted, obj),
        });
      }
    }
    const doomed = permanentsOf(counted).filter(
      (p) =>
        ins.players.includes(p.controller) &&
        (ins.own === true
          ? ins.onlyTypes !== true || p.types.some((t) => ins.types.includes(t))
          : !p.types.includes('land')) &&
        !kept.has(p.id),
    );
    const seats = apnapOrder(
      state,
      doomed.map((p) => p.controller),
    );
    // D-283 (CR 603.10a): all of them are sacrificed at once, so what each was is recorded before the first moves.
    const together = recordTogether(
      counted,
      seats.flatMap((seat) =>
        sacrificeInstructions(
          doomed.filter((p) => p.controller === seat).map((p) => p.id),
          seat,
        ),
      ),
    );
    const outcome = done(together.state, events, together.instructions);
    return ins.keptAs === undefined
      ? outcome
      : { ...outcome, chosenObjects: { [ins.keptAs]: [...new Set(ins.spared)] } };
  }
  const candidates = permanentsOf(state)
    .filter((p) => p.controller === pair.player && p.types.includes(pair.type))
    .map((p) => p.id);
  const next = (chosen: readonly ObjectId[], events: readonly GameEvent[]): StepOutcome =>
    done(state, events, [
      { ...ins, step: ins.step + 1, spared: [...ins.spared, ...chosen], chosen: null },
    ]);
  if (candidates.length === 0) return next([], []);
  // D-484: with `own` the player chooses among their own permanents; otherwise the controller of the effect chooses for every player.
  const chooser = ins.own === true ? pair.player : res.controller;
  const event = (objects: readonly ObjectId[], automatic: boolean): GameEvent => ({
    kind: 'permanentsChosen',
    seat: chooser,
    source: res.object,
    objects,
    purpose: 'effect',
    automatic,
  });
  if (ins.chosen !== null) return next(ins.chosen, [event(ins.chosen, false)]);
  const [only] = candidates;
  if (candidates.length === 1 && only !== undefined) return next([only], [event([only], true)]);
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'choosePermanent',
      seat: chooser,
      source: res.object,
      purpose: 'spare',
      spare: {
        player: pair.player,
        type: pair.type,
        ...(ins.own === true ? { own: true as const } : {}),
        ...(ins.onlyTypes === true ? { onlyTypes: true as const } : {}),
        ...(ins.counter === undefined ? {} : { counter: ins.counter }),
      },
      min: 1,
      max: 1,
      legal: candidates,
    },
  };
}
