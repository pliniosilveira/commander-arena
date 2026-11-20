/**
 * "Clash with an opponent" (CR 701.30a-d, Hoarder's Greed): the `clash` effect, run as one instruction in stages.
 *
 * 1. The opponent (CR 701.30b: "choose an opponent. You and that opponent each clash"): with one opponent in the game nothing is asked; with several, the controller chooses (a
 *    `chooseOption` decision of purpose `clashOpponent`, the options `seat:<n>`); with none there is no clash.
 * 2. Each clashing player reveals the top card of their library at the same time (CR 701.30c, a `cardsRevealed` event for each; a player with an empty library reveals none).
 * 3. Then the players decide in turn order (APNAP, CR 101.4, 701.30c) whether to put the card they revealed on the bottom of their library (a `confirmOptional` decision of purpose
 *    `clash` for each player who revealed a card, `subject` the card, which is public), and when the last has decided the cards move at the same time (a `cardsBottomed` event).
 * 4. The controller wins if the card they revealed has a higher mana value than all other cards revealed (CR 701.30d, 202.3): the outcome `clashWon` the condition of that name reads.
 */
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat, patchSeat } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { derive } from './derive';
import { manaValueOfCost } from './mana-value';
import { apnapOrder } from './select';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

export type ClashInstruction = Extract<Instruction, { kind: 'clash' }>;

/** The option a decision lists for an opponent. */
export const clashOpponentOption = (seat: SeatId): string => `seat:${seat}`;

/** A fresh clash instruction, for the effect. */
export const newClash = (): ClashInstruction => ({
  kind: 'clash',
  opponent: null,
  chosen: null,
  revealed: null,
  decisions: [],
});

export function runClash(
  state: GameState,
  res: ResolutionContext,
  ins: ClashInstruction,
): StepOutcome {
  const controller = res.controller;
  const info = sourceInfo(state, res.source);
  const sourceFields = {
    source: res.object,
    sourceName: info?.name ?? '',
    sourceOracleText: info?.oracleText ?? '',
  };

  // Stage 1: the opponent.
  let opponent = ins.opponent;
  if (opponent === null) {
    const opponents = state.seats
      .map((_, index) => index)
      .filter((seat) => seat !== controller && !getSeat(state, seat).hasLost);
    const [only] = opponents;
    if (only === undefined) return { ...done(state), clashWon: false };
    const picked =
      ins.chosen === null
        ? undefined
        : opponents.find((seat) => clashOpponentOption(seat) === ins.chosen);
    if (picked !== undefined) opponent = picked;
    else if (opponents.length === 1) opponent = only;
    else {
      return {
        state,
        events: [],
        front: [],
        needs: {
          kind: 'chooseOption',
          seat: controller,
          purpose: 'clashOpponent',
          options: opponents.map(clashOpponentOption),
          ...sourceFields,
        },
      };
    }
  }

  // Stage 2: both reveal the top card of their library at the same time.
  let revealed = ins.revealed;
  const events: GameEvent[] = [];
  if (revealed === null) {
    const shown: { seat: SeatId; card: ObjectId; value: number }[] = [];
    for (const seat of apnapOrder(state, [controller, opponent])) {
      const top = getSeat(state, seat).library[0];
      const object = top === undefined ? undefined : state.objects[top];
      if (top === undefined || object === undefined || object.card === null) continue;
      const view = derive(state, object);
      events.push({
        kind: 'cardsRevealed',
        seat,
        cards: [object.card],
        names: [view.name],
        from: 'library',
      });
      shown.push({ seat, card: top, value: manaValueOfCost(view.manaCost, object) });
    }
    revealed = shown;
  }

  // Stage 3: each player who revealed a card decides, in turn order, whether it goes on the bottom.
  const order = apnapOrder(
    state,
    revealed.map((r) => r.seat),
  );
  const decisions = ins.decisions;
  const next = order.find((seat) => !decisions.some((d) => d.seat === seat));
  const later: ClashInstruction = { ...ins, opponent, revealed };
  if (next !== undefined) {
    const card = revealed.find((r) => r.seat === next)?.card;
    if (ins.revealed === null) {
      // The reveal happens first and is told before anyone is asked; the instruction comes back to ask.
      return done(state, events, [later]);
    }
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'confirmOptional',
        seat: next,
        purpose: 'clash',
        ...(card === undefined ? {} : { subject: card }),
        ...sourceFields,
      },
    };
  }

  // Stage 4: the cards move at the same time, and the controller's win is read from the mana values (CR 701.30d).
  let moved: GameState = state;
  const bottomed: GameEvent[] = [];
  for (const { seat, bottom } of decisions) {
    const card = revealed.find((r) => r.seat === seat)?.card;
    const library = getSeat(moved, seat).library;
    if (!bottom || card === undefined || library[0] !== card) continue;
    moved = patchSeat(moved, seat, { library: [...library.slice(1), card] });
    bottomed.push({ kind: 'cardsBottomed', seat, count: 1 });
  }
  const mine = revealed.find((r) => r.seat === controller);
  const won =
    mine !== undefined && revealed.every((r) => r.seat === controller || mine.value > r.value);
  return { ...done(moved, [...events, ...bottomed]), clashWon: won };
}
