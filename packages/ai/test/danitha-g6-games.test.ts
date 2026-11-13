// Slice soak (D-1260, D-1261 provisional): whole games with the 'danithaG6' deck style (SYNTHETIC cards of the engine fixtures `synthetic-danitha-g6.ts`: a batch combat damage
// trigger and a "dies" trigger over creatures with power greater than their base power, a spell that destroys one, and spells that put keyword counters on creatures, with bodies, a
// pump and removal) between random agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected action and consistent state
// after every action; the action log replays to the same final state; and, with the rules read again here from the cards' texts (not from the engine's own code), at every step:
//   - a creature with a keyword counter on it has that keyword (CR 122.1b), whoever's it is, as the view shows it;
//   - a Watcher trigger comes only after combat damage to a player by a creature of its controller whose power was greater than its printed power (CR 208.4b, 603.2c; nothing in these
//     decks sets base power, so the printed power is the base power);
//   - the Snare destroys only a creature whose power is greater than its printed power;
//   - a Viper Boon puts a +1/+1, a reach and a deathtouch counter on one creature, and untaps it.
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
  getLegalActions,
  getView,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import {
  type Agent,
  CasualAgent,
  HeuristicAgent,
  RandomLegalAgent,
  replayGame,
} from '../src/index';
import { cardNameOf, tokenOrCopyNameOf } from './game-names';
import {
  DANITHA_G6_NAMES,
  DANITHA_G6_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

/** The printed power of the creatures the decks hold; nothing in them sets a base power, so this is their base power (CR 208.4b). */
const PRINTED_POWER = new Map([
  ['Grizzly Bears', 2],
  ['Giant Spider', 2],
  ['Llanowar Elves', 1],
  ['Serra Angel', 4],
  // The commander of the arena decks.
  ['Isamaru, Hound of Konda', 2],
  ['SYNTHETIC Vanilla 3/3', 3],
  ['SYNTHETIC Vanilla 2/2', 2],
]);

/** The keyword counters the decks put, and the keyword the view names for each (CR 122.1b). */
const KEYWORD_OF_COUNTER = new Map([
  ['reach', 'reach'],
  ['deathtouch', 'deathtouch'],
  ['flying', 'flying'],
  ['first strike', 'firstStrike'],
  ['double strike', 'doubleStrike'],
  ['exalted', 'exalted'],
]);

interface Tally {
  keywordChecks: number;
  watcherTriggers: number;
  snareKills: number;
  vipers: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  keywordChecks: 0,
  watcherTriggers: 0,
  snareKills: 0,
  vipers: 0,
  byCard: new Map(),
});

function checkRules(t: Tally, step: StepInfo): void {
  const { before, after, events } = step;
  // CR 122.1b: every creature with a keyword counter has the keyword.
  for (const seat of [0, 1] as const) {
    for (const o of getView(after, seat).battlefield) {
      const obj = after.objects[o.id];
      if (obj === undefined) continue;
      for (const [counter, keyword] of KEYWORD_OF_COUNTER) {
        if ((obj.counters[counter] ?? 0) > 0) {
          t.keywordChecks += 1;
          expect(o.keywords, `${o.name} has a ${counter} counter`).toContain(keyword);
        }
      }
    }
  }
  for (const e of events) {
    if (e.kind === 'spellCast') {
      const name = tokenOrCopyNameOf(after, e.object);
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      // The Snare's target was above its base power when it was chosen (CR 208.4b).
      if (name === 'SYNTHETIC Overgrowth Snare') {
        const target = after.objects[e.object]?.stack?.chosenTargets?.[0];
        if (target?.kind === 'object') {
          const view = getView(after, e.seat).battlefield.find((o) => o.id === target.id);
          const printed = view === undefined ? undefined : PRINTED_POWER.get(view.name);
          if (view !== undefined && printed !== undefined && typeof view.power === 'number') {
            expect(
              view.power,
              'the Snare is aimed at a creature above its base power',
            ).toBeGreaterThan(printed);
            t.snareKills += 1;
          }
        }
      }
    }
    if (e.kind === 'abilityTriggered') {
      const name = cardNameOf(before, e.source);
      if (name === 'SYNTHETIC Base Power Batch Watcher') {
        t.watcherTriggers += 1;
        t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
        const hit = events.filter(
          (d) =>
            d.kind === 'damageDealt' &&
            d.combat &&
            d.to.kind === 'player' &&
            d.amount > 0 &&
            before.objects[d.source]?.controller === e.seat,
        );
        const above = hit.some((d) => {
          if (d.kind !== 'damageDealt') return false;
          const name_ = cardNameOf(before, d.source);
          const printed = PRINTED_POWER.get(name_);
          const power = getView(before, e.seat).battlefield.find((o) => o.id === d.source)?.power;
          return printed !== undefined && typeof power === 'number' && power > printed;
        });
        expect(above, 'a creature above its base power dealt the damage').toBe(true);
      }
    }
  }
  // A Viper Boon resolves: the reach counter comes with a +1/+1 and a deathtouch counter on the same creature, and the creature is untapped (reach counters come from no other card).
  const reach = events.find((c) => c.kind === 'counterAdded' && c.counter === 'reach');
  if (reach?.kind === 'counterAdded') {
    const added = events.filter((c) => c.kind === 'counterAdded');
    expect(
      added.map((c) => (c.kind === 'counterAdded' ? c.counter : '')),
      'Viper Boon puts its three counters',
    ).toEqual(['+1/+1', 'reach', 'deathtouch']);
    expect(
      added.every((c) => c.kind === 'counterAdded' && c.object === reach.object),
      'on one creature',
    ).toBe(true);
    expect(after.objects[reach.object]?.tapped, 'and untaps it').toBe(false);
    t.vipers += 1;
  }
}

test(
  `${GAMES} danithaG6 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = DANITHA_G6_STYLE_PAIRS[g % DANITHA_G6_STYLE_PAIRS.length] ?? [
        'danithaG6',
        'danithaG6',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 206000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 206000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 206000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
        if (step.index % 97 === 0) {
          const listed = getLegalActions(step.before, step.seat);
          expect(
            listed.some((a) => JSON.stringify(a) === JSON.stringify(step.action)) ||
              applyAction(step.before, step.seat, step.action).ok,
          ).toBe(true);
        }
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      for (const key of ['keywordChecks', 'watcherTriggers', 'snareKills', 'vipers'] as const) {
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} danithaG6 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.keywordChecks);
    expectPath(total.vipers);
    for (const name of DANITHA_G6_NAMES) {
      // The Snare needs a creature above its base power; the watchers a damage by one: the other cards are cast or trigger in any game.
      if (name === 'SYNTHETIC Overgrowth Snare') continue;
      expectPath(total.byCard.get(name) ?? 0, name);
    }
  },
  soakTimeout(300_000),
);
