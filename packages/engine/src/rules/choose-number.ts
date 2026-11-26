/**
 * "Choose a number between 0 and 10." (Expel the Interlopers, CR 608.2d, 107.1): the `chooseNumber` effect, run as an instruction. The controller of the spell or ability is
 * asked for a whole number from `min` to `max` (a `chooseX` decision of purpose `chooseNumber`, no way back: nothing is cast or activated); the answer is kept in
 * `ResolutionContext.chosenNumber`, which `powerAtLeastChosenNumber` reads in the instructions after it, and the choice is public (an `optionChosen` event).
 */
import { getSeat, setSeat } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { derive } from './derive';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type ChooseNumber = Extract<Instruction, { kind: 'chooseNumber' }>;

export function runChooseNumber(
  state: GameState,
  res: ResolutionContext,
  ins: ChooseNumber,
): StepOutcome {
  if (ins.amount !== null) {
    if (ins.manaSplit === undefined) return done(state);
    // CR 106.1b, 605.3b (Xenagos): the mana of the combination goes to the pool of the player who chose it, in the colors chosen.
    const [first, ...others] = ins.manaSplit;
    if (first === undefined) return done(state);
    const source = res.source;
    const live = source === null ? undefined : state.objects[source];
    const sourceTypes =
      source === null
        ? []
        : live !== undefined
          ? derive(state, live).types
          : (state.lki[source]?.characteristics.types ?? []);
    const left = ins.max - ins.amount;
    // The last color takes what is left; with more colors after this one the player is asked how many of the next (CR 106.1b, 608.2d).
    const [second] = others;
    const more = others.length > 1 && left > 0;
    const made = [
      ...Array.from({ length: ins.amount }, () => first),
      ...(more || second === undefined ? [] : Array.from({ length: left }, () => second)),
    ].map((color) => ({
      color,
      snow: false,
      source,
      restriction: null,
      ...(sourceTypes.length === 0 ? {} : { sourceTypes }),
    }));
    const next: Instruction[] = more
      ? [{ ...ins, min: 0, max: left, amount: null, manaSplit: others }]
      : [];
    if (made.length === 0) return done(state, [], next);
    const seat = getSeat(state, ins.seat);
    return {
      ...done(
        setSeat(state, { ...seat, manaPool: [...seat.manaPool, ...made] }),
        [{ kind: 'manaAdded', seat: ins.seat, count: made.length }],
        next,
      ),
      performed: 1,
    };
  }
  const info = sourceInfo(state, res.source);
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'chooseX',
      seat: ins.seat,
      source: res.object,
      sourceName: info?.name ?? '',
      sourceOracleText: info?.oracleText ?? '',
      purpose: 'chooseNumber',
      min: ins.min,
      max: ins.max,
      ...(ins.manaSplit?.[0] === undefined ? {} : { manaColor: ins.manaSplit[0] }),
      perX: { mana: 0, life: 0 },
    },
  };
}
