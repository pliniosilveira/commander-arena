// Slice soak (D-189): whole games with the 'korvoldControl' deck style (SYNTHETIC cards of the Korvold slice 8a: control of a permanent until end of turn,
// until the end of the controller's next turn, for as long as the controller controls the permanent with the ability, and with no duration, and "whenever an
// opponent taps an artifact for mana", with mana rocks and Treasures to take) between random agents, with CasualAgent in some seats. Every game finishes
// with a result, no fallback, no rejected action and consistent state after every action; the action log replays to the same final state; and rules of the
// slice are restated from the events and the state, apart from the engine: a card of another player goes to its owner's graveyard when it dies, no control
// effect outlives the end of the turn it was waiting for, and a creature taken during a turn attacks only with haste (CR 302.6).
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  checkInvariants,
  type GameState,
  getView,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  KORVOLD_CONTROL_NAMES,
  KORVOLD_CONTROL_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  controlChanges: number;
  nabberTriggers: number;
  takenAttackers: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  controlChanges: 0,
  nabberTriggers: 0,
  takenAttackers: 0,
  byCard: new Map(),
});

interface Memory {
  /** The permanents whose controller changed in the turn so far. */
  changedThisTurn: Set<ObjectId>;
}

function nameOf(state: GameState, id: ObjectId): string {
  const obj = state.objects[id];
  if (obj === undefined) return '?';
  if (obj.token !== null) return obj.token.characteristics.name;
  const card = obj.card == null ? undefined : state.cards[obj.card];
  return card === undefined
    ? '?'
    : (state.definitions[card.definition]?.faces[obj.face ?? 0]?.name ?? '?');
}

function checkRules(t: Tally, step: StepInfo, memory: Memory): void {
  const { before, after, events } = step;

  for (const e of events) {
    if (e.kind === 'turnBegan') {
      memory.changedThisTurn = new Set();
      // CR 514.2: an "until end of turn" effect ended with the turn before.
      if (
        after.continuousEffects.some((c) => c.until === 'endOfTurn' && c.change.kind === 'control')
      )
        throw new Error('a control effect of the turn outlived it');
    }
    if (e.kind === 'controlChanged') {
      t.controlChanges += 1;
      memory.changedThisTurn.add(e.object);
      if (e.from === e.to) throw new Error('a change of controller that changed nothing');
    }
    if (e.kind === 'spellCast') {
      const spell = after.objects[e.object];
      const card = spell?.card == null ? undefined : after.cards[spell.card];
      const name =
        card === undefined
          ? undefined
          : after.definitions[card.definition]?.faces[spell?.face ?? 0]?.name;
      if (name !== undefined) t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
    }
    // CR 302.6: a creature that came under a player's control this turn attacks only with haste (the engine's own cards give it with an effect).
    if (e.kind === 'attackersDeclared') {
      const view = getView(after, e.seat);
      for (const a of e.attackers) {
        if (!memory.changedThisTurn.has(a.object)) continue;
        t.takenAttackers += 1;
        const seen = view.battlefield.find((o) => o.id === a.object);
        if (seen !== undefined && seen.controller === e.seat && !seen.keywords.includes('haste')) {
          throw new Error(`${seen.name} attacked the turn it was taken, without haste`);
        }
      }
    }
  }

  // No control effect that waits for a turn of a player is left when that turn has ended (CR 514.2, 500.1).
  for (const c of after.continuousEffects) {
    if (c.change.kind !== 'control' || typeof c.until !== 'object' || c.until.kind !== 'turnEnd')
      continue;
    const taken = after.seats[c.until.seat]?.turnsTaken ?? 0;
    if (c.until.turnsTaken < taken)
      throw new Error('a control effect outlived the turn it waited for');
  }

  // The Nabber's ability goes on the stack for a tap of an opponent artifact: count the abilities that are on the stack as they appear.
  for (const id of after.stack) {
    if (before.stack.includes(id)) continue;
    const ability = after.objects[id]?.stack?.ability;
    if (ability?.kind === 'triggered' && ability.trigger?.kind === 'tapsForMana')
      t.nabberTriggers += 1;
  }

  // A card of another player that left the battlefield is in its owner's graveyard (CR 400.3), never in the controller's.
  for (const e of events) {
    if (e.kind !== 'zoneChanged' || e.toZone !== 'graveyard' || e.fromZone !== 'battlefield')
      continue;
    const from = before.objects[e.from as ObjectId];
    const now = after.objects[e.to];
    if (
      from !== undefined &&
      now !== undefined &&
      from.token === null &&
      now.zoneOwner !== from.owner
    ) {
      throw new Error("a card went to a graveyard that is not its owner's");
    }
  }

  // The view puts a permanent on the side of the player who controls it, and the owner is never changed (CR 108.3, 613.1b).
  for (const seat of [0, 1] as const) {
    for (const o of getView(after, seat).battlefield) {
      const real = after.objects[o.id];
      if (real === undefined) continue;
      if (o.owner !== real.owner) throw new Error('the owner of a permanent changed');
      const effects = after.continuousEffects.filter(
        (c) => c.change.kind === 'control' && c.objects.includes(o.id),
      );
      const last = effects.at(-1);
      const expected = last?.change.kind === 'control' ? last.change.seat : real.controller;
      if (o.controller !== expected) {
        throw new Error(`${nameOf(after, o.id)} is shown on the wrong side of the table`);
      }
    }
  }
}

test(
  `${GAMES} Korvold control games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = KORVOLD_CONTROL_STYLE_PAIRS[g % KORVOLD_CONTROL_STYLE_PAIRS.length] ?? [
        'korvoldControl',
        'korvoldControl',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 20500 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 20500 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const memory: Memory = { changedThisTurn: new Set() };
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step, memory);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      for (const key of Object.keys(t) as (keyof Tally)[]) {
        const v = t[key];
        if (typeof v === 'number') (total[key] as number) += v;
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} Korvold control games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );

    // Every card of the slice was cast at least once somewhere in the games.
    for (const name of KORVOLD_CONTROL_NAMES) expectPath(total.byCard.get(name) ?? 0, name);
    expectPath(total.controlChanges, 'a permanent that changed controller');
    expectPath(total.nabberTriggers, 'the ability of an opponent tapping an artifact for mana');
  },
  soakTimeout(240_000),
);
