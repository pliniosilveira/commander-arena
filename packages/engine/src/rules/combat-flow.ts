/**
 * Combat steps as they run in a turn (CR 506-511): the turn-based action at the start of each
 * combat step, and the answers to the combat decisions. The step order lives in flow.ts.
 *
 * The cost of attacking (CR 508.1h, D-125): a declaration that a tax covers asks for the mana first (`payMana`
 * with purpose 'attackTax'); the attackers are declared when it is paid and the declaration is asked again when it
 * is taken back.
 *
 * Skipping (CR 508.8): with no attackers declared, the declare blockers and combat damage steps are
 * skipped; the other combat steps still give priority (CR 508.2, 511.1).
 */
import type { ObjectId, SeatId } from '../ids';
import type { AttackTarget, DamageAssignment, DamageChoice } from '../state/combat-types';
import type { DamageResume, NewDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getObject, opponentsOf } from '../state/ops';
import type { GameState, StepId } from '../state/types';
import {
  attackCostsFor,
  attackTaxSymbols,
  firstTaxSource,
  withAttackersTapped,
} from './attack-tax';
import { affordableBlockers, blockTax, blockTaxSymbols } from './block-tax';
import {
  beginFirstStrikeStep,
  buildDamagePlan,
  type DamageStep,
  dealCombatDamage,
  declareAttackers,
  declareBlockers,
  needsFirstStrikeStep,
  validateAssignments,
} from './combat';
import {
  attackCandidates,
  blockCandidates,
  requiredAttackers,
  validateAttacks,
  validateBlocks,
} from './combat-legality';
import { askingFlow } from './damage-order';
import { hasKeyword } from './keywords';
import { applyPaymentPlan, payableSources, planFor } from './mana-engine';
import { type ManualTap, payByTapping } from './pay-manual';
import { grantPriority, type Outcome } from './priority';
import { hasRestriction } from './restrictions';
import { fail, ok, type Result } from './result';
import { setPending } from './set-pending';

/** The player who declares blockers: the opponent being attacked (two seats today). */
export function defendingSeat(state: GameState): SeatId | null {
  return opponentsOf(state, state.turn.activeSeat)[0] ?? null;
}

/** The step that follows `step` within the combat phase, or null to use the ordinary order. */
export function nextCombatStep(state: GameState, step: StepId): StepId | null {
  switch (step) {
    case 'declareAttackers':
      // CR 508.8: no attackers means no declare blockers or combat damage step.
      return (state.combat?.attackers.length ?? 0) > 0 ? 'declareBlockers' : 'endOfCombat';
    case 'declareBlockers':
      return needsFirstStrikeStep(state) ? 'firstStrikeDamage' : 'combatDamage';
    case 'firstStrikeDamage':
      return 'combatDamage';
    case 'combatDamage':
      return 'endOfCombat';
    default:
      return null;
  }
}

/**
 * The declare attackers question for `seat` (CR 508.1): who can attack what, who must, and what attacking costs
 * (D-125). Null when no creature can attack.
 */
export function declareAttackersDecision(
  state: GameState,
  seat: SeatId,
): Extract<NewDecision, { kind: 'declareAttackers' }> | null {
  const candidates = attackCandidates(state, seat);
  if (candidates.length === 0) return null;
  const attackCosts = attackCostsFor(state, seat, candidates);
  return {
    kind: 'declareAttackers',
    seat,
    candidates,
    mustAttack: requiredAttackers(state, candidates),
    ...(attackCosts.length === 0 ? {} : { attackCosts }),
  };
}

/** The turn-based action of a combat step; null for steps that are not combat steps. */
export function beginCombatStep(
  state: GameState,
  step: StepId,
  stepEvents: readonly GameEvent[] = [],
): Outcome | null {
  const active = state.turn.activeSeat;
  switch (step) {
    case 'beginningOfCombat':
      return null;
    case 'declareAttackers': {
      const decision = declareAttackersDecision(state, active);
      if (decision === null) {
        return grantPriority({ ...state, combat: null }, active, stepEvents);
      }
      return { state: setPending(state, decision), events: [] };
    }
    case 'declareBlockers': {
      const defender = defendingSeat(state);
      const candidates = defender === null ? [] : blockCandidates(state, defender);
      if (defender === null || candidates.length === 0) {
        return grantPriority(state, active, stepEvents);
      }
      // An attacker that left the battlefield (a trigger of the declare attackers step can remove
      // one) is no longer in combat (CR 506.4) and cannot be blocked.
      const attackers = (state.combat?.attackers ?? [])
        .filter((a) => state.objects[a.object]?.zone === 'battlefield')
        .map((a) => ({
          attacker: a.object,
          target: a.target,
          minBlockers: hasKeyword(state, getObject(state, a.object), 'menace') ? 2 : 1,
          // CR 509.1b (D-133): "can't be blocked by more than one creature".
          ...(hasRestriction(state, getObject(state, a.object), 'cantBeBlockedByMoreThanOne')
            ? { maxBlockers: 1 }
            : {}),
          // CR 509.1c (D-206): "must be blocked if able".
          ...(hasRestriction(state, getObject(state, a.object), 'mustBeBlocked')
            ? { mustBeBlocked: true as const }
            : {}),
        }));
      // D-149, CR 509.1d: what blocking costs, when something taxes it.
      const tax = blockTax(state);
      return {
        state: setPending(state, {
          kind: 'declareBlockers',
          seat: defender,
          attackers,
          candidates,
          ...(tax.source === null
            ? {}
            : {
                blockCost: {
                  cost: tax.cost,
                  affordable: affordableBlockers(state, defender, tax.cost, candidates.length),
                  source: tax.source,
                },
              }),
        }),
        events: [],
      };
    }
    case 'firstStrikeDamage':
      return runDamageStep(beginFirstStrikeStep(state), 'firstStrike');
    case 'combatDamage':
      return runDamageStep(state, 'regular');
    default:
      return null;
  }
}

function runDamageStep(state: GameState, step: DamageStep): Outcome {
  const plan = buildDamagePlan(state, step);
  const active = state.turn.activeSeat;
  if (plan.choices.length > 0) {
    return {
      state: setPending(state, { kind: 'assignDamage', seat: active, step, choices: plan.choices }),
      events: [],
    };
  }
  return dealBatch(state, step, plan.auto, []);
}

/**
 * Deals the combat damage of a step, all of it (CR 510.2), with the answers given so far to its replacement questions (CR 616.1, D-191).
 * The batch is simulated first: when an event needs one more answer, nothing has been dealt and the decision carries the plan (`resume`),
 * so the answer deals the same batch again. `lead` are the events of the answer that led here, which come first.
 */
function dealBatch(
  state: GameState,
  step: DamageStep,
  assignments: readonly DamageAssignment[],
  answers: readonly string[],
  lead: readonly GameEvent[] = [],
): Outcome {
  const dealt = dealCombatDamage(state, assignments, askingFlow(answers));
  if (dealt.kind === 'asked') {
    const { decision } = dealt;
    const resume = { step, assignments: [...assignments], answers: [...answers] };
    return {
      state: setPending(state, { ...decision, replacement: { ...decision.replacement, resume } }),
      events: [...lead],
    };
  }
  const events = [...lead, ...dealt.events];
  const granted = grantPriority(dealt.state, state.turn.activeSeat, events); // CR 510.3
  return { state: granted.state, events: [...events, ...granted.events] };
}

/**
 * The answer to a replacement question about combat damage (CR 616.1, D-191): the key is added to the answers and the batch is dealt again,
 * to the next question or to the end. The caller has checked the key against the decision.
 */
export function answerCombatReplacement(
  state: GameState,
  resume: DamageResume,
  option: string,
  chosen: GameEvent,
): Outcome {
  return dealBatch(
    { ...state, pending: null },
    resume.step,
    resume.assignments,
    [...resume.answers, option],
    [chosen],
  );
}

export function answerAttackers(
  state: GameState,
  seat: SeatId,
  attacks: readonly { attacker: ObjectId; target: AttackTarget }[],
): Result {
  const error = validateAttacks(state, seat, attacks);
  if (error) return fail(error);
  const symbols = attackTaxSymbols(state, attacks);
  // CR 508.1h: the creatures are chosen, so the total cost is determined; it is paid before they are declared.
  const source = symbols.length === 0 ? null : firstTaxSource(state, attacks);
  if (source !== null) {
    const tapped = withAttackersTapped(state, seat, attacks); // CR 508.1f: tapped before the cost is paid
    return ok(
      setPending(state, {
        kind: 'payMana',
        seat,
        source,
        totalCost: symbols,
        manaSources: payableSources(tapped, seat),
        purpose: 'attackTax',
        attacks: attacks.map((a) => ({ attacker: a.attacker, target: a.target })),
      }),
      [],
    );
  }
  const declared = declareAttackers({ ...state, pending: null }, seat, attacks);
  const granted = grantPriority(declared.state, seat, declared.events); // CR 508.2
  return ok(granted.state, [...declared.events, ...granted.events]);
}

/**
 * The answer to the payment of the cost of attacking (CR 508.1h, D-125). `cancel` takes the declaration back
 * (CR 733) and asks `declareAttackers` again. `payAuto` or `payManual` taps the attackers (CR 508.1f), pays the
 * cost with them tapped, and then declares them (CR 508.1k); a payment that does not cover the cost changes
 * nothing and the question stays.
 */
export function answerAttackPayment(
  state: GameState,
  seat: SeatId,
  attacks: readonly { attacker: ObjectId; target: AttackTarget }[],
  action:
    | { readonly kind: 'cancel' }
    | { readonly kind: 'payAuto' }
    | { readonly kind: 'payManual'; readonly taps: readonly ManualTap[] },
): Result {
  if (action.kind === 'cancel') {
    const asked = declareAttackersDecision({ ...state, pending: null }, seat);
    if (asked === null) return fail('Nothing can attack');
    return ok(setPending({ ...state, pending: null }, asked), []);
  }
  const symbols = attackTaxSymbols(state, attacks);
  const declared = declareAttackers({ ...state, pending: null }, seat, attacks);
  let paid: { state: GameState; events: GameEvent[] };
  if (action.kind === 'payManual') {
    const r = payByTapping(declared.state, seat, symbols, { ability: true }, action.taps);
    if ('error' in r) return fail(r.error);
    paid = r;
  } else {
    const plan = planFor(declared.state, seat, symbols, { ability: true });
    if (plan === null) return fail('You cannot pay that cost');
    paid = applyPaymentPlan(declared.state, seat, plan, plan.lifePaid);
  }
  // The attackers tapped, the mana paid, then the attackers are declared (CR 508.1f, 508.1h, 508.1k).
  const declaration = declared.events.filter((e) => e.kind === 'attackersDeclared');
  const events = [
    ...declared.events.filter((e) => e.kind !== 'attackersDeclared'),
    ...paid.events,
    ...declaration,
  ];
  const granted = grantPriority(paid.state, seat, events); // CR 508.2
  return ok(granted.state, [...events, ...granted.events]);
}

export function answerBlockers(
  state: GameState,
  seat: SeatId,
  blocks: readonly { blocker: ObjectId; attacker: ObjectId }[],
): Result {
  const error = validateBlocks(state, seat, blocks);
  if (error) return fail(error);
  // CR 509.1d (D-149): the total cost to block is determined once the blockers are chosen, and paid before they are declared.
  const symbols = blockTaxSymbols(state, blocks.length);
  const source = symbols.length === 0 ? null : blockTax(state).source;
  if (source !== null) {
    return ok(
      setPending(state, {
        kind: 'payMana',
        seat,
        source,
        totalCost: symbols,
        manaSources: payableSources(state, seat),
        purpose: 'blockTax',
        blocks: blocks.map((b) => ({ blocker: b.blocker, attacker: b.attacker })),
      }),
      [],
    );
  }
  const declared = declareBlockers({ ...state, pending: null }, seat, blocks);
  const granted = grantPriority(declared.state, state.turn.activeSeat, declared.events); // CR 509.2
  return ok(granted.state, [...declared.events, ...granted.events]);
}

/**
 * The answer to the payment of the cost of blocking (CR 509.1d, D-149). `cancel` takes the declaration back (CR 733) and asks
 * `declareBlockers` again. `payAuto` or `payManual` pays the cost and then declares the blockers; a payment that does not cover
 * the cost changes nothing and the question stays.
 */
export function answerBlockPayment(
  state: GameState,
  seat: SeatId,
  blocks: readonly { blocker: ObjectId; attacker: ObjectId }[],
  action:
    | { readonly kind: 'cancel' }
    | { readonly kind: 'payAuto' }
    | { readonly kind: 'payManual'; readonly taps: readonly ManualTap[] },
): Result {
  const cleared: GameState = { ...state, pending: null };
  if (action.kind === 'cancel') {
    const asked = beginCombatStep(cleared, 'declareBlockers');
    return asked === null ? fail('Nothing can block') : ok(asked.state, asked.events);
  }
  const symbols = blockTaxSymbols(state, blocks.length);
  let paid: { state: GameState; events: GameEvent[] };
  if (action.kind === 'payManual') {
    const r = payByTapping(cleared, seat, symbols, { ability: true }, action.taps);
    if ('error' in r) return fail(r.error);
    paid = r;
  } else {
    const plan = planFor(cleared, seat, symbols, { ability: true });
    if (plan === null) return fail('You cannot pay that cost');
    paid = applyPaymentPlan(cleared, seat, plan, plan.lifePaid);
  }
  const declared = declareBlockers(paid.state, seat, blocks);
  const granted = grantPriority(declared.state, state.turn.activeSeat, declared.events); // CR 509.2
  const events = [...paid.events, ...declared.events, ...granted.events];
  return ok(granted.state, events);
}

export function answerDamage(
  state: GameState,
  step: DamageStep,
  assignments: readonly DamageAssignment[],
): Result {
  const plan = buildDamagePlan(state, step);
  const error = validateAssignments(plan.choices, assignments);
  if (error) return fail(error);
  const dealt = dealBatch({ ...state, pending: null }, step, [...plan.auto, ...assignments], []);
  return ok(dealt.state, dealt.events);
}

/** A default legal division for the AI and UI: lethal to each blocker in order, the rest onward. */
export function defaultDivision(choices: readonly DamageChoice[]): DamageAssignment[] {
  const out: DamageAssignment[] = [];
  for (const c of choices) {
    let left = c.power;
    for (const [i, b] of c.blockers.entries()) {
      const isLast = i === c.blockers.length - 1;
      // Without a trample target the last blocker takes whatever remains.
      const give = isLast && c.tramplesOver === null ? left : Math.min(left, b.lethal);
      if (give > 0)
        out.push({ source: c.source, to: { kind: 'object', id: b.object }, amount: give });
      left -= give;
    }
    if (left > 0 && c.tramplesOver) {
      out.push({ source: c.source, to: c.tramplesOver, amount: left });
    }
  }
  return out;
}
