// Slice soak (D-121, D-124): whole games (the `soakGames()` count, test/soak.ts) with the 'altCosts' deck style (SYNTHETIC Overload, Evoke, Dash,
// Spectacle, Escape and Unearth cards) between random agents, with CasualAgent in some seats. Every game finishes with a result, no
// fallback, no rejected action, no agent error and consistent state after every action; the action log
// replays to the same final state (the hash covers the alternative-cost marks and the delayed triggers); and
// every new path occurs: overloaded spells resolving, evoked creatures sacrificed, dashed creatures attacking
// the turn they arrive and returned to the hand at the end step, and the CasualAgent making each choice.
import { checkInvariants, stateHash } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { cardNameOf } from './game-names';
import {
  ALT_COST_NAMES,
  ALT_COST_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  overloadCasts: number;
  overloadResolved: number;
  evokeCasts: number;
  evokeSacrifices: number;
  evokeOrdered: number;
  dashCasts: number;
  dashAttacks: number;
  dashReturns: number;
  dashStale: number;
  spectacleCasts: number;
  casualSpectacle: number;
  escapeCasts: number;
  casualEscape: number;
  escapedPermanents: number;
  escapeCounters: number;
  unearths: number;
  casualUnearth: number;
  unearthAttacks: number;
  unearthExiledAtEnd: number;
  unearthExiledInstead: number;
  casualOverload: number;
  casualEvoke: number;
  casualDash: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  overloadCasts: 0,
  overloadResolved: 0,
  evokeCasts: 0,
  evokeSacrifices: 0,
  evokeOrdered: 0,
  dashCasts: 0,
  dashAttacks: 0,
  dashReturns: 0,
  dashStale: 0,
  spectacleCasts: 0,
  casualSpectacle: 0,
  escapeCasts: 0,
  casualEscape: 0,
  escapedPermanents: 0,
  escapeCounters: 0,
  unearths: 0,
  casualUnearth: 0,
  unearthAttacks: 0,
  unearthExiledAtEnd: 0,
  unearthExiledInstead: 0,
  casualOverload: 0,
  casualEvoke: 0,
  casualDash: 0,
  byCard: new Map(),
});

/** Notes what one applied action did, for the paths this slice added. */
function note(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events } = step;
  const d = after.pending;
  if (d?.kind === 'orderTriggers' && d.triggers.some((t) => /Evoke/.test(t.sourceName))) {
    tally.evokeOrdered += 1;
  }
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = cardNameOf(after, e.object);
      tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
      const mine = casual.has(e.seat);
      if (e.alternative === 'overload') {
        tally.overloadCasts += 1;
        if (mine) tally.casualOverload += 1;
      } else if (e.alternative === 'evoke') {
        tally.evokeCasts += 1;
        if (mine) tally.casualEvoke += 1;
      } else if (e.alternative === 'dash') {
        tally.dashCasts += 1;
        if (mine) tally.casualDash += 1;
      } else if (e.alternative === 'spectacle') {
        tally.spectacleCasts += 1;
        if (mine) tally.casualSpectacle += 1;
      } else if (e.alternative === 'escape') {
        tally.escapeCasts += 1;
        if (mine) tally.casualEscape += 1;
      }
    }
    if (e.kind === 'resolved' && before.objects[e.object]?.stack?.alt === 'overload') {
      tally.overloadResolved += 1;
    }
    // An escaped creature resolved onto the battlefield, and "escapes with" counters were put on it.
    if (e.kind === 'resolved' && before.objects[e.object]?.stack?.alt === 'escape') {
      const entered = Object.values(after.objects).find(
        (o) => o.zone === 'battlefield' && o.alt === 'escape' && before.objects[o.id] === undefined,
      );
      if (entered !== undefined) {
        tally.escapedPermanents += 1;
        if ((entered.counters['+1/+1'] ?? 0) > 0) tally.escapeCounters += 1;
      }
    }
    if (e.kind === 'sacrificed' && before.objects[e.permanent]?.alt === 'evoke') {
      tally.evokeSacrifices += 1;
    }
    if (e.kind === 'attackersDeclared') {
      for (const a of e.attackers) {
        if (before.objects[a.object]?.alt === 'dash') tally.dashAttacks += 1;
        if (before.objects[a.object]?.alt === 'unearth') tally.unearthAttacks += 1;
      }
    }
    // Unearth: an activation from the graveyard, and what happens to the creature it returns.
    if (e.kind === 'abilityActivated' && before.objects[e.source]?.zone === 'graveyard') {
      tally.unearths += 1;
      if (casual.has(e.seat)) tally.casualUnearth += 1;
    }
    if (
      e.kind === 'zoneChanged' &&
      e.fromZone === 'battlefield' &&
      before.objects[e.from]?.alt === 'unearth'
    ) {
      // Every way out of the battlefield for an unearthed creature is exile (CR 702.84a).
      if (e.toZone !== 'exile') throw new Error('an unearthed creature left for ' + e.toZone);
      if (before.turn.step === 'end') tally.unearthExiledAtEnd += 1;
      else tally.unearthExiledInstead += 1;
    }
    if (e.kind === 'zoneChanged' && e.fromZone === 'battlefield' && e.toZone === 'hand') {
      if (before.objects[e.from]?.alt === 'dash') tally.dashReturns += 1;
    }
    // A delayed trigger that fired for a permanent that was no longer there: it resolved to nothing.
    if (e.kind === 'abilityTriggered' && e.abilityIndex === -1) {
      if (before.objects[e.source] === undefined) tally.dashStale += 1;
    }
  }
}

test(
  `${GAMES} alternative-cost games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = ALT_COST_STYLE_PAIRS[g % ALT_COST_STYLE_PAIRS.length] ?? [
        'altCosts',
        'altCosts',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 9000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 9000 + 2 * g + seat });
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
      // The log replays to the same game (hashing covers `alt` and the delayed triggers).
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
    console.log(`100 alternative-cost games: ${JSON.stringify(summary)}`);

    expectPath(total.overloadCasts);
    expectPath(total.overloadResolved);
    expectPath(total.evokeCasts);
    expectPath(total.evokeSacrifices);
    expectPath(total.evokeOrdered);
    expectPath(total.dashCasts);
    expectPath(total.dashAttacks);
    expectPath(total.dashReturns);
    expectPath(total.spectacleCasts);
    expectPath(total.casualSpectacle);
    expectPath(total.escapeCasts);
    expectPath(total.casualEscape);
    expectPath(total.escapedPermanents);
    expectPath(total.unearths);
    expectPath(total.casualUnearth);
    expectPath(total.unearthAttacks);
    expectPath(total.unearthExiledAtEnd);
    expectPath(total.casualOverload);
    expectPath(total.casualEvoke);
    expectPath(total.casualDash);
    // Every alternative-cost card was cast at least once somewhere in the 100 games.
    for (const name of ALT_COST_NAMES) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);
