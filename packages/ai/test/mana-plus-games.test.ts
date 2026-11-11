// Slice soak (D-099): whole games (the `soakGames()` count, test/soak.ts) with the 'manaPlus' deck style (SYNTHETIC cards: lands that make a
// color an opponent land could produce, filter lands with a hybrid cost and a choice of combinations,
// "Activate only if" lands, life-cost mana abilities, a Lantern that gives lands a mana ability, a gated
// activated ability) between random agents, with CasualAgent in some seats. Every game finishes with a
// result, no fallback, no rejected action and consistent state after every action; the action log
// replays to the same final state; and, with the rules read again here from the views and the events
// (not from the engine's mana code), at every priority decision:
//   - an Orchard or a Fellwar Rock on offer lists exactly the colors that lands the opponent controls
//     could produce, found by a fixed point over the board (CR 106.7: costs and restrictions ignored,
//     "could produce" abilities look at each other, colorless is not a color);
//   - a Temple's {C}{C} is on offer exactly when its controller controls five lands, a Tainted Land's
//     second ability exactly when they control a Swamp, a Gated Fountain's ability exactly then too
//     (CR 602.5b);
//   - a life-cost mana source is on offer exactly when the life total is at least the payment
//     (CR 119.4), a filter land's combinations exactly when the pool holds a half of its hybrid cost
//     (CR 107.4e), a Prism Lantern gives every untapped land its controller has any color;
// and after every action that taps a source: the mana added and the life paid are the ones the source
// makes and costs, and automatic payment never takes a player with life to 0 (CR 119.4).
import {
  checkInvariants,
  type GameEvent,
  type GameState,
  type ManaColor,
  type ObjectId,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { MANA_PLUS_STYLE_PAIRS, type StepInfo, smallGameConfig, stepGame } from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };
const ORDER: readonly ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];
const inOrder = (colors: Iterable<ManaColor>): ManaColor[] => {
  const set = new Set(colors);
  return ORDER.filter((c) => set.has(c));
};

/** What each land makes by itself, restated from the cards' texts (colorless included). */
const MAKES: Readonly<Record<string, string>> = {
  Plains: 'W',
  Island: 'U',
  Swamp: 'B',
  Mountain: 'R',
  Forest: 'G',
  'SYNTHETIC Filter Land': 'CRW',
  'SYNTHETIC Bare Filter Land': 'UB',
  'SYNTHETIC Twist Filter Land': 'GW',
  'SYNTHETIC Temple': 'C',
  'SYNTHETIC Tainted Land': 'CBG',
  'SYNTHETIC Confluence': 'WUBRG',
  // The lands of the ordinary decks that the other seat may play.
  'SYNTHETIC Tapped Land': 'G',
  'SYNTHETIC Treasure Land': 'C',
  'SYNTHETIC Dual Land': 'UB',
  'SYNTHETIC Tri Land': 'WUB',
  'SYNTHETIC Pain Land': 'CUB',
  'SYNTHETIC Gain Land': 'W',
  'SYNTHETIC Drain Land': 'B',
  'SYNTHETIC Basic Check Land': 'WU',
  'SYNTHETIC Other Lands Land': 'R',
  'SYNTHETIC Crowd Land': 'G',
  'SYNTHETIC Shock Land': 'RG',
};
const LIFE_COST: Readonly<Record<string, number>> = {
  'SYNTHETIC Confluence': 1,
  'SYNTHETIC Blood Rock': 2,
};
const FILTERS: Readonly<Record<string, readonly string[]>> = {
  'SYNTHETIC Filter Land': ['RR', 'WR', 'WW'],
  'SYNTHETIC Bare Filter Land': ['UU', 'UB', 'BB'],
};
const HYBRID_HALVES: Readonly<Record<string, string>> = {
  'SYNTHETIC Filter Land': 'RW',
  'SYNTHETIC Bare Filter Land': 'UB',
};

interface Tally {
  orchardOffers: number;
  orchardNothing: number;
  orchardSeveral: number;
  templeOn: number;
  templeOff: number;
  taintedOn: number;
  taintedOff: number;
  fountainOn: number;
  fountainOff: number;
  lifeOffered: number;
  lifeWithheld: number;
  filterOffered: number;
  filterManual: number;
  filterAuto: number;
  lanternOffers: number;
  lifeTaps: number;
  autoLifeSpent: number;
  casualNewSource: number;
  orchardTaps: number;
  wiped: number;
}
const newTally = (): Tally => ({
  orchardOffers: 0,
  orchardNothing: 0,
  orchardSeveral: 0,
  templeOn: 0,
  templeOff: 0,
  taintedOn: 0,
  taintedOff: 0,
  fountainOn: 0,
  fountainOff: 0,
  lifeOffered: 0,
  lifeWithheld: 0,
  filterOffered: 0,
  filterManual: 0,
  filterAuto: 0,
  lanternOffers: 0,
  lifeTaps: 0,
  autoLifeSpent: 0,
  casualNewSource: 0,
  orchardTaps: 0,
  wiped: 0,
});

/**
 * The types of mana each land could produce (CR 106.7) as a fixed point over the board: what a land
 * makes by itself, what a Lantern of its controller gives it, and what the lands an Orchard or a Pond
 * looks at could produce. Restated here from the cards' texts.
 */
function couldProduce(
  board: readonly ObjectView[],
  identity: (seat: number) => string,
  state: GameState,
): Map<ObjectId, Set<string>> {
  const lands = board.filter((o) => o.types.includes('land'));
  // A Lantern gives its controller's lands a mana ability, unless "loses all abilities" came later
  // (CR 613.1f, 613.7: the timestamp of the Lantern against that of the effect).
  const stamp = (id: ObjectId): number => state.objects[id]?.timestamp ?? 0;
  const lanterns = (seat: number, name: string): number[] =>
    board.filter((o) => o.controller === seat && o.name === name).map((o) => stamp(o.id));
  const types = new Map<ObjectId, Set<string>>();
  for (const land of lands) {
    const lostAt = lostAbilitiesAt(state, land.id);
    const set = new Set<string>();
    if (lostAt < 0) {
      // Command Tower makes the colors of its controller's commander (CR 903.4).
      const own =
        land.name === 'Command Tower' ? identity(land.controller) : (MAKES[land.name] ?? '');
      for (const c of own) set.add(c);
    }
    if (lanterns(land.controller, 'SYNTHETIC Prism Lantern').some((t) => t > lostAt)) {
      for (const c of 'WUBRG') set.add(c);
    }
    if (lanterns(land.controller, 'SYNTHETIC Murk Lantern').some((t) => t > lostAt)) set.add('B');
    types.set(land.id, set);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const land of lands) {
      const mine = types.get(land.id) as Set<string>;
      const add = (from: ObjectView, colorless: boolean) => {
        for (const t of types.get(from.id) ?? []) {
          if ((t === 'C' && !colorless) || mine.has(t)) continue;
          mine.add(t);
          changed = true;
        }
      };
      if (lostAbilitiesAt(state, land.id) >= 0) continue;
      if (land.name === 'SYNTHETIC Orchard') {
        for (const other of lands) if (other.controller !== land.controller) add(other, false);
      }
      if (land.name === 'SYNTHETIC Reflecting Pond') {
        for (const other of lands) if (other.controller === land.controller) add(other, true);
      }
    }
  }
  return types;
}

/** What an Orchard or a Fellwar Rock of `seat` could make: colors of the opponents' lands. */
function opponentColors(board: readonly ObjectView[], seat: number, state: GameState): ManaColor[] {
  const types = couldProduce(board, identityOf(state), state);
  const found = new Set<ManaColor>();
  for (const land of board) {
    if (!land.types.includes('land') || land.controller === seat) continue;
    for (const t of types.get(land.id) ?? []) if (t !== 'C') found.add(t as ManaColor);
  }
  return inOrder(found);
}

/**
 * A permanent as this test reads it: name, types and subtypes from the card (none of this slice's cards
 * changes them), controller and tapped state from the object. Tokens have no card and are left out.
 */
interface Permanent {
  readonly id: ObjectId;
  readonly name: string;
  readonly controller: number;
  readonly tapped: boolean;
  readonly types: readonly string[];
  readonly subtypes: readonly string[];
}
type ObjectView = Permanent;

function boardOf(state: GameState): Permanent[] {
  const out: Permanent[] = [];
  for (const id of state.battlefield) {
    const obj = state.objects[id];
    const card = obj?.card;
    if (obj === undefined || card === null || card === undefined) continue;
    const face = state.definitions[state.cards[card]?.definition ?? -1]?.faces[obj.face];
    if (face === undefined) continue;
    out.push({
      id,
      name: face.name,
      controller: obj.controller,
      tapped: obj.tapped,
      types: face.types,
      subtypes: face.subtypes,
    });
  }
  return out;
}

/** Whether the permanent is one of the cards this soak test looks at. */
function isSliceCard(state: GameState, id: ObjectId): boolean {
  const card = state.objects[id]?.card;
  const name =
    card === null || card === undefined
      ? ''
      : (state.definitions[state.cards[card]?.definition ?? -1]?.name ?? '');
  return SLICE_NAMES.has(name);
}
const SLICE_NAMES: ReadonlySet<string> = new Set([
  'SYNTHETIC Orchard',
  'SYNTHETIC Fellwar Rock',
  'SYNTHETIC Reflecting Pond',
  'SYNTHETIC Filter Land',
  'SYNTHETIC Bare Filter Land',
  'SYNTHETIC Temple',
  'SYNTHETIC Tainted Land',
  'SYNTHETIC Gated Fountain',
  'SYNTHETIC Confluence',
  'SYNTHETIC Blood Rock',
  'SYNTHETIC Prism Lantern',
]);

/** The timestamp of the latest "loses all abilities" effect on the object, or -1 when it has none. */
const lostAbilitiesAt = (state: GameState, id: ObjectId): number =>
  Math.max(
    -1,
    ...state.continuousEffects
      .filter((e) => e.change.kind === 'loseAllAbilities' && e.objects.includes(id))
      .map((e) => e.timestamp),
  );

/** The colors in the color identity of a seat's commanders, read from the game state. */
const identityOf =
  (state: GameState) =>
  (seat: number): string =>
    (state.seats[seat]?.commanders ?? [])
      .flatMap(
        (card) => state.definitions[state.cards[card]?.definition ?? -1]?.colorIdentity ?? [],
      )
      .join('');

function checkOffers(tally: Tally, step: StepInfo): void {
  const d = step.before.pending;
  if (d?.kind !== 'priority') return;
  // Nothing to look at unless a card of this slice is on the battlefield (the view is the costly part).
  if (!step.before.battlefield.some((id) => isSliceCard(step.before, id))) return;
  const board = boardOf(step.before);
  const mine = board.filter((o) => o.controller === d.seat && !o.tapped);
  const pool = step.before.seats[d.seat]?.manaPool ?? [];
  const life = step.before.seats[d.seat]?.life ?? 0;
  // What is on offer for the ability of that index of the source ("-": one thing, no choice). The
  // abilities a Lantern gives come after the printed ones, so the index tells them apart.
  const colorsOffered = (id: ObjectId, index: number): string[] =>
    d.options.flatMap((o) =>
      o.kind === 'activateAbility' && o.source === id && o.abilityIndex === index
        ? [o.combination ? o.combination.join('') : (o.color ?? '-')]
        : [],
    );
  const grantedOffers = (id: ObjectId): string[] =>
    d.options.flatMap((o) =>
      o.kind === 'activateAbility' && o.source === id && o.abilityIndex >= 1 && o.color !== null
        ? [o.color]
        : [],
    );
  const lands = board.filter((o) => o.controller === d.seat && o.types.includes('land'));
  const swamps = lands.filter((o) => o.subtypes.includes('Swamp')).length;
  for (const o of mine) {
    if (lostAbilitiesAt(step.before, o.id) >= 0) {
      // It lost all abilities: nothing is on offer unless a Lantern came after the effect (CR 613.7).
      const lostAt = lostAbilitiesAt(step.before, o.id);
      const later = board.some(
        (x) =>
          x.controller === o.controller &&
          x.name.endsWith('Lantern') &&
          (step.before.objects[x.id]?.timestamp ?? 0) > lostAt,
      );
      const any = d.options.some((x) => x.kind === 'activateAbility' && x.source === o.id);
      if (!later) expect(any, `${o.name} lost its abilities`).toBe(false);
      tally.wiped += 1;
      continue;
    }
    if (o.name === 'SYNTHETIC Orchard' || o.name === 'SYNTHETIC Fellwar Rock') {
      const want = opponentColors(board, d.seat, step.before);
      const got = colorsOffered(o.id, 0).filter((c) => c !== '-');
      expect(got, `${o.name} offers`).toEqual(want);
      if (want.length === 0) tally.orchardNothing += 1;
      else tally.orchardOffers += 1;
      if (want.length > 1) tally.orchardSeveral += 1;
    }
    if (o.name === 'SYNTHETIC Temple') {
      const on = lands.length >= 5;
      expect(colorsOffered(o.id, 0), 'Temple').toEqual(on ? ['-'] : []);
      if (on) tally.templeOn += 1;
      else tally.templeOff += 1;
    }
    if (o.name === 'SYNTHETIC Tainted Land') {
      expect(colorsOffered(o.id, 1), 'Tainted Land').toEqual(swamps > 0 ? ['B', 'G'] : []);
      if (swamps > 0) tally.taintedOn += 1;
      else tally.taintedOff += 1;
    }
    if (o.name === 'SYNTHETIC Gated Fountain') {
      const listed = d.options.some((x) => x.kind === 'activate' && x.object === o.id);
      expect(listed, 'Gated Fountain').toBe(swamps > 0);
      if (swamps > 0) tally.fountainOn += 1;
      else tally.fountainOff += 1;
    }
    const cost = LIFE_COST[o.name];
    if (cost !== undefined) {
      const listed = colorsOffered(o.id, 0).length > 0;
      expect(listed, `${o.name} at ${life} life`).toBe(life >= cost);
      if (life >= cost) tally.lifeOffered += 1;
      else tally.lifeWithheld += 1;
    }
    const halves = HYBRID_HALVES[o.name];
    if (halves !== undefined) {
      const payable = pool.some((m) => m.restriction === null && halves.includes(m.color));
      // The Filter Land taps for {C} first; the Bare one has only the filter ability.
      const combos = colorsOffered(o.id, o.name === 'SYNTHETIC Filter Land' ? 1 : 0);
      // In ORDER (W, U, B, R, G): {R}{W} is "WR", {U}{B} is "UB".
      const want = payable ? FILTERS[o.name]?.slice().sort() : [];
      expect(
        combos.slice().sort(),
        `${o.name} with pool ${pool.map((m) => m.color).join('')}`,
      ).toEqual(want);
      if (payable) tally.filterOffered += 1;
    }
  }
  // A Prism Lantern gives every untapped land its controller has "{T}: Add one mana of any color".
  if (mine.some((o) => o.name === 'SYNTHETIC Prism Lantern')) {
    for (const o of mine.filter((x) => x.types.includes('land'))) {
      const granted = new Set(grantedOffers(o.id));
      for (const c of 'WUBRG') expect(granted.has(c), `${o.name} granted ${c}`).toBe(true);
      tally.lanternOffers += 1;
    }
  }
}

const nameOf = (view: readonly ObjectView[], id: ObjectId): string =>
  view.find((o) => o.id === id)?.name ?? '?';

/** What one applied action did to the mana pool and life, against what its sources make and cost. */
function checkTaps(tally: Tally, casual: ReadonlySet<number>, step: StepInfo): void {
  const { before, after, events, seat, action } = step;
  if (action.kind !== 'activateAbility' && action.kind !== 'payAuto') return;
  const view = boardOf(before);
  const tapped = events.filter(
    (e): e is Extract<GameEvent, { kind: 'tapped' }> => e.kind === 'tapped',
  );
  const lifeLost = events
    .filter(
      (e): e is Extract<GameEvent, { kind: 'lifeChanged' }> =>
        e.kind === 'lifeChanged' && e.seat === seat,
    )
    .reduce((n, e) => n + (e.from - e.to), 0);

  if (action.kind === 'activateAbility') {
    const name = nameOf(view, action.source);
    const poolBefore = before.seats[seat]?.manaPool ?? [];
    const poolAfter = after.seats[seat]?.manaPool ?? [];
    const made = poolAfter.filter((m) => m.source === action.source);
    const had = poolBefore.filter((m) => m.source === action.source);
    const gained = made.length - had.length;
    // Only the printed ability (index 0) costs life: a Lantern's granted ones are free.
    const cost = action.abilityIndex === 0 ? (LIFE_COST[name] ?? 0) : 0;
    if (cost > 0) {
      tally.lifeTaps += 1;
      expect(lifeLost, `${name}: life paid`).toBe(cost);
    }
    if (action.combination !== undefined) {
      tally.filterManual += 1;
      expect(gained, `${name}: combination size`).toBe(action.combination.length);
      expect(inOrder(made.map((m) => m.color).slice(had.length)), name).toEqual(
        inOrder(action.combination),
      );
      // The hybrid symbol was paid from the pool: one mana of one of its halves left it.
      expect(poolAfter.length - poolBefore.length, `${name}: pool size`).toBe(gained - 1);
    }
    // Ability 0 is the printed one: a Lantern's granted abilities (index 1 and up) make any color.
    if (
      (name === 'SYNTHETIC Orchard' || name === 'SYNTHETIC Fellwar Rock') &&
      action.abilityIndex === 0
    ) {
      tally.orchardTaps += 1;
      const allowed = opponentColors(view, seat, before);
      if (action.color !== null) expect(allowed).toContain(action.color);
    }
  }

  if (action.kind === 'payAuto') {
    const sources = tapped.map((e) => nameOf(view, e.object));
    const cost = sources.reduce((n, s) => n + (LIFE_COST[s] ?? 0), 0);
    // The life paid is exactly what the tapped sources cost (no Phyrexian mana); the old pain, drain
    // and gain lands of the ordinary decks change life on top, so they are left out of this check.
    const sideEffects = sources.some((s) =>
      ['SYNTHETIC Pain Land', 'SYNTHETIC Drain Land', 'SYNTHETIC Gain Land'].includes(s),
    );
    // A Lantern gives such a source a free ability to use instead (CR 613.1f): then it may cost less.
    const lantern = view.some(
      (o) =>
        o.controller === seat &&
        (o.name === 'SYNTHETIC Prism Lantern' || o.name === 'SYNTHETIC Murk Lantern'),
    );
    if (!sideEffects) {
      const check = expect(lifeLost, `payAuto with ${sources.join(', ')}`);
      if (lantern) check.toBeLessThanOrEqual(cost);
      else check.toBe(cost);
    }
    if (cost > 0) tally.autoLifeSpent += cost;
    // Automatic payment never takes its own player to 0 (CR 119.4): the planner is given life - 1.
    const lifeBefore = before.seats[seat]?.life ?? 0;
    if (lifeBefore >= 1)
      expect(after.seats[seat]?.life ?? 0, 'life after payAuto').toBeGreaterThanOrEqual(1);
    if (sources.some((s) => s in FILTERS)) tally.filterAuto += 1;
    if (
      casual.has(seat) &&
      sources.some(
        (s) => s in MAKES && !['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].includes(s),
      )
    ) {
      tally.casualNewSource += 1;
    }
    if (sources.some((s) => s === 'SYNTHETIC Orchard' || s === 'SYNTHETIC Fellwar Rock')) {
      tally.orchardTaps += 1;
    }
  }
}

test(
  `${GAMES} more-mana games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = MANA_PLUS_STYLE_PAIRS[g % MANA_PLUS_STYLE_PAIRS.length] ?? [
        'manaPlus',
        'manaPlus',
      ];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 15500 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 15500 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        checkOffers(total, step);
        checkTaps(total, casual, step);
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
    console.log(
      `100 more-mana games: ${JSON.stringify({ ...total, turnsMax: Math.max(...turns) })}`,
    );

    expectPath(total.wiped);
    expectPath(total.orchardOffers);
    expectPath(total.orchardNothing);
    expectPath(total.orchardSeveral);
    expectPath(total.orchardTaps);
    expectPath(total.templeOn);
    expectPath(total.templeOff);
    expectPath(total.taintedOn);
    expectPath(total.taintedOff);
    expectPath(total.fountainOn);
    expectPath(total.fountainOff);
    expectPath(total.lifeOffered);
    expectPath(total.lifeWithheld);
    expectPath(total.filterOffered);
    expectPath(total.filterManual);
    expectPath(total.filterAuto);
    expectPath(total.lanternOffers);
    expectPath(total.lifeTaps);
    expectPath(total.autoLifeSpent);
    expectPath(total.casualNewSource);
  },
  soakTimeout(600_000),
);
