// Slice soak (D-103): whole games (the `soakGames()` count, test/soak.ts) with the 'x' deck style (SYNTHETIC cards: "deals X damage",
// "draw X cards", "put X +1/+1 counters", "enters with X +1/+1 counters", two {X}, "pay X life" as an
// additional cost, kicker with X, a spell with a free alternative cost, activated abilities with {X}
// and "pay X life", a cost reducer, a Signet and a flicker) between random agents, with CasualAgent in
// some seats. Every game finishes with a result, no fallback, no rejected action and consistent state
// after every action; the action log replays to the same final state; and, with the rules read again
// here from the cards' texts (not from the engine's own cost and choice code), at every step:
//   - a chooseX decision is asked of the controller of a spell or ability on the stack that has an X
//     to announce (never of a spell cast without paying its mana cost), says what each point of X costs,
//     offers exactly the values 0 up to its maximum with cancel and concede, never a maximum above the
//     mana the player has (the lands, the pool and one more for each Signet, less what the rest of the
//     cost takes) or, for "pay X life", above the life they could pay (CR 107.3a, 601.2b, 119.4);
//   - the maximum is accepted and one more is refused (CR 601.2g: the cost must be payable);
//   - the announced value is on the object on the stack (and in the spellCast and abilityActivated
//     event), and the total cost it asks to pay is X generic mana for each {X} plus the rest of the cost,
//     less one for each cost reducer, never below zero (CR 107.3a, 601.2f, 118.7a);
//   - when it resolves: X damage, X cards drawn, X counters, as its text says (CR 608.2);
//   - a permanent that "enters with X counters" has as many as the X of the spell it came from, and none
//     when it was not cast, a flickered one included (CR 107.3m, 107.3g).
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
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import {
  type DeckStyle,
  landSlots,
  type StepInfo,
  smallGameConfig,
  spellSlots,
  stepGame,
  X_SPELL_NAMES,
  X_STYLE_PAIRS,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

/** What one point of X costs, restated from the cards' texts (src/cards/fixtures/synthetic-x.ts). */
const PER_X: Readonly<Record<string, { mana: number; life: number }>> = {
  'SYNTHETIC X Burn': { mana: 1, life: 0 },
  'SYNTHETIC X Draw': { mana: 1, life: 0 },
  'SYNTHETIC Double X Draw': { mana: 2, life: 0 },
  'SYNTHETIC X Pump': { mana: 1, life: 0 },
  'SYNTHETIC Hydra Cub': { mana: 1, life: 0 },
  'SYNTHETIC Blood Burn': { mana: 0, life: 1 },
  'SYNTHETIC Kicked X Burn': { mana: 1, life: 0 },
  'SYNTHETIC Free X Burn': { mana: 1, life: 0 },
  'SYNTHETIC X Cannon': { mana: 1, life: 0 },
  'SYNTHETIC Blood Lance': { mana: 0, life: 1 },
  'SYNTHETIC Double Well': { mana: 2, life: 0 },
};
/** The mana symbols the cost has besides {X}, restated from the texts: what the rest of the cost asks. */
const REST: Readonly<Record<string, readonly string[]>> = {
  'SYNTHETIC X Burn': ['R'],
  'SYNTHETIC X Draw': ['U'],
  'SYNTHETIC Double X Draw': ['U'],
  'SYNTHETIC X Pump': ['G'],
  'SYNTHETIC Hydra Cub': ['G'],
  'SYNTHETIC Blood Burn': ['R'],
  'SYNTHETIC Kicked X Burn': ['R'],
  'SYNTHETIC Free X Burn': ['R'],
  'SYNTHETIC X Cannon': [],
  'SYNTHETIC Blood Lance': [],
  'SYNTHETIC Double Well': [],
};
/** Damage spells, by who deals the damage on resolution: the spell itself, or the permanent. */
const SPELL_DAMAGE = new Set([
  'SYNTHETIC X Burn',
  'SYNTHETIC Blood Burn',
  'SYNTHETIC Kicked X Burn',
  'SYNTHETIC Free X Burn',
]);
const ABILITY_DAMAGE = new Set(['SYNTHETIC X Cannon', 'SYNTHETIC Blood Lance']);
const DRAWS = new Set(['SYNTHETIC X Draw', 'SYNTHETIC Double X Draw', 'SYNTHETIC Double Well']);
const ADDS_COUNTERS = new Set(['SYNTHETIC X Pump']);

interface Tally {
  askedSpell: number;
  askedAbility: number;
  askedLife: number;
  askedDouble: number;
  maxLimitedByLife: number;
  autoZero: number;
  freeCasts: number;
  castWithX: number;
  castKickedWithX: number;
  paymentsChecked: number;
  reducedPayments: number;
  damageChecked: number;
  drawChecked: number;
  countersChecked: number;
  hydraFromStack: number;
  hydraWithCounters: number;
  hydraNotCast: number;
  casualAnswers: number;
  randomAnswers: number;
  boundsChecked: number;
}
const newTally = (): Tally => ({
  askedSpell: 0,
  askedAbility: 0,
  askedLife: 0,
  askedDouble: 0,
  maxLimitedByLife: 0,
  autoZero: 0,
  freeCasts: 0,
  castWithX: 0,
  castKickedWithX: 0,
  paymentsChecked: 0,
  reducedPayments: 0,
  damageChecked: 0,
  drawChecked: 0,
  countersChecked: 0,
  hydraFromStack: 0,
  hydraWithCounters: 0,
  hydraNotCast: 0,
  casualAnswers: 0,
  randomAnswers: 0,
  boundsChecked: 0,
});

/** The name of the card behind an object: the spell's own, or the permanent an ability belongs to. */
function nameOf(state: GameState, id: ObjectId): string {
  const obj = state.objects[id];
  if (obj === undefined) return '';
  const origin = obj.stack?.kind === 'ability' && obj.stack.source !== null ? obj.stack.source : id;
  const card = state.objects[origin];
  if (card === undefined) return state.lki[origin]?.characteristics.name ?? '';
  if (card.token !== null) return card.token.characteristics.name;
  if (card.card === null) return '';
  return state.definitions[state.cards[card.card]?.definition ?? -1]?.faces[card.face]?.name ?? '';
}

const discountsOf = (state: GameState, seat: number): number =>
  state.battlefield.filter(
    (id) =>
      state.objects[id]?.controller === seat && nameOf(state, id) === 'SYNTHETIC Spell Discount',
  ).length;

/** The mana a seat could make: untapped lands, the pool, and one more for each untapped Signet. */
function manaAvailable(state: GameState, seat: number): number {
  const mine = state.battlefield.filter((id) => state.objects[id]?.controller === seat);
  const untapped = mine.filter((id) => state.objects[id]?.tapped === false);
  const lands = untapped.filter((id) => {
    const card = state.objects[id]?.card;
    const face =
      card == null ? null : state.definitions[state.cards[card]?.definition ?? -1]?.faces[0];
    return face?.types.includes('land') === true;
  }).length;
  const signets = untapped.filter((id) => nameOf(state, id) === 'SYNTHETIC Signet').length;
  return lands + signets + (state.seats[seat]?.manaPool.length ?? 0);
}

/** The decision is asked as the rules say, and its offer is what the engine accepts. */
function checkAsk(tally: Tally, casual: ReadonlySet<number>, step: StepInfo) {
  const d = step.before.pending;
  if (d?.kind !== 'chooseX') return;
  const state = step.before;
  const obj = state.objects[d.source];
  expect(obj, 'the source is on the stack').toBeDefined();
  if (obj === undefined) return;
  expect(obj.zone).toBe('stack');
  const name = nameOf(state, d.source);
  const per = PER_X[name];
  expect(per, `${name} has an X to announce`).toBeDefined();
  if (per === undefined) return;
  expect(d.perX, `what a point of X costs for ${name}`).toEqual(per);
  expect(d.seat).toBe(obj.controller);
  expect(d.purpose).toBe(obj.stack?.kind === 'spell' ? 'spell' : 'ability');
  expect(d.min).toBe(0);
  expect(d.max, 'there is something to announce').toBeGreaterThanOrEqual(1);
  // CR 107.3b: a spell cast without paying its mana cost has X = 0 and announces nothing.
  expect(obj.stack?.free, `${name} was cast free`).not.toBe(true);
  expect(getLegalActions(state, d.seat), 'legal actions').toEqual([
    ...Array.from({ length: d.max + 1 }, (_, value) => ({ kind: 'chooseX', value })),
    { kind: 'cancel' },
    { kind: 'concede' },
  ]);
  if (d.purpose === 'spell') tally.askedSpell += 1;
  else tally.askedAbility += 1;
  if (per.life > 0) tally.askedLife += 1;
  if (per.mana === 2) tally.askedDouble += 1;
  if (casual.has(d.seat)) tally.casualAnswers += 1;
  else tally.randomAnswers += 1;

  const life = state.seats[d.seat]?.life ?? 0;
  if (per.life > 0) {
    // "Pay X life": a spell or an ability may pay the whole life total (CR 119.4, D-155).
    expect(d.max, `${name} life limit`).toBe(life);
    tally.maxLimitedByLife += 1;
  }
  if (per.mana > 0) {
    // The rest of the cost: its symbols, the kicker, less the reducers' generic mana (CR 118.7a).
    const rest = (REST[name] ?? []).length + (obj.stack?.kicked === true ? 2 : 0);
    const reduction = obj.stack?.kind === 'spell' ? discountsOf(state, d.seat) : 0;
    const generic = (REST[name] ?? []).filter((s) => /^\d+$/.test(s)).length;
    const keptByColor = rest - generic; // reducers take generic mana only
    const spent = Math.max(keptByColor, d.max * per.mana + rest - reduction);
    expect(spent, `${name} X ${d.max} costs more than the mana there is`).toBeLessThanOrEqual(
      manaAvailable(state, d.seat),
    );
    tally.boundsChecked += 1;
  }
  // The most is accepted and one more is refused.
  expect(applyAction(state, d.seat, { kind: 'chooseX', value: d.max }).ok, 'max').toBe(true);
  expect(applyAction(state, d.seat, { kind: 'chooseX', value: d.max + 1 }).ok, 'max + 1').toBe(
    false,
  );
}

/** After the answer, the value is on the object, and at the payment it is in the cost. */
function checkAnswer(tally: Tally, step: StepInfo) {
  const before = step.before.pending;
  if (before?.kind === 'chooseX' && step.action.kind === 'chooseX') {
    const stack = step.after.objects[before.source]?.stack;
    expect(stack?.x, 'the announced X is on the stack object').toBe(step.action.value);
  }
  const cast = step.events.find((e) => e.kind === 'spellCast');
  if (cast?.kind === 'spellCast') {
    const x = step.after.objects[cast.object]?.stack?.x ?? null;
    expect(cast.x ?? null, 'the spellCast event says X').toBe(x);
    const name = nameOf(step.after, cast.object);
    if (
      cast.alternative === 'free' &&
      PER_X[name] !== undefined &&
      name !== 'SYNTHETIC Hydra Cub'
    ) {
      tally.freeCasts += 1;
      expect(cast.x, 'a free cast has no X').toBeUndefined();
    }
    if (cast.x !== undefined) {
      tally.castWithX += 1;
      if (cast.x === 0) tally.autoZero += 1;
      if (cast.kicked === true) tally.castKickedWithX += 1;
    }
  }
  const act = step.events.find((e) => e.kind === 'abilityActivated');
  if (act?.kind === 'abilityActivated' && act.stackObject !== null) {
    expect(act.x ?? null).toBe(step.after.objects[act.stackObject]?.stack?.x ?? null);
  }
}

/** The mana asked for an X spell or ability is the rule's: X generic per {X}, plus the rest. */
function checkPayment(tally: Tally, step: StepInfo) {
  const d = step.before.pending;
  if (d?.kind !== 'payMana' || d.purpose !== undefined) return;
  const state = step.before;
  const obj = state.objects[d.source];
  const x = obj?.stack?.x;
  const name = nameOf(state, d.source);
  const per = PER_X[name];
  if (obj === undefined || x == null || per === undefined || per.mana === 0) return;
  const kicked = obj.stack?.kicked === true ? 2 : 0;
  const rest = REST[name] ?? [];
  const reduction = obj.stack?.kind === 'spell' ? discountsOf(state, d.seat) : 0;
  const generic = Math.max(0, x * per.mana + kicked - reduction);
  const numeric = d.totalCost.filter((s) => /^\d+$/.test(s)).reduce((n, s) => n + Number(s), 0);
  const other = d.totalCost.filter((s) => !/^\d+$/.test(s));
  expect(numeric, `${name} X ${x}: generic mana in ${d.totalCost.join('')}`).toBe(generic);
  expect([...other].sort(), `${name} colored mana`).toEqual([...rest].sort());
  tally.paymentsChecked += 1;
  if (reduction > 0 && x * per.mana + kicked > 0) tally.reducedPayments += 1;
}

const eventsOf = <K extends GameEvent['kind']>(events: readonly GameEvent[], kind: K) =>
  events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

/** What a resolving spell or ability with an X did, read from the events (CR 608.2). */
function checkResolution(tally: Tally, step: StepInfo) {
  for (const done of eventsOf(step.events, 'resolved')) {
    const obj = step.before.objects[done.object];
    const x = obj?.stack?.x;
    if (obj === undefined || x == null) continue;
    const name = nameOf(step.before, done.object);
    const source = obj.stack?.kind === 'ability' ? (obj.stack.source ?? done.object) : done.object;
    if (SPELL_DAMAGE.has(name) || ABILITY_DAMAGE.has(name)) {
      const dealt = eventsOf(step.events, 'damageDealt')
        .filter((e) => e.source === source)
        .reduce((n, e) => n + e.amount, 0);
      expect(dealt, `${name} X ${x} damage`).toBe(x);
      tally.damageChecked += 1;
    } else if (DRAWS.has(name)) {
      const drawn = eventsOf(step.events, 'cardDrawn').filter((e) => e.seat === obj.controller);
      if (eventsOf(step.events, 'drewFromEmptyLibrary').length === 0) {
        expect(drawn.length, `${name} X ${x} cards`).toBe(x);
        tally.drawChecked += 1;
      }
    } else if (ADDS_COUNTERS.has(name)) {
      const added = eventsOf(step.events, 'counterAdded')
        .filter((e) => e.counter === '+1/+1')
        .reduce((n, e) => n + e.count, 0);
      expect(added, `${name} X ${x} counters`).toBe(x);
      tally.countersChecked += 1;
    }
  }
}

/** "Enters with X counters": the spell's X when it was cast, none for a permanent that was not. */
function checkHydra(tally: Tally, step: StepInfo) {
  for (const e of eventsOf(step.events, 'zoneChanged')) {
    if (e.toZone !== 'battlefield' || nameOf(step.after, e.to) !== 'SYNTHETIC Hydra Cub') continue;
    const have = step.after.objects[e.to]?.counters['+1/+1'] ?? 0;
    if (e.fromZone === 'stack') {
      const x = step.before.objects[e.from]?.stack?.x ?? 0;
      expect(have, `Hydra Cub cast with X ${x}`).toBe(x);
      tally.hydraFromStack += 1;
      if (x > 0) tally.hydraWithCounters += 1;
    } else {
      expect(have, `Hydra Cub entered from ${e.fromZone}, not cast`).toBe(0);
      tally.hydraNotCast += 1;
    }
  }
}

test(
  `${GAMES} X games run clean, replay exactly and use every path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = X_STYLE_PAIRS[g % X_STYLE_PAIRS.length] ?? ['x', 'x'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 17000 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 17000 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkAsk(total, casual, step);
        checkAnswer(total, step);
        checkPayment(total, step);
        checkResolution(total, step);
        checkHydra(total, step);
        const problems = checkInvariants(step.after);
        if (problems.length > 0) throw new Error(`game ${g}: ${problems.join('; ')}`);
      });
      const tag = `game ${g}`;
      expect(run.capped, tag).toBe(false);
      expect(run.state.result, tag).not.toBeNull();
      for (const agent of agents) expect(agent.fallbacks, tag).toHaveLength(0);
      // The log replays to the same game.
      expect(stateHash(replayGame(config, log)), tag).toBe(stateHash(run.state));
      turns.push(run.state.turn.number);
    }
    console.log(`100 X games: ${JSON.stringify({ ...total, turnsMax: Math.max(...turns) })}`);

    expectPath(total.askedSpell);
    expectPath(total.askedAbility);
    expectPath(total.askedLife);
    expectPath(total.askedDouble);
    expectPath(total.maxLimitedByLife);
    expectPath(total.boundsChecked);
    expectPath(total.autoZero);
    expectPath(total.freeCasts);
    expectPath(total.castWithX);
    expectPath(total.castKickedWithX);
    expectPath(total.paymentsChecked);
    expectPath(total.reducedPayments);
    expectPath(total.damageChecked);
    expectPath(total.drawChecked);
    expectPath(total.countersChecked);
    expectPath(total.hydraFromStack);
    expectPath(total.hydraWithCounters);
    expectPath(total.hydraNotCast);
    expectPath(total.casualAnswers);
    expectPath(total.randomAnswers);
  },
  soakTimeout(600_000),
);

test('the X cards are in no other deck style, so the older seeded games are unchanged', () => {
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
  ];
  const names = new Set<string>(X_SPELL_NAMES);
  for (const style of styles) {
    for (const slot of [...spellSlots(style), ...landSlots(style)]) {
      expect(names.has(slot), `${slot} is in the ${style} style`).toBe(false);
    }
  }
  // And the X style does use them all.
  const own = new Set([...spellSlots('x'), ...landSlots('x')]);
  for (const name of names) expect(own.has(name), name).toBe(true);
});
