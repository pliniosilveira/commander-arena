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
import type { DamageResume, NewDecision, PendingDecision } from '../state/decisions';
import type { GameEvent } from '../state/events';
import { getObject, seatsInOrder } from '../state/ops';
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
  minBlockersOf,
  requiredAttackers,
  validateAttacks,
  validateBlocks,
} from './combat-legality';
import { blockersLeft, combatCreatureLimit } from './combat-limits';
import { askingFlow } from './damage-order';
import { attackerDefender } from './defending';
import { applyExerts, canExert, type ExertAttack } from './exert';
import { applyPaymentPlan, payableSources, planFor } from './mana-engine';
import { type ManualTap, payByTapping } from './pay-manual';
import { grantPriority, type Outcome } from './priority';
import { hasRestriction } from './restrictions';
import { fail, ok, type Result } from './result';
import { setPending } from './set-pending';
import { sourceInfo } from './source-info';

/**
 * The players who declare blockers (CR 509.1, 508.5): the distinct defending players of the attackers still on the battlefield, in turn order from
 * the active player (CR 101.4). A player who has left the game is skipped.
 */
export function defendingSeats(state: GameState): SeatId[] {
  const live = (state.combat?.attackers ?? []).filter(
    (a) => state.objects[a.object]?.zone === 'battlefield',
  );
  const defenders = new Set<SeatId>();
  for (const a of live) {
    const seat = attackerDefender(state, a);
    if (seat !== null && state.seats[seat]?.hasLost !== true) defenders.add(seat);
  }
  return seatsInOrder(state, state.turn.activeSeat).filter((seat) => defenders.has(seat));
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
    ...(combatCreatureLimit(state, 'attack') === null
      ? {}
      : { maxAttackers: combatCreatureLimit(state, 'attack') as number }),
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
    case 'declareBlockers':
      return askBlockers(state, stepEvents);
    case 'firstStrikeDamage':
      return runDamageStep(beginFirstStrikeStep(state), 'firstStrike');
    case 'combatDamage':
      return runDamageStep(state, 'regular');
    default:
      return null;
  }
}

/**
 * The declare blockers question for the first defending player who has not declared yet (CR 509.1, in turn order from the active player). A defender with
 * no creature that can block declares nothing (CR 509.1h: the declaration is an event with no blockers; `unblockedAttackBatch` reads it). Priority goes
 * to the active player (CR 509.2) when every defender has declared. With one defender this is the whole step; with several, the declarations of all of
 * them are reported together as the last one is made, because the blockers are declared simultaneously (CR 509.1g).
 */
function askBlockers(state: GameState, prior: readonly GameEvent[]): Outcome {
  const active = state.turn.activeSeat;
  const defenders = defendingSeats(state);
  if (defenders.length <= 1) {
    const defender = defenders[0];
    const candidates = defender === undefined ? [] : blockCandidatesWithRules(state, defender);
    if (defender === undefined || candidates.length === 0) {
      const none: GameEvent[] =
        defender === undefined || state.combat === null
          ? []
          : [{ kind: 'blockersDeclared', seat: defender, blocks: [] }];
      return grantPriority(state, active, [...prior, ...none]);
    }
    return { state: setPending(state, blockDecision(state, defender, candidates)), events: [] };
  }
  let current = state;
  for (const defender of defenders) {
    if ((current.combat?.blockersDeclaredBy ?? []).includes(defender)) continue;
    const candidates = blockCandidatesWithRules(current, defender);
    if (candidates.length > 0) {
      return {
        state: setPending(current, blockDecision(current, defender, candidates)),
        events: [],
      };
    }
    current = withDeclaredBy(current, defender);
  }
  const declarations = blockersDeclaredEvents(current, defenders);
  const granted = grantPriority(current, active, [...prior, ...declarations]);
  return { state: granted.state, events: [...declarations, ...granted.events] };
}

function withDeclaredBy(state: GameState, seat: SeatId): GameState {
  const combat = state.combat;
  if (combat === null) return state;
  const done = combat.blockersDeclaredBy ?? [];
  return done.includes(seat)
    ? state
    : { ...state, combat: { ...combat, blockersDeclaredBy: [...done, seat] } };
}

/** One `blockersDeclared` for each defender, with the blocks of the creatures it attacks (CR 509.1g). */
function blockersDeclaredEvents(state: GameState, defenders: readonly SeatId[]): GameEvent[] {
  const combat = state.combat;
  if (combat === null) return [];
  return defenders.map((seat) => ({
    kind: 'blockersDeclared' as const,
    seat,
    blocks: combat.blocks.filter((b) => {
      const attacker = combat.attackers.find((a) => a.object === b.attacker);
      return attacker !== undefined && attackerDefender(state, attacker) === seat;
    }),
  }));
}

/**
 * What follows a declaration `declared` made by `seat` (CR 509.1, 509.2). With one defender priority goes to the active player. With several, the next
 * defender is asked, or, when `seat` was the last, priority goes to the active player and the declarations of all defenders are reported (their events
 * replace the one of `declared`). `lead` are the events of the answer that led here (a payment), which come first.
 */
function afterDeclaration(
  declared: { state: GameState; events: GameEvent[] },
  seat: SeatId,
  lead: readonly GameEvent[],
): Result {
  const active = declared.state.turn.activeSeat;
  if (defendingSeats(declared.state).length <= 1) {
    const granted = grantPriority(declared.state, active, declared.events); // CR 509.2
    return ok(granted.state, [...lead, ...declared.events, ...granted.events]);
  }
  const next = askBlockers(withDeclaredBy(declared.state, seat), []);
  return ok(next.state, [...lead, ...next.events]);
}

function blockCandidatesWithRules(state: GameState, defender: SeatId) {
  return blockCandidates(state, defender).map((c) => ({
    ...c,
    ...(hasRestriction(state, getObject(state, c.blocker), 'mustBlock')
      ? { mustBlock: true as const }
      : {}),
  }));
}

/** The declare blockers decision of `defender`: the attackers aimed at them (CR 508.5) and who can block them. */
function blockDecision(
  state: GameState,
  defender: SeatId,
  candidates: ReturnType<typeof blockCandidatesWithRules>,
): Extract<NewDecision, { kind: 'declareBlockers' }> {
  // An attacker that left the battlefield (a trigger of the declare attackers step can remove one) is no longer in combat (CR 506.4) and cannot be blocked.
  const attackers = (state.combat?.attackers ?? [])
    .filter(
      (a) =>
        state.objects[a.object]?.zone === 'battlefield' && attackerDefender(state, a) === defender,
    )
    .map((a) => ({
      attacker: a.object,
      target: a.target,
      minBlockers: minBlockersOf(state, getObject(state, a.object)),
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
    kind: 'declareBlockers',
    seat: defender,
    attackers,
    candidates,
    ...(blockersLeft(state) === null ? {} : { maxBlockers: blockersLeft(state) as number }),
    ...(tax.source === null
      ? {}
      : {
          blockCost: {
            cost: tax.cost,
            affordable: affordableBlockers(state, defender, tax.cost, candidates.length),
            source: tax.source,
          },
        }),
  };
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
  return askExerts(state, seat, attacks);
}

/**
 * CR 701.43d, 508.1g: "You may exert ~ as it attacks" is an optional cost to attack, chosen as the attackers are, before the cost of attacking is determined and
 * paid (CR 508.1h). Each attacker with the ability is asked in turn (a `confirmOptional` of purpose 'exert' that carries the declaration); with none left to ask
 * the declaration goes on.
 */
function askExerts(state: GameState, seat: SeatId, attacks: readonly ExertAttack[]): Result {
  const next = attacks.find((a) => a.exert === undefined && canExert(state, seat, a.attacker));
  if (next === undefined) return finishAttackers(state, seat, attacks);
  const info = sourceInfo(state, next.attacker);
  return ok(
    setPending(
      { ...state, pending: null },
      {
        kind: 'confirmOptional',
        seat,
        source: next.attacker,
        sourceName: info?.name ?? '',
        sourceOracleText: info?.oracleText ?? '',
        purpose: 'exert',
        exertAttacks: attacks.map((a) => ({
          attacker: a.attacker,
          target: a.target,
          ...(a.exert === undefined ? {} : { exert: a.exert }),
        })),
      },
    ),
    [],
  );
}

/**
 * The answer to "exert this creature as it attacks?" (CR 701.43d, 508.1g): the answer is kept with the declaration, then the next attacker with the ability is asked,
 * or the declaration goes on. `cancel` takes the declaration back and asks `declareAttackers` again (CR 733).
 */
export function answerExert(
  state: GameState,
  seat: SeatId,
  d: Extract<PendingDecision, { kind: 'confirmOptional' }>,
  answer: boolean | 'cancel',
): Result {
  if (answer === 'cancel') {
    const asked = declareAttackersDecision({ ...state, pending: null }, seat);
    if (asked === null) return fail('Nothing can attack');
    return ok(setPending({ ...state, pending: null }, asked), []);
  }
  const attacks = d.exertAttacks;
  if (attacks === undefined) return fail('No attack is being declared');
  return askExerts(
    { ...state, pending: null },
    seat,
    attacks.map((a) => (a.attacker === d.source ? { ...a, exert: answer } : a)),
  );
}

/** The cost of attacking and the declaration, once every exert question has been answered (CR 508.1h, 508.1k). */
function finishAttackers(state: GameState, seat: SeatId, attacks: readonly ExertAttack[]): Result {
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
        attacks: attacks.map((a) => ({
          attacker: a.attacker,
          target: a.target,
          ...(a.exert === true ? { exert: true as const } : {}),
        })),
      }),
      [],
    );
  }
  const declared = declareAttackers({ ...state, pending: null }, seat, attacks);
  // CR 701.43a, 508.1g: the exerted attackers do not untap next turn, and the abilities linked to the exert ability trigger with the declaration.
  const exerted = applyExerts(declared.state, seat, attacks);
  const events = [...declared.events, ...exerted.events];
  const granted = grantPriority(exerted.state, seat, events); // CR 508.2
  return ok(granted.state, [...events, ...granted.events]);
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
  attacks: readonly ExertAttack[],
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
  // CR 701.43a, 508.1g: the exerted attackers (chosen before the cost was determined) do not untap next turn, and the abilities linked to exert trigger.
  const exerted = applyExerts(paid.state, seat, attacks);
  const events = [
    ...declared.events.filter((e) => e.kind !== 'attackersDeclared'),
    ...paid.events,
    ...declaration,
    ...exerted.events,
  ];
  const granted = grantPriority(exerted.state, seat, events); // CR 508.2
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
  return afterDeclaration(declareBlockers({ ...state, pending: null }, seat, blocks), seat, []);
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
  return afterDeclaration(declareBlockers(paid.state, seat, blocks), seat, paid.events);
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
