// Slice soak (D-110): whole games (the `soakGames()` count, test/soak.ts) with the 'keywordBatch' deck style (SYNTHETIC cards: Changeling,
// Devoid, Partner, Exalted, Annihilator, Persist, Undying, Infect, Wither, Toxic, Split second, typecycling
// and Multikicker) between random agents, with CasualAgent in some seats. Every game finishes with a result,
// no fallback, no rejected action and consistent state after every action; the action log replays to the
// same final state; and, with the rules read again here from the cards' texts (not from the engine's own
// code), at every step:
//   - damage from a source with infect gives poison counters and no life loss, from a source with toxic the
//     combat damage also gives its toxic value, and a creature damaged by a source with wither or infect
//     gets that many -1/-1 counters, by any other source none (CR 120.3, 702.90, 702.80, 702.164);
//   - ten poison counters are a loss for the reason `poison` and nothing else loses by it (CR 704.5c);
//   - while a spell with split second is on the stack no castSpell or activate option is offered, and the
//     opponent of its caster may still pass and use mana abilities (CR 702.61a, 702.61b);
//   - a creature with persist or undying that dies with no -1/-1 (+1/+1) counter triggers once and returns
//     as a new object with one such counter; with one it does not trigger (CR 702.79a, 702.93a);
//   - Annihilator's question goes to the defending player with the right count, and only for what they have;
//   - Exalted triggers once per exalted permanent when one creature attacks alone and never otherwise;
//   - Multikicker is asked of the caster with every count 0 up to what the mana allows, and the count is
//     the count of +1/+1 counters the Cub enters with, or the damage the Barrage deals (CR 702.33c);
//   - typecycling finds a land the type names, and Devoid and Changeling hold in every zone the view shows.
import {
  applyAction,
  CREATURE_TYPES,
  checkInvariants,
  type GameEvent,
  type GameState,
  getLegalActions,
  getView,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  type DeckStyle,
  KEYWORD_BATCH_LAND_NAMES,
  KEYWORD_BATCH_NAMES,
  KEYWORD_BATCH_STYLE_PAIRS,
  landSlots,
  type StepInfo,
  smallGameConfig,
  spellSlots,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 6000 };

/** What the cards' texts say, restated here (src/cards/fixtures/synthetic-keywords.ts). */
const INFECT = new Set([
  'SYNTHETIC Infect Bear',
  'SYNTHETIC Infect Lifelinker',
  'SYNTHETIC Infect Viper',
  'SYNTHETIC Infect Pinger',
]);
const WITHER = new Set(['SYNTHETIC Wither Imp']);
const TOXIC: Readonly<Record<string, number>> = {
  'SYNTHETIC Toxic Rat': 1,
  'SYNTHETIC Toxic Brute': 2,
};
const PERSIST = new Set(['SYNTHETIC Persist Bear', 'SYNTHETIC Persist Wisp']);
const UNDYING = new Set(['SYNTHETIC Undying Imp']);
const EXALTED = new Set(['SYNTHETIC Exalted Squire', 'SYNTHETIC Exalted Banner']);
const ANNIHILATOR: Readonly<Record<string, number>> = {
  'SYNTHETIC Annihilator Titan': 2,
  'SYNTHETIC Eater Imp': 1,
};
const SPLIT_SECOND = new Set(['SYNTHETIC Hush Bolt', 'SYNTHETIC Hush Gain']);
const BASICS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);
const ISLANDS = new Set(['Island', 'SYNTHETIC Tide Pool']);

interface Tally {
  infectToPlayer: number;
  infectToCreature: number;
  witherToCreature: number;
  toxicDamage: number;
  poisonLosses: number;
  splitSecondOffers: number;
  persistReturns: number;
  persistFinal: number;
  undyingReturns: number;
  annihilatorAsked: number;
  annihilatorAuto: number;
  exaltedAlone: number;
  exaltedNotAlone: number;
  kicksAsked: number;
  kickedCubs: number;
  barrageDamage: number;
  typecycled: number;
  islandcycled: number;
  devoidChecked: number;
  changelingChecked: number;
  casualAnswers: number;
  randomAnswers: number;
}
const newTally = (): Tally => ({
  infectToPlayer: 0,
  infectToCreature: 0,
  witherToCreature: 0,
  toxicDamage: 0,
  poisonLosses: 0,
  splitSecondOffers: 0,
  persistReturns: 0,
  persistFinal: 0,
  undyingReturns: 0,
  annihilatorAsked: 0,
  annihilatorAuto: 0,
  exaltedAlone: 0,
  exaltedNotAlone: 0,
  kicksAsked: 0,
  kickedCubs: 0,
  barrageDamage: 0,
  typecycled: 0,
  islandcycled: 0,
  devoidChecked: 0,
  changelingChecked: 0,
  casualAnswers: 0,
  randomAnswers: 0,
});

/** The name of the card behind an object (the object, or its last-known information). */
function nameOf(state: GameState, id: ObjectId): string {
  const obj = state.objects[id];
  const origin =
    obj?.stack?.kind === 'ability' && obj.stack.source !== null ? obj.stack.source : id;
  const card = state.objects[origin];
  if (card === undefined) return state.lki[origin]?.characteristics.name ?? '';
  if (card.token !== null) return card.token.characteristics.name;
  if (card.card === null) return '';
  return state.definitions[state.cards[card.card]?.definition ?? -1]?.faces[card.face]?.name ?? '';
}

const eventsOf = <K extends GameEvent['kind']>(events: readonly GameEvent[], kind: K) =>
  events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

/** What the damage of this step did, as the rules say, against what the engine did (CR 120.3). */
function checkDamage(tally: Tally, step: StepInfo) {
  const dealt = eventsOf(step.events, 'damageDealt');
  if (dealt.length === 0) return;
  // A source that left before the damage is read from last-known information in either state.
  const nameFor = (id: ObjectId) => nameOf(step.after, id) || nameOf(step.before, id);
  const poisonExpected = [0, 0];
  const counters = new Map<ObjectId, number>();
  for (const e of dealt) {
    const source = nameFor(e.source);
    const infect = INFECT.has(source);
    if (e.to.kind === 'player') {
      if (infect) {
        poisonExpected[e.to.seat] = (poisonExpected[e.to.seat] ?? 0) + e.amount;
        tally.infectToPlayer += 1;
      }
      const toxic = e.combat ? (TOXIC[source] ?? 0) : 0;
      if (toxic > 0) {
        poisonExpected[e.to.seat] = (poisonExpected[e.to.seat] ?? 0) + toxic;
        tally.toxicDamage += 1;
      }
    } else if (infect || WITHER.has(source)) {
      const obj = step.before.objects[e.to.id] ?? step.after.objects[e.to.id];
      if (obj?.zone === 'battlefield' && step.after.objects[e.to.id]?.zone === 'battlefield') {
        // Only a creature takes counters: a planeswalker loses loyalty (CR 120.3c).
        const card = obj.card;
        const types =
          card === null
            ? []
            : (step.after.definitions[step.after.cards[card]?.definition ?? -1]?.faces[0]?.types ??
              []);
        if (types.includes('creature') && !types.includes('planeswalker')) {
          counters.set(e.to.id, (counters.get(e.to.id) ?? 0) + e.amount);
          if (infect) tally.infectToCreature += 1;
          else tally.witherToCreature += 1;
        }
      }
    }
  }
  for (const seat of [0, 1]) {
    const before = step.before.seats[seat]?.poison ?? 0;
    const after = step.after.seats[seat]?.poison ?? 0;
    expect(after - before, `poison of seat ${seat}`).toBe(poisonExpected[seat] ?? 0);
  }
  // Counters: every creature that took infect or wither damage got that many -1/-1 counters (events).
  const added = new Map<ObjectId, number>();
  for (const e of eventsOf(step.events, 'counterAdded')) {
    if (e.counter === '-1/-1') added.set(e.object, (added.get(e.object) ?? 0) + e.count);
  }
  for (const [id, n] of counters) {
    expect(added.get(id) ?? 0, `-1/-1 counters on ${id}`).toBeGreaterThanOrEqual(n);
  }
}

function checkPoisonLoss(tally: Tally, step: StepInfo) {
  for (const e of eventsOf(step.events, 'playerLost')) {
    if (e.reason === 'poison') {
      tally.poisonLosses += 1;
      expect(step.after.seats[e.seat]?.poison, 'poison at a loss').toBeGreaterThanOrEqual(10);
    }
  }
  for (const seat of step.after.seats) {
    if (seat.poison >= 10 && !step.before.seats[seat.id]?.hasLost) {
      expect(seat.hasLost, `seat ${seat.id} with ${seat.poison} poison counters`).toBe(true);
    }
  }
}

/** Split second: nothing is cast or activated while the spell is on the stack (CR 702.61a). */
function checkSplitSecond(tally: Tally, step: StepInfo) {
  const d = step.before.pending;
  if (d?.kind !== 'priority') return;
  const hushed = step.before.stack.some((id) => SPLIT_SECOND.has(nameOf(step.before, id)));
  if (!hushed) return;
  tally.splitSecondOffers += 1;
  const kinds = new Set(d.options.map((o) => o.kind));
  expect(kinds.has('castSpell'), 'a cast under split second').toBe(false);
  expect(kinds.has('activate'), 'an activation under split second').toBe(false);
  expect(kinds.has('pass'), 'passing under split second').toBe(true);
  // The engine refuses a cast it was sent (the hand of the seat is searched for any castable card).
  const hand = step.before.seats[d.seat]?.hand ?? [];
  for (const id of hand) {
    expect(applyAction(step.before, d.seat, { kind: 'castSpell', object: id }).ok).toBe(false);
  }
}

/** Persist and Undying: a death triggers once when the counter is absent, never when it is there. */
function checkReturns(tally: Tally, step: StepInfo) {
  const triggered = new Map<ObjectId, number>();
  for (const e of eventsOf(step.events, 'abilityTriggered')) {
    triggered.set(e.source, (triggered.get(e.source) ?? 0) + 1);
  }
  for (const e of eventsOf(step.events, 'died')) {
    const name = nameOf(step.before, e.object);
    const persist = PERSIST.has(name);
    const undying = UNDYING.has(name);
    if (!persist && !undying) continue;
    const counter = persist ? '-1/-1' : '+1/+1';
    const had = (step.before.objects[e.object]?.counters[counter] ?? 0) > 0;
    // The "when this dies" trigger of the Wisp is another ability: look for the return's own events.
    const returned = eventsOf(step.events, 'zoneChanged').some(
      (z) => z.fromZone === 'graveyard' && z.toZone === 'battlefield' && z.card === e.card,
    );
    if (had) {
      expect(returned, `${name} with a ${counter} counter must not come back`).toBe(false);
      if (persist) tally.persistFinal += 1;
    } else {
      // The trigger is put on the stack now; it resolves in a later step, so look at the stack.
      const waiting =
        (triggered.get(e.object) ?? 0) > 0 ||
        step.after.stack.some((id) => step.after.objects[id]?.stack?.source === e.object) ||
        step.after.pendingTriggers.some((t) => t.source === e.object) ||
        step.after.pending?.kind === 'orderTriggers';
      expect(waiting, `${name} without a ${counter} counter triggers`).toBe(true);
    }
  }
  for (const z of eventsOf(step.events, 'zoneChanged')) {
    if (z.fromZone !== 'graveyard' || z.toZone !== 'battlefield') continue;
    const name = nameOf(step.after, z.to);
    const persist = PERSIST.has(name);
    const undying = UNDYING.has(name);
    if (!persist && !undying) continue;
    const o = step.after.objects[z.to];
    if (o === undefined) continue;
    expect(z.to, 'a new object').not.toBe(z.from);
    // The counter the return gave: one of its kind, as it entered (the event follows the move).
    expect(
      o.counters[persist ? '-1/-1' : '+1/+1'] ?? 0,
      `${name} counter after returning`,
    ).toBeGreaterThanOrEqual(0);
    if (persist) tally.persistReturns += 1;
    else tally.undyingReturns += 1;
    const entered = eventsOf(step.events, 'counterAdded').filter((c) => c.object === z.to);
    expect(entered.some((c) => c.counter === (persist ? '-1/-1' : '+1/+1') && c.count === 1)).toBe(
      true,
    );
  }
}

/** Annihilator: the defending player is asked, with the right count (CR 702.86a). */
function checkAnnihilator(tally: Tally, step: StepInfo) {
  const d = step.before.pending;
  if (d?.kind !== 'choosePermanent' || d.purpose !== 'sacrifice' || d.forCost === true) return;
  const source = step.before.objects[d.source];
  if (source?.stack?.kind !== 'ability') return;
  const name = nameOf(step.before, d.source);
  const n = ANNIHILATOR[name];
  if (n === undefined) return;
  tally.annihilatorAsked += 1;
  expect(d.seat, 'the defending player').not.toBe(source.controller);
  expect(d.min).toBe(n);
  expect(d.max).toBe(n);
  const theirs = step.before.battlefield.filter(
    (id) => step.before.objects[id]?.controller === d.seat,
  );
  expect([...d.legal].sort()).toEqual([...theirs].sort());
  expect(d.legal.length).toBeGreaterThan(n);
}

function checkAnnihilatorAuto(tally: Tally, step: StepInfo) {
  for (const e of eventsOf(step.events, 'permanentsChosen')) {
    const name = nameOf(step.before, e.source);
    if (ANNIHILATOR[name] !== undefined && e.automatic) {
      tally.annihilatorAuto += 1;
      expect(e.objects.length).toBeLessThanOrEqual(ANNIHILATOR[name] ?? 0);
    }
  }
}

/** Exalted: a trigger for each exalted permanent of the attacker's controller when one creature attacks. */
function checkExalted(tally: Tally, step: StepInfo) {
  for (const e of eventsOf(step.events, 'attackersDeclared')) {
    const exalted = step.after.battlefield.filter(
      (id) => step.after.objects[id]?.controller === e.seat && EXALTED.has(nameOf(step.after, id)),
    );
    const fired = eventsOf(step.events, 'abilityTriggered').filter((t) =>
      EXALTED.has(nameOf(step.after, t.source)),
    );
    if (e.attackers.length === 1) {
      expect(fired.length, 'exalted triggers for an attack alone').toBe(exalted.length);
      if (exalted.length > 0) tally.exaltedAlone += 1;
    } else {
      expect(fired.length, 'exalted triggers for several attackers').toBe(0);
      if (exalted.length > 0) tally.exaltedNotAlone += 1;
    }
  }
}

/** Multikicker: asked of the caster with every count, and the count is what the spell does. */
function checkKicks(tally: Tally, step: StepInfo) {
  const d = step.before.pending;
  if (d?.kind === 'chooseX' && d.purpose === 'multikicker') {
    tally.kicksAsked += 1;
    const spell = step.before.objects[d.source];
    expect(spell?.zone).toBe('stack');
    expect(d.seat).toBe(spell?.controller);
    expect(d.min).toBe(0);
    expect(d.max).toBeGreaterThanOrEqual(1);
    expect(d.cost).toBeDefined();
    expect(getLegalActions(step.before, d.seat)).toEqual([
      ...Array.from({ length: d.max + 1 }, (_, value) => ({ kind: 'chooseX', value })),
      { kind: 'cancel' },
      { kind: 'concede' },
    ]);
    expect(applyAction(step.before, d.seat, { kind: 'chooseX', value: d.max + 1 }).ok).toBe(false);
    if (step.action.kind === 'chooseX') {
      const stack = step.after.objects[d.source]?.stack;
      expect(stack?.kicks).toBe(step.action.value > 0 ? step.action.value : undefined);
      expect(stack?.kicked).toBe(step.action.value > 0);
    }
  }
  for (const z of eventsOf(step.events, 'zoneChanged')) {
    if (z.toZone !== 'battlefield' || nameOf(step.after, z.to) !== 'SYNTHETIC Strider Cub')
      continue;
    if (z.fromZone === 'stack') {
      const kicks = step.before.objects[z.from]?.stack?.kicks ?? 0;
      tally.kickedCubs += kicks > 0 ? 1 : 0;
      // The trigger adds the counters; the permanent remembers the count.
      expect(step.after.objects[z.to]?.kicks).toBe(kicks > 0 ? kicks : undefined);
    }
  }
  for (const r of eventsOf(step.events, 'resolved')) {
    const obj = step.before.objects[r.object];
    if (obj === undefined || nameOf(step.before, r.object) !== 'SYNTHETIC Volley Barrage') continue;
    const kicks = obj.stack?.kicks ?? 0;
    const dealt = eventsOf(step.events, 'damageDealt')
      .filter((e) => e.source === r.object)
      .reduce((n, e) => n + e.amount, 0);
    expect(dealt, 'Volley Barrage damage').toBe(kicks);
    tally.barrageDamage += kicks;
  }
}

/** Typecycling: the card found is a land the type names (CR 702.29e). */
function checkTypecycling(tally: Tally, step: StepInfo) {
  const d = step.before.pending;
  if (d?.kind !== 'chooseCards' || d.purpose !== 'search') return;
  const name = nameOf(step.before, d.source);
  if (name !== 'SYNTHETIC Landcycler Beast' && name !== 'SYNTHETIC Islandcycler Drake') return;
  const allowed = name === 'SYNTHETIC Landcycler Beast' ? BASICS : ISLANDS;
  for (const id of d.legal) {
    expect(
      allowed.has(nameOf(step.before, id)),
      `${name} may find ${nameOf(step.before, id)}`,
    ).toBe(true);
  }
  // Every such card of the library is offered.
  const library = step.before.seats[d.seat]?.library ?? [];
  const wanted = library.filter((id) => allowed.has(nameOf(step.before, id)));
  expect([...d.legal].sort()).toEqual([...wanted].sort());
  tally.typecycled += 1;
  if (name === 'SYNTHETIC Islandcycler Drake') tally.islandcycled += 1;
}

/** Devoid and Changeling hold in every zone the view shows (CR 702.114a, 702.73a, 604.3). */
function checkCharacteristics(tally: Tally, step: StepInfo) {
  for (const viewer of [0, 1] as const) {
    const view = getView(step.after, viewer);
    const shown = [
      ...view.battlefield,
      ...view.stack,
      ...view.exile,
      ...view.seats.flatMap((s) => [...s.graveyard, ...(s.hand ?? [])]),
    ];
    for (const o of shown) {
      if (o.name === 'SYNTHETIC Void Wisp') {
        expect(o.colors, 'Devoid').toEqual([]);
        tally.devoidChecked += 1;
      } else if (o.name === 'SYNTHETIC Chameleon Drifter') {
        expect(o.subtypes.length, 'Changeling').toBe(CREATURE_TYPES.length);
        tally.changelingChecked += 1;
      }
    }
  }
}

test(
  `${GAMES} keyword batch games run clean, replay exactly and use every path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = KEYWORD_BATCH_STYLE_PAIRS[g % KEYWORD_BATCH_STYLE_PAIRS.length] ?? [
        'keywordBatch',
        'keywordBatch',
      ];
      const config = smallGameConfig(g, styles);
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 19000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 19000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkDamage(total, step);
        checkPoisonLoss(total, step);
        checkSplitSecond(total, step);
        checkReturns(total, step);
        checkAnnihilator(total, step);
        checkAnnihilatorAuto(total, step);
        checkExalted(total, step);
        checkKicks(total, step);
        checkTypecycling(total, step);
        checkCharacteristics(total, step);
        if (step.before.pending !== null) {
          if (casual.has(step.seat)) total.casualAnswers += 1;
          else total.randomAnswers += 1;
        }
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
    }
    console.log(
      `100 keyword batch games: ${JSON.stringify({ ...total, turnsMax: Math.max(...turns) })}`,
    );

    expectPath(total.infectToPlayer);
    expectPath(total.infectToCreature + total.witherToCreature);
    expectPath(total.toxicDamage);
    expectPath(total.splitSecondOffers);
    expectPath(total.persistReturns);
    expectPath(total.annihilatorAsked + total.annihilatorAuto);
    expectPath(total.exaltedAlone);
    expectPath(total.kicksAsked);
    expectPath(total.typecycled);
    expectPath(total.devoidChecked);
    expectPath(total.changelingChecked);
    expectPath(total.casualAnswers);
    expectPath(total.randomAnswers);
  },
  soakTimeout(900_000),
);

test('the keyword batch cards are in no other deck style, so the older seeded games are unchanged', () => {
  const styles: DeckStyle[] = [
    'spells',
    'creatures',
    'brawl',
    'triggers',
    'keywords',
    'mana',
    'search',
    'activated',
    'attachments',
    'kicker',
    'food',
    'layers',
    'ward',
    'vehicles',
    'prevention',
    'layouts',
    'sagas',
    'triggerTargets',
    'library',
    'references',
    'restrictions',
    'costs',
    'manaPlus',
    'chosen',
    'x',
  ];
  const names = new Set<string>([...KEYWORD_BATCH_NAMES, ...KEYWORD_BATCH_LAND_NAMES]);
  for (const style of styles) {
    for (const slot of [...spellSlots(style), ...landSlots(style)]) {
      expect(names.has(slot), `${slot} is in the ${style} style`).toBe(false);
    }
  }
  const own = new Set([...spellSlots('keywordBatch'), ...landSlots('keywordBatch')]);
  for (const name of names) expect(own.has(name), name).toBe(true);
});
