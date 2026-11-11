/**
 * "You may pay any amount of {R}. When you do, it deals that much damage to any target." (D-151): the `payAnyAmount` effect, run as an instruction in the
 * stages the player's answers make. The controller is first asked how many times to pay the symbol (a `chooseX` decision of purpose 'payAnyAmount': from 0 up
 * to as many as they could pay now, mana in the pool and from sources they may tap, CR 605.3a; nothing is asked when none could be paid). A positive number
 * is then paid as any "you may pay" cost is (`rules/pay-unless.ts`, a `payMana` decision, `cancel` means not paying), and once it is paid the reflexive
 * triggered ability is created (CR 603.12) with the number paid as "that much" (`rules/may-effects.ts`).
 * D-257: `atMost` caps the answer ("pay {X}, where X is less than or equal to the amount of life you gained"), and the symbol may be a generic {1}.
 */
import type { Effect } from '../ast/types';
import type { SeatId } from '../ids';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { amountOf } from './amounts';
import { planFor } from './mana-engine';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

type PayAmount = Extract<Instruction, { kind: 'payAmount' }>;
type PayAnyAmount = Extract<Effect, { kind: 'payAnyAmount' }>;

/** The most times `seat` could pay one `symbol` right now (0 when not even once). */
export function maxPayable(state: GameState, seat: SeatId, symbol: PayAnyAmount['symbol']): number {
  let n = 0;
  while (n < 40 && planFor(state, seat, Array(n + 1).fill(symbol), { ability: true }) !== null) {
    n += 1;
  }
  return n;
}

export function runPayAmount(
  state: GameState,
  res: ResolutionContext,
  ins: PayAmount,
): StepOutcome {
  if (ins.amount === null) {
    const payable = maxPayable(state, ins.seat, ins.effect.symbol);
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
        cost: [{ kind: 'mana', symbols: [ins.effect.symbol] }],
      },
    };
  }
  if (ins.amount <= 0) return done(state);
  // The payment is asked as a "you may pay" cost is, once the amount is known: no second question.
  return done(
    state,
    [],
    [
      {
        kind: 'unlessPays',
        seat: ins.seat,
        cost: [{ kind: 'mana', symbols: Array(ins.amount).fill(ins.effect.symbol) }],
        stage: 'pay',
        effect: { ...ins.effect, paid: ins.amount },
        optional: false,
        ifPaid: true,
      },
    ],
  );
}
