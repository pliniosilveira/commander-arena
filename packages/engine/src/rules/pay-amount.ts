/**
 * "You may pay any amount of {R}. When you do, it deals that much damage to any target." (D-151): the `payAnyAmount` effect, run as an instruction in the
 * stages the player's answers make. The controller is first asked how many times to pay the symbol (a `chooseX` decision of purpose 'payAnyAmount': from 0 up
 * to as many as they could pay now, mana in the pool and from sources they may tap, CR 605.3a; nothing is asked when none could be paid). A positive number
 * is then paid as any "you may pay" cost is (`rules/pay-unless.ts`, a `payMana` decision, `cancel` means not paying), and once it is paid the reflexive
 * triggered ability is created (CR 603.12) with the number paid as "that much" (`rules/may-effects.ts`).
 * D-257: `atMost` caps the answer ("pay {X}, where X is less than or equal to the amount of life you gained"), and the symbol may be a generic {1}.
 */
import type { Cost, Effect } from '../ast/types';
import type { SeatId } from '../ids';
import { getSeat, patchSeat } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { amountOf } from './amounts';
import { planFor } from './mana-engine';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type PayAmount = Extract<Instruction, { kind: 'payAmount' }>;
type PayAnyAmount = Extract<Effect, { kind: 'payAnyAmount' }>;

/** The mana symbols of one payment of the effect: the `cost` it names, or its one `symbol` (a generic {1} when it names neither). */
function symbolsPerPayment(effect: PayAnyAmount): readonly string[] {
  return effect.cost ?? [effect.symbol ?? '1'];
}

/** `symbols` paid `times` times over. */
function repeated(symbols: readonly string[], times: number): string[] {
  return Array.from({ length: times }, () => symbols).flat();
}

/** The most times `seat` could pay one payment of `symbols` right now (0 when not even once). */
export function maxPayable(state: GameState, seat: SeatId, symbols: readonly string[]): number {
  // CR 107.14, 118.3 (issue 105): energy is paid from the counters the player has, one for each time.
  if (symbols[0] === 'E') return getSeat(state, seat).energy ?? 0;
  let n = 0;
  while (n < 40 && planFor(state, seat, repeated(symbols, n + 1), { ability: true }) !== null) {
    n += 1;
  }
  return n;
}

/** `times` payments of the effect as a cost: energy counters for the symbol {E} (CR 107.14), mana otherwise. */
function costOf(effect: PayAnyAmount, times: number): Cost[] {
  if (effect.symbol === 'E') return [{ kind: 'energy', count: times }];
  return [{ kind: 'mana', symbols: repeated(symbolsPerPayment(effect), times) }];
}

export function runPayAmount(
  state: GameState,
  res: ResolutionContext,
  ins: PayAmount,
): StepOutcome {
  if (ins.amount === null) {
    const payable = maxPayable(state, ins.seat, symbolsPerPayment(ins.effect));
    // D-257: "where X is less than or equal to the amount of life you gained": a most the effect itself gives, read as it starts.
    const cap =
      ins.effect.atMost === undefined
        ? payable
        : amountOf(
            state,
            ins.effect.atMost,
            {
              controller: res.controller,
              source: res.source,
              ...(res.triggerDamage === undefined ? {} : { triggerDamage: res.triggerDamage }),
              ...(res.triggerTargetCount === undefined
                ? {}
                : { triggerTargetCount: res.triggerTargetCount }),
            },
            [],
          );
    const max = Math.min(payable, cap);
    // CR 118.3: what cannot be paid is not paid, so nobody is asked.
    if (max === 0) return done(state);
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
        purpose: 'payAnyAmount',
        min: 0,
        max,
        perX: { mana: 0, life: 0 },
        cost: costOf(ins.effect, 1),
      },
    };
  }
  if (ins.amount <= 0) return done(state);
  if (ins.effect.symbol === 'E') {
    // CR 107.14, 118.3 (issue 105): energy needs no choice of how to pay, so it is paid here, at once, and the follow-up runs with the number paid.
    const had = getSeat(state, ins.seat).energy ?? 0;
    if (had < ins.amount) return done(state);
    return done(
      patchSeat(state, ins.seat, { energy: had - ins.amount }),
      [{ kind: 'energyChanged', seat: ins.seat, from: had, to: had - ins.amount }],
      [{ kind: 'effect', effect: { ...ins.effect, paid: ins.amount } }],
    );
  }
  // The payment is asked as a "you may pay" cost is, once the amount is known: no second question.
  return done(
    state,
    [],
    [
      {
        kind: 'unlessPays',
        seat: ins.seat,
        cost: costOf(ins.effect, ins.amount),
        stage: 'pay',
        effect: { ...ins.effect, paid: ins.amount },
        optional: false,
        ifPaid: true,
      },
    ],
  );
}
