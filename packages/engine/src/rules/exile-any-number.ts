/**
 * "As many times as you choose, you may exile the top card of your library." (CR 701.13, 608.2d, 401.2, D-661): the `exileTopAnyNumber` effect, run as one instruction that asks again
 * after each card.
 *
 * The controller is asked whether to exile the top card of their library (a `confirmOptional` decision of purpose `exileMore`, which lists the cards exiled so far: they are face up, so
 * the player knows what they have before they choose again). Accepting exiles the card, face up, as an ordinary zone change (CR 400.7: a new object in exile, which triggers what it
 * would) and asks again; declining ends the effect. A library with no card is not asked about. Every card exiled is what `moved` names afterwards.
 */

import { getSeat } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';
import { moveObject } from './zones';

type ExileAnyNumber = Extract<Instruction, { kind: 'exileAnyNumber' }>;

export function runExileAnyNumber(
  state: GameState,
  res: ResolutionContext,
  ins: ExileAnyNumber,
): StepOutcome {
  const seat = res.controller;
  const top = getSeat(state, seat).library[0];
  // Nothing to exile, so nothing to ask: the effect is over.
  if (top === undefined) return done(state);
  if (ins.answer === null) {
    const info = sourceInfo(state, res.source);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'confirmOptional',
        seat,
        source: res.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
        purpose: 'exileMore',
        exiled: (res.lastMoved ?? []).filter((id) => state.objects[id]?.zone === 'exile'),
      },
    };
  }
  const moved = moveObject(state, { object: top, to: 'exile' });
  // A move to exile never asks the commander question (CR 903.9b is for the hand and the library).
  if (moved.kind !== 'done') return done(state);
  return {
    ...done(moved.state, moved.events, [{ kind: 'exileAnyNumber', answer: null }]),
    lastMoved: [...(res.lastMoved ?? []), ...(moved.newObject === null ? [] : [moved.newObject])],
  };
}
