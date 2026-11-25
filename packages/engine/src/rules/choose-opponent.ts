/**
 * "An opponent separates those cards into two piles", "an opponent chooses one of those piles", "choose an opponent. That player copies the spell" with more than one opponent left in
 * the game (CR 608.2d, 702.144a, 801.5b): the CR gives the choice of which opponent to the controller of the effect (its example for a limited range of influence has the caster choose
 * Carissa to make the choice; "a card of an opponent's choice" is the same). The effects that name one (`asksWhichOpponent`) are preceded by a `chooseOpponent` instruction that asks the controller, a `chooseOption` decision of
 * purpose `chooseOpponent`, unless only one opponent is left; the answer is `ResolutionContext.chosenOpponent`, which the effect reads as it starts (`opponentOf`) and the resolution
 * forgets afterwards.
 */
import type { Effect } from '../ast/types';
import type { SeatId } from '../ids';
import { getSeat, opponentsOf } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type EffectNode = Extract<Instruction, { kind: 'effect' }>;

/** The option of the question that stands for `seat` (`seat:<n>`). */
export const opponentOption = (seat: SeatId): string => `seat:${seat}`;

/** Whether the effect has "an opponent" do something and so needs to know which one. */
export function asksWhichOpponent(effect: Effect): boolean {
  switch (effect.kind) {
    case 'opponentChoosesCard':
      return effect.byController !== true;
    case 'revealAndSeparate':
    case 'exilePiles':
    case 'splitCostExiled':
      return true;
    case 'copySpell':
      return effect.copier === 'opponent';
    // Issue 509 (Tasigur: "a nonland card of an opponent's choice"): the opponent who chooses the card is the controller's choice too (CR 801.5a example).
    case 'moveToZone':
      return effect.objects.kind === 'choose' && effect.objects.chosenBy === 'opponent';
    default:
      return false;
  }
}

/**
 * The opponent an effect that is starting uses: the one the controller chose, while they are still in the game, else the first opponent in turn order still in the game (the only one
 * when one is left). Undefined when no opponent is left.
 */
export function opponentOf(state: GameState, res: ResolutionContext): SeatId | undefined {
  const chosen = res.chosenOpponent;
  if (chosen !== undefined && chosen !== res.controller && !getSeat(state, chosen).hasLost) {
    return chosen;
  }
  return opponentsOf(state, res.controller)[0];
}

/** The question, queued ahead of the effect, when the effect needs an opponent, none was chosen yet and more than one is left; null when the effect can start. */
export function askBeforeEffect(
  state: GameState,
  res: ResolutionContext,
  instruction: EffectNode,
): StepOutcome | null {
  if (!asksWhichOpponent(instruction.effect) || res.chosenOpponent !== undefined) return null;
  const seat = instruction.as ?? res.controller;
  if (opponentsOf(state, seat).length < 2) return null;
  return done(state, [], [{ kind: 'chooseOpponent', seat, chosen: null }, instruction]);
}

/** The instruction `chooseOpponent`: asks the controller which opponent, until answered. */
export function runChooseOpponent(
  state: GameState,
  res: ResolutionContext,
  ins: Extract<Instruction, { kind: 'chooseOpponent' }>,
): StepOutcome {
  if (ins.chosen !== null) return done(state);
  const opponents = opponentsOf(state, ins.seat);
  const [only] = opponents;
  if (only !== undefined && opponents.length === 1) {
    return { ...done(state), front: [{ ...ins, chosen: only }] };
  }
  const info = sourceInfo(state, res.source);
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'chooseOption',
      seat: ins.seat,
      purpose: 'chooseOpponent',
      options: opponents.map(opponentOption),
      source: res.object,
      sourceName: info?.name ?? '',
      sourceOracleText: info?.oracleText ?? '',
    },
  };
}
