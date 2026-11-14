/**
 * "Counter it unless its controller pays [cost]" (CR 702.21a Ward, CR 701.6 Counter): the part of a
 * resolving ability that lets a player pay to keep a spell or ability on the stack. The same flow runs
 * "[do something] unless [that player] pays [cost]" (CR 118.12a, D-111, `unlessPays`): the question goes
 * to the player the effect names, and when they do not pay (or cannot) the effect happens instead of the
 * counter (purpose 'unlessPays', no `subject`).
 *
 * The flow, one `counterUnlessPays` instruction per spell or ability named:
 * 1. stage 'ask': if the controller of the spell or ability (the payer, CR 702.21a "that player")
 *    cannot pay the whole cost, it is countered at once (CR 118.3: a cost that cannot be paid is not
 *    paid) and nobody is asked, so `getLegalActions` never offers what the engine would refuse.
 *    Otherwise the payer is asked a `confirmOptional` with the cost. The purpose of both questions is
 *    the instruction's: 'ward' for the triggering spell or ability of Ward, 'counterUnlessPays' for
 *    "Counter target spell unless its controller pays {3}".
 * 2. decline: it is countered (the same `countered` event and move as the `counter` effect).
 * 3. accept: the life is paid now (CR 119.4); a discard cost (Ward—Discard a card, D-095) is paid next:
 *    with exactly as many cards in hand as asked they all go, with more the instruction goes to stage
 *    'discard' and the payer gets a `chooseCards` decision (no `cancel`: they accepted); if the cost
 *    has mana the instruction goes to stage 'pay' and the payer gets a `payMana` decision (the same
 *    purpose) for the mana, the same decision and the same payment code as a spell's cost, with the
 *    sources they may tap now (CR 605.3a). `cancel` there means "do not pay": it is countered.
 * 4. paid: the instruction ends and the spell or ability stays on the stack.
 *
 * Mana cannot be paid mid-resolution by the casting transaction (it needs `GameState.casting`), so
 * this module asks for it itself. Mana in the payer's pool counts; mana restricted to spells does
 * not (CR 106.6: the payment is not for a spell).
 */
import type { Cost } from '../ast/types';
import type { ObjectId, SeatId } from '../ids';
import type { GameEvent } from '../state/events';
import { getSeat, loseLifeBy, patchSeat } from '../state/ops';
import type { GameState, Instruction, ResolutionContext } from '../state/types';
import { manaSymbolsOf } from './alt-costs';
import { controllerOf } from './control';
import { discardCostDecision, discardObjects } from './discard-cost';
import { lifeOf } from './enters';
import { applyPaymentPlan, payableSources, planFor } from './mana-engine';
import { type ManualTap, payByTapping } from './pay-manual';
import { sourceInfo } from './source-info';
import { done, type StepOutcome } from './step-outcome';

/**
 * "Counter it unless its controller pays" (`counterUnlessPays`) and "[do something] unless [that player]
 * pays" (`unlessPays`, CR 118.12a, D-111): the same question and payment, a different thing when the
 * payer does not pay: the spell or ability is countered, or the effect happens.
 */
export type UnlessInstruction = Extract<Instruction, { kind: 'counterUnlessPays' | 'unlessPays' }>;

/** The question's purpose: the instruction's own for a counter, 'unlessPays' for the general form. */
function purposeOf(
  head: UnlessInstruction,
): 'ward' | 'counterUnlessPays' | 'unlessPays' | 'mayPay' {
  if (head.kind === 'counterUnlessPays') return head.purpose;
  return head.ifPaid === true ? 'mayPay' : 'unlessPays';
}

/** The `upkeep` of the decisions of an Echo or Cumulative upkeep payment (D-127); nothing for any other. */
function upkeepField(head: UnlessInstruction): { readonly upkeep?: 'echo' | 'cumulativeUpkeep' } {
  return head.kind === 'unlessPays' && head.upkeep !== undefined ? { upkeep: head.upkeep } : {};
}

/**
 * What runs once the payment is made: nothing for "unless" (the payer kept what they wanted), the effect
 * for "you may pay [cost]. If you do, [effect]" (`mayPay`, CR 702.101a, D-120), ahead of the rest of the queue.
 */
function paid(head: UnlessInstruction, rest: readonly Instruction[]): readonly Instruction[] {
  return head.kind === 'unlessPays' && head.ifPaid === true
    ? [{ kind: 'effect', effect: head.effect }, ...rest]
    : rest;
}

/** What happens when the payer does not pay (declines, cannot, or backs out of the payment). */
function notPaid(state: GameState, head: UnlessInstruction): StepOutcome {
  if (head.kind === 'counterUnlessPays') return counterOutcome(state, head.object);
  // "You may pay [cost]. If you do, [effect]": not paying (or not being able to) does nothing (D-120).
  if (head.ifPaid === true) return done(state);
  // CR 118.12a: "[A player] may [pay]. If [that player] doesn't, [do something]": the effect is the
  // controller's, and "you may" asks the controller now (after the payer decided).
  return done(state, [], [effectOf(head)]);
}

function effectOf(head: Extract<UnlessInstruction, { kind: 'unlessPays' }>): Instruction {
  return head.optional
    ? { kind: 'mayEffect', effect: head.effect, answer: null }
    : { kind: 'effect', effect: head.effect };
}

/** The number of cards the cost discards (CR 701.9): the sum of its `discard` costs. */
export function discardOf(cost: readonly Cost[]): number {
  return cost.reduce((n, c) => n + (c.kind === 'discard' ? c.count : 0), 0);
}

/** The energy counters the cost removes (CR 107.14, D-209): the sum of its `energy` costs. */
export function energyOf(cost: readonly Cost[]): number {
  return cost.reduce((n, c) => n + (c.kind === 'energy' ? c.count : 0), 0);
}

/**
 * Whether `payer` can pay the whole cost now: the life (CR 119.4 lets a player pay all of theirs),
 * the cards to discard (CR 118.3: they need that many in hand), and the mana, planned from the pool
 * and their untapped sources after the life is paid. Only `mana`, `payLife` and `discard` costs
 * exist here (`validateCard`); any other kind cannot be paid.
 */
export function canPayUnless(state: GameState, payer: SeatId, cost: readonly Cost[]): boolean {
  if (
    cost.some(
      (c) =>
        c.kind !== 'mana' && c.kind !== 'payLife' && c.kind !== 'discard' && c.kind !== 'energy',
    )
  ) {
    return false;
  }
  const life = lifeOf(cost);
  const seat = getSeat(state, payer);
  if (seat.life < life) return false;
  // CR 107.14, 118.3 (D-209): {E} is paid by removing an energy counter, so the payer needs that many.
  if ((seat.energy ?? 0) < energyOf(cost)) return false;
  if (seat.hand.length < discardOf(cost)) return false;
  const symbols = manaSymbolsOf(cost);
  if (symbols.length === 0) return true;
  const afterLife = life > 0 ? loseLifeBy(state, payer, life) : state;
  return planFor(afterLife, payer, symbols, { ability: true }) !== null;
}

/** CR 701.6: the spell or ability is countered: the event, then it leaves the stack. */
export function counterOutcome(state: GameState, object: ObjectId): StepOutcome {
  return done(
    state,
    [{ kind: 'countered', object }],
    [
      {
        kind: 'move',
        object,
        to: 'graveyard',
        position: 'top',
        tapped: false,
        commanderChoice: null,
      },
    ],
  );
}

/** Runs the instruction: counters at once, asks the question, or asks for the mana. */
export function runCounterUnlessPays(
  state: GameState,
  res: ResolutionContext,
  instruction: UnlessInstruction,
): StepOutcome {
  let payer: SeatId;
  if (instruction.kind === 'counterUnlessPays') {
    const target = state.objects[instruction.object];
    // CR 608.2b: gone already (countered in response, say): nothing to counter, nothing to pay.
    if (target?.zone !== 'stack') return done(state);
    payer = controllerOf(state, target);
  } else {
    payer = instruction.seat;
  }
  if (instruction.stage === 'ask') {
    // CR 118.3: a cost that cannot be paid is not paid, so nobody is asked.
    if (!canPayUnless(state, payer, instruction.cost)) return notPaid(state, instruction);
    const info = sourceInfo(state, res.source);
    return {
      state,
      events: [],
      front: [],
      needs: {
        kind: 'confirmOptional',
        seat: payer,
        source: res.object,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
        cost: instruction.cost,
        purpose: purposeOf(instruction),
        ...(instruction.kind === 'counterUnlessPays' ? { subject: instruction.object } : {}),
        ...upkeepField(instruction),
      },
    };
  }
  if (instruction.stage === 'discard') {
    // The cards to discard, chosen by the payer from their hand; they accepted, so no `cancel`.
    return {
      state,
      events: [],
      front: [],
      needs: discardCostDecision(
        payer,
        res.object,
        getSeat(state, payer).hand,
        discardOf(instruction.cost),
        false,
      ),
    };
  }
  return {
    state,
    events: [],
    front: [],
    needs: {
      kind: 'payMana',
      seat: payer,
      source: res.object,
      totalCost: manaSymbolsOf(instruction.cost),
      manaSources: payableSources(state, payer),
      purpose: purposeOf(instruction),
      ...(instruction.kind === 'counterUnlessPays' ? { subject: instruction.object } : {}),
      ...upkeepField(instruction),
    },
  };
}

/** What an answer changes: the state, the events, and the queue the resolution continues with. */
export interface UnlessAnswer {
  readonly state: GameState;
  readonly events: GameEvent[];
  readonly queue: readonly Instruction[];
}

/**
 * The payer declined, or backed out of the payment with `cancel`: it is countered. `declined` is
 * true when they answered the question (`optionalAnswered` is emitted), false for a `cancel`.
 */
export function declineUnless(
  state: GameState,
  res: ResolutionContext,
  head: UnlessInstruction,
  payer: SeatId,
  declined: boolean,
): UnlessAnswer {
  const out = notPaid(state, head);
  const events: GameEvent[] = declined
    ? [{ kind: 'optionalAnswered', seat: payer, source: res.object, accepted: false }]
    : [];
  return {
    state,
    events: [...events, ...out.events],
    queue: [...out.front, ...res.queue.slice(1)],
  };
}

/**
 * The payer accepted: the life is paid now, then the cards (all of the hand when it holds exactly
 * that many, otherwise the question comes next), then the mana if the cost has any.
 */
export function acceptUnless(
  state: GameState,
  res: ResolutionContext,
  head: UnlessInstruction,
  payer: SeatId,
): UnlessAnswer {
  const events: GameEvent[] = [
    { kind: 'optionalAnswered', seat: payer, source: res.object, accepted: true },
  ];
  let next = state;
  const life = lifeOf(head.cost);
  if (life > 0) {
    const before = getSeat(next, payer).life;
    next = loseLifeBy(next, payer, life);
    events.push({ kind: 'lifeChanged', seat: payer, from: before, to: before - life });
  }
  // CR 107.14 (D-209): the energy is paid now, as the life is.
  const energy = energyOf(head.cost);
  if (energy > 0) {
    const had = getSeat(next, payer).energy ?? 0;
    next = patchSeat(next, payer, { energy: had - energy });
    events.push({ kind: 'energyChanged', seat: payer, from: had, to: had - energy });
  }
  const rest = res.queue.slice(1);
  const discard = discardOf(head.cost);
  const hand = getSeat(next, payer).hand;
  if (discard > 0 && hand.length > discard) {
    return { state: next, events, queue: [{ ...head, stage: 'discard' }, ...rest] };
  }
  if (discard > 0) {
    const moved = discardObjects(next, payer, hand);
    if (moved !== null) {
      next = moved.state;
      events.push(...moved.events);
    }
  }
  return { state: next, events, queue: afterDiscard(head, rest) };
}

/** What is left of the cost once the life and the cards are paid: the mana, or nothing. */
function afterDiscard(
  head: UnlessInstruction,
  rest: readonly Instruction[],
): readonly Instruction[] {
  const needsMana = manaSymbolsOf(head.cost).length > 0;
  return needsMana ? [{ ...head, stage: 'pay' }, ...rest] : paid(head, rest);
}

/**
 * The payer chose the cards to discard (stage 'discard'): they go to the graveyard, then the mana.
 * Null when a card is not in their hand (the caller checked the answer against the decision).
 */
export function discardUnless(
  state: GameState,
  res: ResolutionContext,
  head: UnlessInstruction,
  payer: SeatId,
  chosen: readonly ObjectId[],
): UnlessAnswer | null {
  const moved = discardObjects(state, payer, chosen);
  if (moved === null) return null;
  return {
    state: moved.state,
    events: moved.events,
    queue: afterDiscard(head, res.queue.slice(1)),
  };
}

/**
 * The payer's answer to the mana payment: `payAuto` (the planner chooses the sources) or
 * `payManual` (the sources they tapped). An error leaves everything as it was.
 */
export function payUnlessMana(
  state: GameState,
  res: ResolutionContext,
  head: UnlessInstruction,
  payer: SeatId,
  action:
    | { readonly kind: 'payAuto' }
    | { readonly kind: 'payManual'; readonly taps: readonly ManualTap[] },
): UnlessAnswer | { readonly error: string } {
  const symbols = manaSymbolsOf(head.cost);
  const rest = res.queue.slice(1);
  if (action.kind === 'payManual') {
    const payment = payByTapping(state, payer, symbols, { ability: true }, action.taps);
    if ('error' in payment) return { error: payment.error };
    return { state: payment.state, events: payment.events, queue: paid(head, rest) };
  }
  const plan = planFor(state, payer, symbols, { ability: true });
  if (plan === null) return { error: 'You cannot pay that cost' };
  const applied = applyPaymentPlan(state, payer, plan, plan.lifePaid);
  return { state: applied.state, events: applied.events, queue: paid(head, rest) };
}
