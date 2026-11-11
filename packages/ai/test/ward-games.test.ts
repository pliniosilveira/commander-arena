// Soak: whole games (the `soakGames()` count, test/soak.ts) with the 'ward' deck style (SYNTHETIC creatures with Ward {1}, Ward {2} and
// Ward: pay 2 life, token-copy and "becomes a copy" spells, legendary creatures, a creature that
// copies itself; CR 702.21, 707.2, 613.2a, 704.5j) between random agents, with CasualAgent in some
// seats. Every game finishes with a result, no fallback, no rejected action, no agent error and
// consistent state after every action; the action log replays to the same final state (the hash
// covers the copy effects and the stack data of ward triggers); and every new path occurs: ward
// triggers, the question answered both ways by random agents, mana and life paid, spells and
// abilities countered by ward, the payment backed out of, token copies, copy effects, the legend
// rule asked (and answered by CasualAgent with the permanent it values most), and the casual agent
// paying ward on its own spells.
import {
  type Action,
  applyAction,
  checkInvariants,
  type GameEvent,
  type GameState,
  getLegalActions,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  type StepInfo,
  smallGameConfig,
  stepGame,
  WARD_CARD_NAMES,
  WARD_STYLE_PAIRS,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  wardTriggers: number;
  asked: number;
  accepted: number;
  declined: number;
  paidMana: number;
  paidLife: number;
  backedOut: number;
  unaskedCounters: number;
  counteredByWard: number;
  spellsCountered: number;
  abilitiesCountered: number;
  tokenCopies: number;
  becomeCopies: number;
  legendRules: number;
  legendRuleCasual: number;
  casualKeptBest: number;
  casualPaid: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  wardTriggers: 0,
  asked: 0,
  accepted: 0,
  declined: 0,
  paidMana: 0,
  paidLife: 0,
  backedOut: 0,
  unaskedCounters: 0,
  counteredByWard: 0,
  spellsCountered: 0,
  abilitiesCountered: 0,
  tokenCopies: 0,
  becomeCopies: 0,
  legendRules: 0,
  legendRuleCasual: 0,
  casualKeptBest: 0,
  casualPaid: 0,
  byCard: new Map(),
});

const nameOf = (state: GameState, id: ObjectId): string => {
  const obj = state.objects[id] ?? state.lki[id]?.object;
  if (!obj) return '?';
  if (obj.token !== null) return obj.token.characteristics.name;
  if (obj.card === null) return '?';
  const card = state.cards[obj.card];
  return card === undefined ? '?' : (state.definitions[card.definition]?.name ?? '?');
};

/** Whether an object on the stack is an ability of a ward permanent resolving or waiting. */
const isWardTrigger = (state: GameState, id: ObjectId): boolean => {
  const stack = state.objects[id]?.stack;
  const ability = stack?.ability;
  return (
    ability?.kind === 'triggered' &&
    ability.trigger.kind === 'becomesTarget' &&
    ability.effect.kind === 'counterUnlessPays'
  );
};

function noteDecision(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const d = step.before.pending;
  const action: Action = step.action;
  const isNew =
    (d?.kind === 'confirmOptional' && d.purpose === 'ward') ||
    (d?.kind === 'payMana' && d.purpose === 'ward') ||
    (d?.kind === 'choosePermanent' && d.purpose === 'legendRule');
  if (d !== null && isNew) {
    // The legal actions of the new decisions agree with the engine: the chosen action is listed and
    // every listed action (but conceding) is accepted.
    const legal = getLegalActions(step.before, d.seat);
    expect(legal.some((a) => JSON.stringify(a) === JSON.stringify(action))).toBe(true);
    for (const a of legal) {
      if (a.kind !== 'concede') expect(applyAction(step.before, d.seat, a).ok).toBe(true);
    }
  }
  if (d?.kind === 'confirmOptional' && d.purpose === 'ward') {
    tally.asked += 1;
    if (action.kind === 'acceptOptional') {
      tally.accepted += 1;
      if (casual.has(step.seat)) tally.casualPaid += 1;
      if (d.cost?.some((c) => c.kind === 'payLife') === true) tally.paidLife += 1;
    }
    if (action.kind === 'declineOptional') tally.declined += 1;
    // The question is only asked of the controller of the countered spell or ability, who can pay.
    expect(step.seat).toBe(step.before.objects[d.subject as ObjectId]?.controller);
  }
  if (d?.kind === 'payMana' && d.purpose === 'ward') {
    if (action.kind === 'payAuto' || action.kind === 'payManual') tally.paidMana += 1;
    if (action.kind === 'cancel') tally.backedOut += 1;
  }
  if (d?.kind === 'choosePermanent' && d.purpose === 'legendRule') {
    tally.legendRules += 1;
    expect(d.legal.length).toBeGreaterThanOrEqual(2);
    if (casual.has(step.seat)) {
      tally.legendRuleCasual += 1;
      // The casual agent keeps a permanent with at least as many counters and attachments as any
      // other of the group, never an obviously worse one.
      const chosen = action.kind === 'choosePermanents' ? action.objects[0] : undefined;
      const score = (id: ObjectId): number => {
        const o = step.before.objects[id];
        const counters = Object.values(o?.counters ?? {}).reduce((n, c) => n + c, 0);
        const attached = Object.values(step.before.objects).filter((x) => x.attachedTo === id);
        return counters + attached.length;
      };
      if (chosen !== undefined && d.legal.every((id) => score(chosen) >= score(id))) {
        tally.casualKeptBest += 1;
      }
    }
  }
}

function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events } = step;
  noteDecision(tally, casual, step);
  const resolvingWard = before.stack[before.stack.length - 1];
  const wardWasResolving = resolvingWard !== undefined && isWardTrigger(before, resolvingWard);
  for (const e of events as readonly GameEvent[]) {
    if (e.kind === 'spellCast') {
      const name = nameOf(after, e.object);
      tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
    }
    if (e.kind === 'abilityTriggered' && isWardTrigger(after, e.stackObject)) {
      tally.wardTriggers += 1;
    }
    if (e.kind === 'countered') {
      const wasSpell = before.objects[e.object]?.stack?.kind === 'spell';
      if (wasSpell) tally.spellsCountered += 1;
      else if (before.objects[e.object]?.stack?.kind === 'ability') tally.abilitiesCountered += 1;
      // Only a ward trigger counters by itself as the top of the stack resolves: a spell cast by an
      // opponent's Counterspell would be on top with another object under it.
      if (wardWasResolving) {
        tally.counteredByWard += 1;
        if (step.before.pending?.kind === 'priority') tally.unaskedCounters += 1;
      }
    }
    // A token copy has the name of a card in the game; the predefined tokens have their own names.
    if (e.kind === 'tokenCreated' && after.definitions.some((d) => d.name === e.name)) {
      tally.tokenCopies += 1;
    }
  }
  for (const effect of after.continuousEffects) {
    if (effect.change.kind !== 'copy') continue;
    if (!before.continuousEffects.some((b) => b.id === effect.id)) tally.becomeCopies += 1;
  }
}

test(
  `${GAMES} ward, copy and legend-rule games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = WARD_STYLE_PAIRS[g % WARD_STYLE_PAIRS.length] ?? ['ward', 'ward'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 11000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 11000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const tally = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        note(tally, casual, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
      for (const key of Object.keys(tally) as (keyof Tally)[]) {
        if (key === 'byCard') continue;
        (total[key] as number) += tally[key] as number;
      }
      for (const [k, n] of tally.byCard) total.byCard.set(k, (total.byCard.get(k) ?? 0) + n);
    }
    console.log(
      `100 ward games: ${JSON.stringify({
        ...total,
        byCard: Object.fromEntries([...total.byCard].sort()),
        turnsMax: Math.max(...turns),
      })}`,
    );

    expectPath(total.wardTriggers);
    expectPath(total.asked);
    expectPath(total.accepted);
    expectPath(total.declined);
    expectPath(total.paidMana);
    expectPath(total.paidLife);
    expectPath(total.counteredByWard);
    expectPath(total.unaskedCounters);
    expectPath(total.spellsCountered);
    expectPath(total.abilitiesCountered);
    expectPath(total.tokenCopies);
    expectPath(total.becomeCopies);
    expectPath(total.legendRules);
    expectPath(total.legendRuleCasual);
    // The casual agent always keeps a best permanent, and pays ward when it is asked.
    expect(total.casualKeptBest).toBe(total.legendRuleCasual);
    expectPath(total.casualPaid);
    for (const name of WARD_CARD_NAMES) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(300_000),
);
