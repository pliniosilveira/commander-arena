/**
 * "Exile the top four cards of your library in a face-down pile, then exile the top four cards of your library in a face-up pile. An opponent chooses one of those piles. Put that pile
 * into your graveyard. Look at the cards in the other pile." (CR 700.3, 406.3, 701.13, D-650): the `exilePiles` effect.
 *
 *  1. The effect itself queues the exile of the first pile, face down (CR 406.3: nobody may look at a card exiled face down unless an instruction allows it), and the instruction.
 *  2. `second`: the cards exiled so far are the first pile (the new objects in exile: the moves add what they made to `moved`). The instruction exiles the top cards again, face up.
 *     A pile has `count` cards, or fewer when the library holds fewer; it may have none (CR 700.3d). The cards stay in exile while they are grouped (CR 700.3c).
 *  3. `choose`: the first opponent in turn order still in the game picks a pile (a `chooseOption` decision of purpose `pile`, the one the piles of Fact or Fiction use, asked even when
 *     one pile has no card: the choice is real, because one goes to the graveyard and the other is cast from). The face-down pile is shown to them as a number of cards only. With no
 *     card in either pile there is nothing to choose and the instruction ends. With more than two players the controller does not choose which opponent (the CR gives that choice to
 *     nobody; D-233 set the same limit for Coin of Fate).
 *  4. The chosen pile is put into the graveyard (each card from exile, as an ordinary move). The other pile is what `moved` names afterwards, and its controller may look at the cards of
 *     it that are face down for as long as they stay in exile (CR 406.3), which is what lets them cast one of them (CR 406.3b).
 */
import type { Effect } from '../ast/types';
import type { ObjectId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat, opponentsOf, patchObject } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { derive } from './derive';
import { amountOf, moveInstructions, moving } from './effect-support';
import type { SelectContext } from './select';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type ExilePiles = Extract<Instruction, { kind: 'exilePiles' }>;

/** `moves` of the top `count` cards of the controller's library into exile, face down when `faceDown`. */
function exileTop(
  state: GameState,
  seat: number,
  count: number,
  faceDown: boolean,
): readonly Instruction[] {
  const top = getSeat(state, seat).library.slice(0, Math.max(0, count));
  return moveInstructions(top, 'exile').map((m) =>
    m.kind === 'move' && faceDown ? { ...m, faceDown: true as const } : m,
  );
}

/** The names of the cards, in the order given. */
function namesOf(state: GameState, ids: readonly ObjectId[]): string[] {
  return ids.flatMap((id) => {
    const obj = state.objects[id];
    return obj === undefined ? [] : [derive(state, obj).name];
  });
}

/** The effect as it starts: the face-down pile is exiled, then the instruction goes on. */
export function startExilePiles(
  state: GameState,
  res: ResolutionContext,
  effect: Extract<Effect, { kind: 'exilePiles' }>,
  ctx: SelectContext,
): StepOutcome {
  const count = Math.max(0, amountOf(state, effect.count, ctx, []));
  return moving(state, [
    ...exileTop(state, res.controller, count, true),
    { kind: 'exilePiles', stage: 'second', count, first: [], second: [] },
  ]);
}

export function runExilePiles(
  state: GameState,
  res: ResolutionContext,
  ins: ExilePiles,
): StepOutcome {
  if (ins.stage === 'second') {
    const first = [...(res.lastMoved ?? [])];
    return done(
      state,
      [],
      [
        ...exileTop(state, res.controller, ins.count, false),
        { ...ins, stage: 'choose', first },
      ],
    );
  }
  if (ins.stage === 'finish') {
    // The other pile is what the next instructions name; the controller may look at its face-down cards (CR 406.3).
    let next = state;
    for (const id of ins.second) {
      const card = next.objects[id];
      if (card?.zone !== 'exile' || card.exiledFaceDown !== true) continue;
      const lookers = card.lookers ?? [];
      if (!lookers.includes(res.controller)) {
        next = patchObject(next, id, { lookers: [...lookers, res.controller] });
      }
    }
    return { ...done(next), lastMoved: ins.second };
  }
  const first = ins.first.filter((id) => state.objects[id]?.zone === 'exile');
  const second = (res.lastMoved ?? []).filter(
    (id) => !ins.first.includes(id) && state.objects[id]?.zone === 'exile',
  );
  const [opponent] = opponentsOf(state, res.controller);
  if (opponent === undefined || first.length + second.length === 0) {
    return { ...done(state), lastMoved: [] };
  }
  if (ins.pick === undefined) {
    const info = sourceInfo(state, res.source);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'chooseOption',
        seat: opponent,
        purpose: 'pile',
        options: ['pile1', 'pile2'],
        piles: {
          first,
          second,
          chosenTo: 'graveyard',
          otherTo: 'hand',
          separator: res.controller,
          receiver: res.controller,
          faceDownPile: 1,
          faceDownCount: first.length,
          zone: 'exile',
        },
        source: res.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
      },
    };
  }
  const chosen = ins.pick === 1 ? first : second;
  const other = ins.pick === 1 ? second : first;
  const event: GameEvent = {
    kind: 'pileChosen',
    seat: opponent,
    pile: ins.pick,
    names: ins.pick === 1 ? [] : namesOf(state, chosen),
    ...(ins.pick === 1 ? { faceDown: true as const } : {}),
  };
  return done(
    state,
    [event],
    [...moveInstructions(chosen, 'graveyard'), { ...ins, stage: 'finish', second: other }],
  );
}
