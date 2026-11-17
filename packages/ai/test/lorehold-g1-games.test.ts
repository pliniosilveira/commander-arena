// Slice soak (issue 86, group 1 of the Lorehold Spirit deck): whole games with the 'loreholdG1' deck style (SYNTHETIC cards of the engine fixtures `synthetic-lorehold-g1.ts`: the 3/3 with
// vigilance that searches for a Plains when an opponent controls more lands, the two artifact creatures that may exile a card their controller discards and play it or cast it, the
// creature that may pay {1} and discard a card to draw and may exile one of the nonland cards its controller discards and cast it, the creature that draws when its controller discards one or
// more cards, the sorcery that discards two cards, the artifact that mills and shuffles cards of the graveyard into the library, the sorcery in which each creature deals damage to itself and
// the 3/5 with deathtouch and lifelink) between random agents, with CasualAgent and HeuristicAgent in some seats. Every game finishes with a result, no fallback, no rejected action and
// consistent state after every action; the action log replays to the same final state; and, with the rules read again here from CR 701.23, 701.24, 701.9a, 603.2c, 603.4, 118.3, 120.3, 305.1
// and the cards' texts (not from the engine's own code), at every step:
//   - a Land Claimer triggers only when an opponent controls more lands than its controller as it enters (CR 603.4), searches twice at most, puts every Plains onto the battlefield tapped,
//     and its controller's library is shuffled once if it was searched and never if it was not (CR 701.23a, 701.24a);
//   - the Seer triggers once for the nonland cards its controller discards in one step, however many (CR 603.2c), and the Watcher once for any cards; each Golem triggers once for each
//     card discarded (CR 603.2); a card exiled by a Cast Golem that is a land is never offered as a land play (CR 305.1, 601.2);
//   - the Seer's payment of {1} and a discard draws a card exactly when the card was discarded (CR 118.3, 608.2c);
//   - a Memory Clock that is activated for its second ability is exiled as the cost, shuffles the library of its controller as it resolves, even with no target (CR 701.24d), and shuffles in
//     the targets that were still in the graveyard; its first ability mills two cards (CR 701.17a);
//   - a Reckoning Tide deals to each creature on the battlefield damage equal to its power, from the creature to itself and not combat damage (CR 120.3), and a creature with deathtouch
//     that deals any of it dies (CR 704.5h).
// The count is `soakGames()` (D-126); the path checks run from 100 games up.
import {
  applyAction,
  checkInvariants,
  type GameEvent,
  type GameState,
  getLegalActions,
  type ObjectId,
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
import { cardNameOf, faceOf } from './game-names';
import { LOREHOLD_G1_STYLE_PAIRS, type StepInfo, smallGameConfig, stepGame } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

const CLAIMER = 'SYNTHETIC Land Claimer';
const GOLEM = 'SYNTHETIC Quarantine Golem';
const CAST_GOLEM = 'SYNTHETIC Cast Golem';
const SEER = 'SYNTHETIC Doubting Seer';
const WATCHER = 'SYNTHETIC Discard Watcher';
const CLOCK = 'SYNTHETIC Memory Clock';
const TIDE = 'SYNTHETIC Reckoning Tide';

interface Tally {
  claimerTriggers: number;
  claimerSearches: number;
  claimerTwice: number;
  claimerShuffles: number;
  claimerDeclined: number;
  seerBatches: number;
  seerBigBatches: number;
  watcherBatches: number;
  golemTriggers: number;
  castGolemLands: number;
  seerPaid: number;
  seerAttacks: number;
  clockMills: number;
  clockShuffles: number;
  clockTargets: number;
  clockEmpty: number;
  tides: number;
  tideDeaths: number;
  titanDeaths: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  claimerTriggers: 0,
  claimerSearches: 0,
  claimerTwice: 0,
  claimerShuffles: 0,
  claimerDeclined: 0,
  seerBatches: 0,
  seerBigBatches: 0,
  watcherBatches: 0,
  golemTriggers: 0,
  castGolemLands: 0,
  seerPaid: 0,
  seerAttacks: 0,
  clockMills: 0,
  clockShuffles: 0,
  clockTargets: 0,
  clockEmpty: 0,
  tides: 0,
  tideDeaths: 0,
  titanDeaths: 0,
  byCard: new Map(),
});

/** What the events of one resolution (the steps that answer its questions, and the step that resolves it) did, for the checks made as it resolves. */
interface Window {
  events: GameEvent[];
  /** The name of the card with the ability and the index of the ability. */
  readonly name: string;
  readonly index: number;
  readonly source: ObjectId;
  readonly seat: number;
  /** The targets chosen for the ability and how many were in the graveyard before it resolved. */
  graveyardTargets: number;
}

interface Memory {
  /** What each trigger source is still owed (key: name, id, ability index). */
  owed: Map<string, number>;
  /** The abilities on the stack whose resolution is being watched, by the stack object. */
  windows: Map<ObjectId, Window>;
  /** The lands a Cast Golem exiled: never offered as a land play while they stay in exile. */
  castOnlyLands: Set<ObjectId>;
  /** The stack objects of the abilities of the Cast Golem. */
  castGolemAbilities: Set<ObjectId>;
}

const controllerIn = (state: GameState, id: ObjectId) =>
  (state.objects[id] ?? state.lki[id]?.object)?.controller;

const isLand = (state: GameState, id: ObjectId) =>
  faceOf(state, id)?.types.includes('land') ?? false;

const landsOf = (state: GameState, seat: number) =>
  state.battlefield.filter((id) => controllerIn(state, id) === seat && isLand(state, id)).length;

function owe(memory: Memory, key: string, delta: number): void {
  const owed = (memory.owed.get(key) ?? 0) + delta;
  expect(owed, `${key}: triggered only for an event it reads`).toBeGreaterThanOrEqual(0);
  memory.owed.set(key, owed);
}

/** The source of the question the step answers, if it is a question of an ability: the events of that step belong to the resolution of that ability. */
const answeredSource = (step: StepInfo): ObjectId | undefined => {
  const pending = step.before.pending as { source?: ObjectId } | null;
  return pending?.source;
};

function checkResolution(t: Tally, step: StepInfo, window: Window): void {
  const { after, before } = step;
  const mine = (e: GameEvent) => 'seat' in e && e.seat === window.seat;
  const searched = window.events.filter(
    (e) => e.kind === 'librarySearched' && e.seat === window.seat,
  );
  const shuffled = window.events.filter(
    (e) => e.kind === 'libraryShuffled' && e.seat === window.seat,
  );
  if (window.name === CLAIMER && window.index === 1) {
    // CR 701.23a, 701.24a: "If you search your library this way, shuffle": once for one search or two, never for none.
    expect(searched.length, 'the Claimer searches twice at most').toBeLessThanOrEqual(2);
    expect(shuffled.length, 'the library is shuffled once if it was searched, else not').toBe(
      searched.length > 0 ? 1 : 0,
    );
    t.claimerSearches += searched.length;
    if (searched.length === 2) t.claimerTwice += 1;
    if (searched.length > 0) t.claimerShuffles += 1;
    else t.claimerDeclined += 1;
    // Every Plains put onto the battlefield comes in tapped (CR 614.1c, as the card says), under its controller.
    for (const e of window.events) {
      if (e.kind === 'zoneChanged' && e.fromZone === 'library' && e.toZone === 'battlefield') {
        expect(cardNameOf(after, e.to), 'the card found is a Plains').toBe('Plains');
        expect(after.objects[e.to]?.tapped, 'it enters tapped').toBe(true);
        expect(
          controllerIn(after, e.to),
          'under the control of the controller of the ability',
        ).toBe(window.seat);
      }
    }
  }
  if (window.name === SEER && window.index === 0) {
    // CR 118.3, 608.2c: the draw is for a payment that was made, which includes the discard.
    const discards = window.events.filter((e) => e.kind === 'discarded' && mine(e)).length;
    // A draw from an empty library is a draw that was tried (CR 121.4).
    const draws = window.events.filter(
      (e) => (e.kind === 'cardDrawn' || e.kind === 'drewFromEmptyLibrary') && mine(e),
    ).length;
    expect(discards, 'at most one card is discarded to the payment').toBeLessThanOrEqual(1);
    expect(draws, 'a card is drawn when, and only when, the card was discarded').toBe(discards);
    t.seerAttacks += 1;
    if (discards === 1) t.seerPaid += 1;
  }
  if (window.name === CLOCK && window.index === 0) {
    // CR 701.17a: the top two cards of the library, or as many as it holds.
    const library = before.seats[window.seat]?.library.length ?? 0;
    const milled = window.events.flatMap((e) =>
      e.kind === 'milled' && e.seat === window.seat ? [e.objects.length] : [],
    );
    expect(
      milled.reduce((a, b) => a + b, 0),
      'two cards are milled, or all there are',
    ).toBe(Math.min(2, library));
    t.clockMills += 1;
  }
  if (window.name === CLOCK && window.index === 1) {
    // CR 701.24d: the library is shuffled even if no card is shuffled into it; the targets still in the graveyard go into it.
    expect(shuffled.length, 'the library is shuffled once').toBe(1);
    const into = window.events.filter(
      (e) => e.kind === 'zoneChanged' && e.fromZone === 'graveyard' && e.toZone === 'library',
    ).length;
    expect(into, 'the targets that were in the graveyard went into the library').toBe(
      window.graveyardTargets,
    );
    t.clockShuffles += 1;
    t.clockTargets += into;
    if (window.graveyardTargets === 0) t.clockEmpty += 1;
  }
}

function checkRules(t: Tally, step: StepInfo, memory: Memory): void {
  const { before, after, events } = step;
  // The batches of discards of this step, by player: the cards, nonland or not (CR 701.9a: the card as it was in the hand, read in the graveyard it went to).
  const discardsOf = (seat: number) =>
    events.filter((e) => e.kind === 'discarded' && e.seat === seat);
  for (const id of before.battlefield) {
    const name = cardNameOf(before, id);
    const seat = controllerIn(before, id);
    if (seat === undefined) continue;
    const key = (index: number) => `${name}:${id}:${index}`;
    const discards = discardsOf(seat);
    const nonland = discards.filter(
      (e) => e.kind === 'discarded' && e.to !== null && !isLand(after, e.to),
    );
    if (name === SEER && nonland.length > 0) {
      // CR 603.2c: one trigger for the nonland cards discarded together, however many.
      owe(memory, key(1), 1);
      t.seerBatches += 1;
      if (nonland.length >= 2) t.seerBigBatches += 1;
    }
    if (name === WATCHER && discards.length > 0) {
      owe(memory, key(0), 1);
      t.watcherBatches += 1;
    }
    // CR 603.2: a trigger for each card discarded.
    if (name === GOLEM || name === CAST_GOLEM) owe(memory, key(0), discards.length);
  }
  // A card that was exiled by a Cast Golem's ability resolving: a land is no card to cast, so it stays unplayed.
  for (const e of events) {
    if (e.kind === 'resolved' && memory.castGolemAbilities.has(e.object)) {
      for (const moved of events) {
        if (
          moved.kind === 'zoneChanged' &&
          moved.fromZone === 'graveyard' &&
          moved.toZone === 'exile'
        ) {
          if (isLand(after, moved.to)) {
            memory.castOnlyLands.add(moved.to);
            t.castGolemLands += 1;
          }
        }
      }
      memory.castGolemAbilities.delete(e.object);
    }
  }
  for (const id of memory.castOnlyLands) {
    if (after.objects[id]?.zone !== 'exile') {
      memory.castOnlyLands.delete(id);
      continue;
    }
    for (const seat of [0, 1]) {
      const plays = getLegalActions(after, seat).filter(
        (a) => a.kind === 'playLand' && a.object === id,
      );
      expect(plays, 'a land exiled by "you may cast it" is not played as a land').toEqual([]);
    }
  }
  // Which resolution the events of this step belong to: the ability whose question is answered, and the one that resolves.
  const resolved = events.flatMap((e) => (e.kind === 'resolved' ? [e.object] : []));
  const owners = new Set<ObjectId>([
    ...resolved,
    ...(answeredSource(step) === undefined ? [] : [answeredSource(step) as ObjectId]),
  ]);
  for (const owner of owners) memory.windows.get(owner)?.events.push(...events);
  for (const e of events) {
    if (e.kind === 'abilityTriggered') {
      const known = cardNameOf(before, e.source);
      const name = known === '?' ? cardNameOf(after, e.source) : known;
      t.byCard.set(name, (t.byCard.get(name) ?? 0) + 1);
      const key = `${name}:${e.source}:${e.abilityIndex}`;
      if (name === SEER && e.abilityIndex === 1) owe(memory, key, -1);
      if (name === WATCHER) owe(memory, key, -1);
      if (name === GOLEM || name === CAST_GOLEM) {
        owe(memory, key, -1);
        t.golemTriggers += 1;
        if (name === CAST_GOLEM) memory.castGolemAbilities.add(e.stackObject);
      }
      if (name === CLAIMER && e.abilityIndex === 1) {
        // CR 603.4: an opponent controls more lands than the controller as the ability triggers.
        const seat = controllerIn(after, e.source);
        expect(seat, 'the Claimer is on the battlefield').not.toBeUndefined();
        const them = seat === 0 ? 1 : 0;
        expect(
          landsOf(after, them),
          'the Claimer triggers only when an opponent controls more lands',
        ).toBeGreaterThan(landsOf(after, seat ?? 0));
        t.claimerTriggers += 1;
      }
      if (['SYNTHETIC Land Claimer', SEER, CLOCK].includes(name)) {
        memory.windows.set(e.stackObject, {
          events: [],
          name,
          index: e.abilityIndex,
          source: e.source,
          seat: e.seat,
          graveyardTargets: 0,
        });
      }
    }
    if (
      e.kind === 'abilityActivated' &&
      cardNameOf(before, e.source) === CLOCK &&
      e.stackObject !== null
    ) {
      // CR 602.2, 118.12: the exile of the artifact is a cost, paid as the ability goes on the stack.
      if (e.abilityIndex === 1) {
        expect(after.objects[e.source]?.zone, 'the Clock was exiled as the cost').not.toBe(
          'battlefield',
        );
      }
      const object = after.objects[e.stackObject];
      const targets = object?.stack?.chosenTargets ?? [];
      memory.windows.set(e.stackObject, {
        events: [],
        name: CLOCK,
        index: e.abilityIndex,
        source: e.source,
        seat: e.seat,
        graveyardTargets: targets.filter(
          (x) => x.kind === 'object' && after.objects[x.id]?.zone === 'graveyard',
        ).length,
      });
    }
  }
  // A Reckoning Tide that resolves: each creature on the battlefield dealt damage equal to its power by itself (CR 120.3, 608.2h).
  for (const id of resolved) {
    const name = cardNameOf(before, id);
    if (name === TIDE) {
      t.tides += 1;
      const creatures = before.battlefield.filter((c) =>
        faceOf(before, c)?.types.includes('creature'),
      );
      for (const c of creatures) {
        const power = faceOf(before, c)?.power;
        const dealt = events.filter(
          (e) =>
            e.kind === 'damageDealt' && e.source === c && e.to.kind === 'object' && e.to.id === c,
        );
        if (typeof power === 'number' && power > 0) {
          expect(
            dealt,
            `${cardNameOf(before, c)} deals itself damage equal to its power`,
          ).toHaveLength(1);
          expect(dealt[0]?.kind === 'damageDealt' ? dealt[0].amount : -1).toBe(power);
          expect(dealt[0]?.kind === 'damageDealt' ? dealt[0].combat : true).toBe(false);
        } else {
          expect(dealt, 'a creature with no power deals itself nothing').toHaveLength(0);
        }
        if (cardNameOf(before, c) === 'SYNTHETIC Venom Titan') {
          expect(
            after.objects[c]?.zone,
            'deathtouch: it dies of its own damage (CR 704.5h)',
          ).not.toBe('battlefield');
          t.titanDeaths += 1;
        }
        if (after.objects[c]?.zone !== 'battlefield') t.tideDeaths += 1;
      }
      // Nothing but creatures was dealt damage: no player, no other permanent.
      for (const e of events) {
        if (e.kind === 'damageDealt') {
          expect(e.to.kind, 'only creatures are dealt damage').toBe('object');
        }
      }
    }
    const window = memory.windows.get(id);
    if (window !== undefined) {
      checkResolution(t, step, window);
      memory.windows.delete(id);
    }
  }
  // An ability that was removed from the stack without resolving is no longer watched.
  for (const e of events) {
    if (e.kind === 'countered') memory.windows.delete(e.object);
  }
}

test(
  `${GAMES} loreholdG1 games run clean, replay exactly and use the paths of the slice`,
  async () => {
    const total = newTally();
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = LOREHOLD_G1_STYLE_PAIRS[g % LOREHOLD_G1_STYLE_PAIRS.length] ?? [
        'loreholdG1',
        'loreholdG1',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? g % 8 < 4
            ? new CasualAgent({ seed: 271000 + 2 * g + seat })
            : new HeuristicAgent({ seed: 271000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 271000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const t = newTally();
      const memory: Memory = {
        owed: new Map(),
        windows: new Map(),
        castOnlyLands: new Set(),
        castGolemAbilities: new Set(),
      };
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkRules(t, step, memory);
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
      for (const key of [
        'claimerTriggers',
        'claimerSearches',
        'claimerTwice',
        'claimerShuffles',
        'claimerDeclined',
        'seerBatches',
        'seerBigBatches',
        'watcherBatches',
        'golemTriggers',
        'castGolemLands',
        'seerPaid',
        'seerAttacks',
        'clockMills',
        'clockShuffles',
        'clockTargets',
        'clockEmpty',
        'tides',
        'tideDeaths',
        'titanDeaths',
      ] as const) {
        total[key] += t[key];
      }
      for (const [name, n] of t.byCard) total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
    }
    console.log(
      `${GAMES} loreholdG1 games: ${JSON.stringify({ ...total, byCard: Object.fromEntries([...total.byCard].sort()) })}`,
    );
    expectPath(total.claimerTriggers, 'a Land Claimer that triggers');
    expectPath(total.claimerShuffles, 'a Land Claimer that searches and shuffles');
    expectPath(total.seerBatches, 'one or more nonland cards discarded that trigger the Seer');
    expectPath(total.watcherBatches, 'cards discarded that trigger the Discard Watcher');
    expectPath(total.golemTriggers, 'a card discarded that triggers a Golem');
    expectPath(total.seerAttacks, 'an attack trigger of the Seer that resolves');
    expectPath(total.seerPaid, 'a payment of {1} and a discard to the Seer');
    expectPath(total.clockMills, 'a Memory Clock that mills');
    expectPath(total.clockShuffles, 'a Memory Clock that shuffles cards into the library');
    expectPath(total.tides, 'a Reckoning Tide that resolves');
    expectPath(total.tideDeaths, 'a creature that dies of its own damage');
  },
  soakTimeout(600_000),
);
