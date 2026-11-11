// Slice soak (D-127): whole games with the 'upkeep' deck style (SYNTHETIC Echo, Cumulative upkeep and monarch cards)
// between random agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no rejected
// action, no agent error and consistent state after every action; the action log replays to the same final state;
// and every path of the slice occurs (checked from 100 games up). The count is `soakGames()` (D-126).
import { checkInvariants, type GameState, getView, stateHash } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { cardNameOf } from './game-names';
import {
  type StepInfo,
  smallGameConfig,
  stepGame,
  UPKEEP_NAMES,
  UPKEEP_STYLE_PAIRS,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  echoTriggers: number;
  echoAsked: number;
  echoPaid: number;
  echoDeclined: number;
  echoCasualPaid: number;
  echoCasualDeclined: number;
  /** An echo ability that was removed as it resolved because its permanent was gone. */
  echoFizzled: number;
  cumulativeTriggers: number;
  cumulativeAsked: number;
  cumulativePaid: number;
  cumulativeDeclined: number;
  cumulativeCasualPaid: number;
  cumulativeCasualDeclined: number;
  /** Questions with more than one age counter (the cost really grew). */
  cumulativeGrown: number;
  monarchChanges: number;
  monarchFromEffect: number;
  monarchStolen: number;
  monarchDraws: number;
  monarchHandedOn: number;
  viewsWithMonarch: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  echoTriggers: 0,
  echoAsked: 0,
  echoPaid: 0,
  echoDeclined: 0,
  echoCasualPaid: 0,
  echoCasualDeclined: 0,
  echoFizzled: 0,
  cumulativeTriggers: 0,
  cumulativeAsked: 0,
  cumulativePaid: 0,
  cumulativeDeclined: 0,
  cumulativeCasualPaid: 0,
  cumulativeCasualDeclined: 0,
  cumulativeGrown: 0,
  monarchChanges: 0,
  monarchFromEffect: 0,
  monarchStolen: 0,
  monarchDraws: 0,
  monarchHandedOn: 0,
  viewsWithMonarch: 0,
  byCard: new Map(),
});

/** The effect kind (and upkeep marker) of the ability on the stack with this id, in the state after a step. */
const abilityOf = (state: GameState, id: string) =>
  state.objects[id as never]?.stack?.ability ?? null;

/** Notes what one applied action did, for the paths this slice added. */
function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { after, events, before } = step;
  const asked = before.pending;

  // CR 725.1 (D-127): the monarch is public, and both seats see the same one.
  if (after.actionCount % 5 === 0) {
    for (const seat of [0, 1] as const) {
      const view = getView(after, seat);
      if (view.monarch !== after.monarch) throw new Error('the view says another monarch');
      if (view.monarch !== null) tally.viewsWithMonarch += 1;
    }
  }

  // The question of an upkeep keyword (D-127): what was answered, and by whom.
  if (asked?.kind === 'confirmOptional' && asked.upkeep !== undefined) {
    const accepted = step.action.kind === 'acceptOptional';
    if (asked.upkeep === 'echo') {
      tally.echoAsked += 1;
      if (accepted) tally.echoPaid += 1;
      else tally.echoDeclined += 1;
      if (casual.has(asked.seat)) {
        if (accepted) tally.echoCasualPaid += 1;
        else tally.echoCasualDeclined += 1;
      }
    } else {
      tally.cumulativeAsked += 1;
      if (accepted) tally.cumulativePaid += 1;
      else tally.cumulativeDeclined += 1;
      if (casual.has(asked.seat)) {
        if (accepted) tally.cumulativeCasualPaid += 1;
        else tally.cumulativeCasualDeclined += 1;
      }
      const source = before.objects[asked.source]?.stack?.source ?? null;
      const age = source === null ? 0 : (before.objects[source]?.counters.age ?? 0);
      if (age >= 2) tally.cumulativeGrown += 1;
    }
    // An accepted payment with mana in it is followed by the mana question; a declined one sacrifices at once.
    const hasMana = (asked.cost ?? []).some((c) => c.kind === 'mana');
    if (accepted && hasMana && after.pending?.kind !== 'payMana') {
      throw new Error('an accepted upkeep payment asks for no mana');
    }
    if (!accepted && !events.some((e) => e.kind === 'sacrificed')) {
      throw new Error('declining an upkeep payment did not sacrifice the permanent');
    }
  }

  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = cardNameOf(after, e.object);
      tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
    }
    if (e.kind === 'abilityTriggered') {
      const ability = abilityOf(after, e.stackObject);
      const effect = ability?.kind === 'triggered' ? ability.effect : null;
      if (effect?.kind === 'unlessPays' && effect.upkeep === 'echo') tally.echoTriggers += 1;
      if (effect?.kind === 'cumulativeUpkeep') tally.cumulativeTriggers += 1;
      if (after.objects[e.stackObject as never]?.stack?.inherent === 'monarchDraw') {
        tally.monarchDraws += 1;
      }
    }
    if (e.kind === 'fizzled' && e.reason === 'interveningIf') {
      const stack = before.objects[e.object]?.stack?.ability;
      if (
        stack?.kind === 'triggered' &&
        stack.interveningIf?.kind === 'cameUnderControlSinceLastUpkeep'
      ) {
        tally.echoFizzled += 1;
      }
    }
    if (e.kind === 'monarchChanged') {
      tally.monarchChanges += 1;
      if (e.to === null || (e.from !== null && after.result !== null)) tally.monarchHandedOn += 1;
      // What changed it: the steal trigger or a "become the monarch" effect.
      const resolved = events.find((x) => x.kind === 'resolved');
      const object = resolved?.kind === 'resolved' ? resolved.object : null;
      const inherent = object === null ? undefined : before.objects[object]?.stack?.inherent;
      if (inherent === 'monarchSteal') tally.monarchStolen += 1;
      else tally.monarchFromEffect += 1;
    }
  }
}

test(
  `${GAMES} upkeep games run clean, replay exactly and use every path of the slice`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = UPKEEP_STYLE_PAIRS[g % UPKEEP_STYLE_PAIRS.length] ?? ['upkeep', 'upkeep'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 9700 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 9700 + 2 * g + seat });
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
        const v = tally[key];
        if (typeof v === 'number') (total[key] as number) += v;
      }
      for (const [name, n] of tally.byCard)
        total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    const summary = {
      ...total,
      byCard: Object.fromEntries([...total.byCard].sort()),
      turnsMax: Math.max(...turns),
    };
    console.log(`${GAMES} upkeep games: ${JSON.stringify(summary)}`);

    expectPath(total.echoTriggers);
    expectPath(total.echoAsked);
    expectPath(total.echoPaid);
    expectPath(total.echoDeclined);
    expectPath(total.cumulativeTriggers);
    expectPath(total.cumulativeAsked);
    expectPath(total.cumulativePaid);
    expectPath(total.monarchChanges);
    expectPath(total.monarchFromEffect);
    expectPath(total.monarchDraws);
    expectPath(total.viewsWithMonarch);
    // Every upkeep card was cast at least once somewhere in the games.
    for (const name of UPKEEP_NAMES) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);
