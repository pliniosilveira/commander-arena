// Slice soak (D-139): whole games with the 'artifacts' deck style (SYNTHETIC cards of the Artifacts slice: mass effects over a filter, the
// Kindred type, counting colors, living weapon, abilities that cost less, put counters or return a permanent as a cost, state triggers,
// lords for a creature type, discarding unless an artifact card, looking at the top cards, triggered mana abilities, batch combat
// damage triggers, "once each turn", mana value X of a player that was hit, tapping a chosen number of creatures and reselecting what
// an attacker attacks) between random agents, with CasualAgent in some seats. Every game finishes with a result, no fallback, no
// rejected action and consistent state after every action; the action log replays to the same final state; and the rules of the slice
// are restated from the events and the state before each action, apart from the engine: an ability that may be activated only once each
// turn is activated once each turn at most, "mana value X" destroys only permanents of that value whose controller the creature hit that
// turn, a chosen number of creatures tapped are tapped and deal that much damage, a reselected attacker attacks what was chosen and
// stays in combat, and a mass sacrifice by color leaves no permanent of those colors.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  checkInvariants,
  getView,
  type ObjectId,
  type SeatId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { faceOf, manaValueOf, tokenOrFaceNameOf } from './game-names';
import {
  ARTIFACT_NAMES,
  ARTIFACT_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const HELLKITE = 'SYNTHETIC Brand Hellkite';
const WELL = 'SYNTHETIC Daily Well';
const TAPPERS = ['SYNTHETIC Swarm Sphere', 'SYNTHETIC Goblin Warband'] as const;
const PURGES = {
  'SYNTHETIC Prism Purge': (n: number) => n >= 2,
  'SYNTHETIC Mono Purge': (n: number) => n === 1,
  'SYNTHETIC Hue Purge': (n: number) => n >= 1,
} as const;

interface Tally {
  onceActivations: number;
  hellkiteDestroys: number;
  hellkiteActivations: number;
  tapChoices: number;
  tapNone: number;
  tapDamage: number;
  reselects: number;
  reselectsMoved: number;
  purges: number;
  batchTriggers: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  onceActivations: 0,
  hellkiteDestroys: 0,
  hellkiteActivations: 0,
  tapChoices: 0,
  tapNone: 0,
  tapDamage: 0,
  reselects: 0,
  reselectsMoved: 0,
  purges: 0,
  batchTriggers: 0,
  byCard: new Map(),
});

/** The option string of an attack target, as `chooseOption` of purpose 'attackTarget' lists it. */
const optionOf = (t: { kind: string; seat?: SeatId; object?: ObjectId }): string =>
  t.kind === 'player' ? `player:${t.seat}` : `permanent:${t.object}`;

interface Watch {
  /** The activations of "once each turn" abilities, by turn and object and ability. */
  once: Set<string>;
  /** The players a Hellkite dealt combat damage to, by turn and Hellkite. */
  hit: Set<string>;
}

const tally = (t: Tally, name: string): void => {
  t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
};

function checkRules(t: Tally, watch: Watch, step: StepInfo): void {
  const { before, after, action, events } = step;
  const turn = before.turn.number;

  for (const e of events) {
    if (e.kind === 'spellCast') tally(t, tokenOrFaceNameOf(after, e.object));
    // CR 602.5b: "Activate only once each turn" is activated once each turn at most.
    if (e.kind === 'abilityActivated') {
      const name = tokenOrFaceNameOf(after, e.source);
      if (name === WELL || name === HELLKITE) {
        const key = `${turn}:${e.source}:${e.abilityIndex}`;
        if (watch.once.has(key)) throw new Error(`${name} was activated twice in turn ${turn}`);
        watch.once.add(key);
        t.onceActivations += 1;
        if (name === HELLKITE) t.hellkiteActivations += 1;
      }
    }
    // CR 510.2: whom a Hellkite hit with combat damage this turn.
    if (e.kind === 'damageDealt' && e.combat && e.to.kind === 'player') {
      if (tokenOrFaceNameOf(after, e.source) === HELLKITE)
        watch.hit.add(`${turn}:${e.source}:${e.to.seat}`);
    }
    // CR 603.2c: a batch trigger happens once for the batch.
    if (
      e.kind === 'abilityTriggered' &&
      tokenOrFaceNameOf(after, e.source).startsWith('SYNTHETIC Spy Ring')
    ) {
      t.batchTriggers += 1;
    }
    // "{X}: Destroy each nonland permanent with mana value X whose controller was dealt combat damage by this creature this turn."
    if (
      e.kind === 'zoneChanged' &&
      e.fromZone === 'battlefield' &&
      e.toZone === 'graveyard' &&
      before.resolution !== null &&
      tokenOrFaceNameOf(before, before.resolution.source) === HELLKITE
    ) {
      const res = before.resolution;
      const x = before.objects[res.object]?.stack?.x ?? 0;
      const victim = before.objects[e.from];
      const types = faceOf(before, e.from)?.types ?? [];
      // A permanent destroyed by something else in the same step (the Hellkite's own trigger source differs) is not checked.
      if (
        victim !== undefined &&
        !types.includes('land') &&
        before.objects[res.source] !== undefined
      ) {
        if (manaValueOf(before, e.from) !== x && victim.token === null) {
          throw new Error(`Hellkite with X = ${x} destroyed ${tokenOrFaceNameOf(before, e.from)}`);
        }
        if (!watch.hit.has(`${turn}:${res.source}:${victim.controller}`)) {
          throw new Error(
            `Hellkite destroyed ${tokenOrFaceNameOf(before, e.from)} of a player it did not hit this turn`,
          );
        }
        t.hellkiteDestroys += 1;
      }
    }
    // "Each player sacrifices all permanents they control that are N or more colors": none is left.
    if (e.kind === 'resolved') {
      const name = tokenOrFaceNameOf(before, e.object);
      const test = (PURGES as Record<string, ((n: number) => boolean) | undefined>)[name];
      if (test !== undefined && before.objects[e.object] !== undefined) {
        for (const seat of [0, 1] as const) {
          for (const o of getView(after, seat).battlefield) {
            if (test(o.colors.length)) {
              throw new Error(`${name} resolved and ${o.name} (${o.colors.length} colors) is left`);
            }
          }
        }
        t.purges += 1;
      }
    }
  }

  // Tapping a chosen number of creatures (CR 701.26a): the chosen are tapped, each deals one damage to what the creature attacks.
  if (action.kind === 'choosePermanents' && before.pending?.kind === 'choosePermanent') {
    const d = before.pending;
    const sourceObj = before.objects[d.source];
    const sourceId = sourceObj?.stack?.source ?? null;
    const sourceName = sourceId === null ? '?' : tokenOrFaceNameOf(before, sourceId);
    if (
      (TAPPERS as readonly string[]).includes(sourceName) &&
      d.purpose === 'effect' &&
      d.min === 0
    ) {
      const n = action.objects.length;
      for (const id of action.objects) {
        if (after.objects[id]?.tapped !== true)
          throw new Error(`${sourceName}: ${id} was not tapped`);
      }
      t.tapChoices += 1;
      if (n === 0) t.tapNone += 1;
      else {
        const dealt = events.filter(
          (e) => e.kind === 'damageDealt' && !e.combat && e.source === sourceObj?.stack?.source,
        );
        const total = dealt.reduce((sum, e) => sum + (e.kind === 'damageDealt' ? e.amount : 0), 0);
        const attacker = sourceObj?.stack?.source;
        const attacking = before.combat?.attackers.some((a) => a.object === attacker) === true;
        // The damage goes to what the creature attacks, if it still attacks; a prevented or absorbed amount is not checked.
        if (attacking && total !== n && dealt.length > 0) {
          throw new Error(`${sourceName} tapped ${n} and dealt ${total}`);
        }
        t.tapDamage += total;
      }
    }
  }

  // Reselecting what an attacker attacks (CR 508.7): it attacks what was chosen and stays in combat.
  if (action.kind === 'chooseOption' && before.pending?.kind === 'chooseOption') {
    const d = before.pending;
    if (d.purpose === 'attackTarget' && d.attacker !== undefined) {
      t.reselects += 1;
      const now = after.combat?.attackers.find((a) => a.object === d.attacker);
      if (now === undefined) throw new Error('the reselected attacker left combat');
      if (optionOf(now.target) !== action.option) {
        throw new Error(`reselected ${action.option}, attacks ${optionOf(now.target)}`);
      }
      const was = before.combat?.attackers.find((a) => a.object === d.attacker);
      if (was !== undefined && optionOf(was.target) !== action.option) t.reselectsMoved += 1;
    }
  }
}

test(
  `${GAMES} artifacts games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = ARTIFACT_STYLE_PAIRS[g % ARTIFACT_STYLE_PAIRS.length] ?? [
        'artifacts',
        'artifacts',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 9700 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 9700 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const watch: Watch = { once: new Set(), hit: new Set() };
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, watch, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
      for (const key of Object.keys(t) as (keyof Tally)[]) {
        const v = t[key];
        if (typeof v === 'number') (total[key] as number) += v;
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    const summary = {
      ...total,
      byCard: Object.fromEntries([...total.byCard].sort()),
      turnsMax: Math.max(...turns),
    };
    console.log(`${GAMES} artifacts games: ${JSON.stringify(summary)}`);

    expectPath(total.onceActivations);
    expectPath(total.tapChoices);
    expectPath(total.purges);
    // Every card of the slice was cast at least once somewhere in the games.
    for (const name of ARTIFACT_NAMES) {
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(240_000),
);
