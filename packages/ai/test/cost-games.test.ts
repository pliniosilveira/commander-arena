// Slice soak: whole games (the `soakGames()` count, test/soak.ts) with the 'costs' deck style (SYNTHETIC cards of D-095: additional costs
// to cast, cost reductions, counted amounts, free casts with a commander, Ward and an ability that
// discard) between random agents, with CasualAgent in some seats. Every game finishes with a result,
// no fallback, no rejected action and consistent state after every action; the action log replays to
// the same final state; and every new path occurs and is checked against the state around it, with
// the rules read again here from the views and the events, not from the engine's cost code:
//   - the total cost locked in for a cast is the printed mana cost (or nothing for a free cast) plus
//     tax, kicker and additional mana, with its generic part reduced by the spell's own count and the
//     bench, chant, giant and haze permanents on the board, never below zero and never touching the
//     colored part (CR 118.7a, 601.2f);
//   - a spell with an additional cost that was cast paid it: one sacrifice of the right kind of
//     permanent, exactly the cards to discard, the life (CR 118.8, 601.2h);
//   - a free cast happens only while its caster controls a commander (CR 118.9, 903.3d);
//   - a discard paid for Ward or an ability left the hand.
import {
  checkInvariants,
  type GameEvent,
  type GameState,
  getView,
  type ObjectView,
  parseManaCost,
  stateHash,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { type Agent, CasualAgent, RandomLegalAgent, replayGame } from '../src/index';
import { cardNameOf } from './game-names';
import {
  COST_CARD_NAMES,
  COST_STYLE_PAIRS,
  type StepInfo,
  smallGameConfig,
  stepGame,
} from './helpers';
import { expectPath, soakGames, soakTimeout } from './soak';

const GAMES = soakGames();
const LIMITS = { maxTurns: 150, maxActions: 5000 };

interface Tally {
  casts: number;
  freeCasts: number;
  casualFree: number;
  sacrificeCasts: number;
  discardCasts: number;
  lifeCasts: number;
  mixedCasts: number;
  lockedChecks: number;
  reducedChecks: number;
  zeroManaChecks: number;
  wardDiscards: number;
  abilityDiscards: number;
  countedEffects: number;
  casualSacrificeCasts: number;
  byCard: Map<string, number>;
}

const newTally = (): Tally => ({
  casts: 0,
  freeCasts: 0,
  casualFree: 0,
  sacrificeCasts: 0,
  discardCasts: 0,
  lifeCasts: 0,
  mixedCasts: 0,
  lockedChecks: 0,
  reducedChecks: 0,
  zeroManaChecks: 0,
  wardDiscards: 0,
  abilityDiscards: 0,
  countedEffects: 0,
  casualSacrificeCasts: 0,
  byCard: new Map(),
});

/** What the spell's text says it takes to sacrifice, by card: the types that may be sacrificed. */
const SACRIFICE_TYPES: Readonly<Record<string, readonly string[]>> = {
  'SYNTHETIC Sacrifice Draw': ['creature'],
  'SYNTHETIC Offering Bolt': ['artifact', 'creature'],
  'SYNTHETIC Land Offering': ['land'],
  'SYNTHETIC Double Toll': ['creature'],
  'SYNTHETIC Sacrifice Kicker': ['creature'],
  'SYNTHETIC Sacrifice Rite': ['creature'],
  'SYNTHETIC Free Offering': ['creature'],
};
const DISCARD_COUNT: Readonly<Record<string, number>> = {
  'SYNTHETIC Discard Burn': 1,
  'SYNTHETIC Double Toll': 1,
};
const LIFE_COST: Readonly<Record<string, number>> = { 'SYNTHETIC Blood Price': 3 };
const EXTRA_MANA: Readonly<Record<string, number>> = { 'SYNTHETIC Extra Mana Tax': 1 };
const FREE_NEEDS_COMMANDER = new Set([
  'SYNTHETIC Free Counter',
  'SYNTHETIC Free Exile',
  'SYNTHETIC Free Offering',
  'SYNTHETIC Free Colossus',
]);

/**
 * The reduction of generic mana a spell gets on this board, restated from the cards' texts: its own
 * "for each creature on the battlefield", the Bench ({1} for artifact spells you cast), the Chant ({1}
 * for instants and sorceries you cast), the Giant Discount ({2} for creature spells you cast) and the
 * Haze ({1} per land its controller has, for any spell).
 */
function reductionOf(
  board: readonly ObjectView[],
  spell: ObjectView,
  name: string,
  caster: number,
): number {
  let total = 0;
  if (name === 'SYNTHETIC Wrath of Many' || name === 'SYNTHETIC Sacrifice Rite') {
    total += board.filter((o) => o.types.includes('creature')).length;
  }
  for (const o of board) {
    const mine = o.controller === caster;
    if (o.name === 'SYNTHETIC Tinker Bench' && mine && spell.types.includes('artifact')) total += 1;
    if (
      o.name === 'SYNTHETIC Spell Chant' &&
      mine &&
      (spell.types.includes('instant') || spell.types.includes('sorcery'))
    ) {
      total += 1;
    }
    if (o.name === 'SYNTHETIC Giant Discount' && mine && spell.types.includes('creature')) {
      total += 2;
    }
    if (o.name === 'SYNTHETIC Market Haze') {
      total += board.filter(
        (l) => l.controller === o.controller && l.types.includes('land'),
      ).length;
    }
  }
  return total;
}

/**
 * Notes what one applied action did for the paths of this slice, and checks it. `cast` collects the
 * events of the cast being made (from the castSpell action to the spellCast event).
 */
function note(
  tally: Tally,
  casual: ReadonlySet<number>,
  cast: { events: GameEvent[]; snapshot: GameState | null },
  step: StepInfo,
): void {
  const { before, after, events, seat, action } = step;

  // A cast begins: remember the position before it and every event until it is complete.
  if (action.kind === 'castSpell' && before.casting === null) {
    cast.events = [];
    cast.snapshot = before;
  }
  if (before.casting !== null || action.kind === 'castSpell') cast.events.push(...events);

  // The total cost was just locked in (CR 601.2f): compare it with the rules restated here.
  const locked = after.casting;
  if (
    locked !== null &&
    locked.activation === null &&
    locked.extra !== undefined &&
    before.casting?.extra === undefined
  ) {
    const view = getView(after, locked.seat);
    const spell = view.stack.find((o) => o.id === locked.object);
    if (spell !== undefined) {
      const name = cardNameOf(after, locked.object);
      const free = after.objects[locked.object]?.stack?.free === true;
      const kicked = after.objects[locked.object]?.stack?.kicked === true;
      const base = parseManaCost(free ? [] : (spell.manaCost ?? []));
      const colored = Object.values(base.colored).reduce((n, c) => n + c, 0);
      let generic = base.generic + locked.commanderTax + (EXTRA_MANA[name] ?? 0);
      if (kicked) generic += 2; // the only kicker in the pool costs {2}
      const reduction = reductionOf(view.battlefield, spell, name, locked.seat);
      const expected = colored + Math.max(0, generic - reduction);
      const got = parseManaCost(locked.totalCost);
      const gotColored = Object.values(got.colored).reduce((n, c) => n + c, 0);
      expect(got.generic + gotColored, `${name}: total cost ${locked.totalCost.join('')}`).toBe(
        expected,
      );
      // The colored part is never reduced (CR 118.7a).
      expect(gotColored, `${name}: colored part`).toBe(colored);
      tally.lockedChecks += 1;
      if (reduction > 0 && generic > 0) tally.reducedChecks += 1;
      if (expected === 0) tally.zeroManaChecks += 1;
    }
  }

  for (const e of events) {
    if (e.kind !== 'spellCast') continue;
    tally.casts += 1;
    const name = cardNameOf(after, e.object);
    tally.byCard.set(name, (tally.byCard.get(name) ?? 0) + 1);
    const mine = cast.events;
    const sacrificed = mine.filter((x) => x.kind === 'sacrificed' && x.controller === seat);
    const discarded = mine.filter((x) => x.kind === 'discarded' && x.seat === seat);
    const types = SACRIFICE_TYPES[name];
    if (types !== undefined) {
      // CR 118.8, 601.2h: one permanent of the right kind was sacrificed to cast it.
      expect(sacrificed, `${name}: sacrifices`).toHaveLength(1);
      const gone = sacrificed[0];
      const lki = gone?.kind === 'sacrificed' ? after.lki[gone.permanent] : undefined;
      expect(
        types.some((t) => lki?.characteristics.types.includes(t as never)),
        `${name} sacrificed ${lki?.characteristics.name}`,
      ).toBe(true);
      tally.sacrificeCasts += 1;
      if (casual.has(seat)) tally.casualSacrificeCasts += 1;
    }
    const wantDiscard = DISCARD_COUNT[name];
    if (wantDiscard !== undefined) {
      expect(discarded, `${name}: discards`).toHaveLength(wantDiscard);
      tally.discardCasts += 1;
      // The spell itself is never one of the cards discarded (it is on the stack).
      for (const d of discarded) {
        if (d.kind === 'discarded') expect(d.object).not.toBe(e.object);
      }
    }
    if (types !== undefined && wantDiscard !== undefined) tally.mixedCasts += 1;
    const life = LIFE_COST[name];
    if (life !== undefined) {
      const paid = mine
        .filter((x) => x.kind === 'lifeChanged' && x.seat === seat)
        .reduce((n, x) => n + (x.kind === 'lifeChanged' ? x.from - x.to : 0), 0);
      expect(paid, `${name}: life paid`).toBeGreaterThanOrEqual(life);
      tally.lifeCasts += 1;
    }
    if (e.alternative === 'free') {
      tally.freeCasts += 1;
      if (casual.has(seat)) tally.casualFree += 1;
      expect(FREE_NEEDS_COMMANDER.has(name) || name === 'SYNTHETIC Always Free', name).toBe(true);
      if (FREE_NEEDS_COMMANDER.has(name)) {
        // CR 903.3d: its caster controls a permanent on the battlefield that is a commander.
        const controls = before.battlefield.some((id) => {
          const o = before.objects[id];
          return (
            o !== undefined &&
            o.controller === seat &&
            o.card !== null &&
            before.cards[o.card]?.isCommander === true
          );
        });
        expect(controls, `${name} cast free without a commander`).toBe(true);
      }
    }
    cast.events = [];
  }

  // A discard paid for Ward or an ability: the cards left the hand.
  for (const e of events) {
    if (e.kind !== 'discarded') continue;
    const d = before.pending;
    if (d?.kind === 'chooseCards' && d.purpose === 'discard' && before.resolution !== null) {
      const source = cardNameOf(before, d.source);
      if (source === '?' || source.includes('Tithe Warded Guard')) tally.wardDiscards += 1;
    }
    if (d?.kind === 'chooseCards' && d.forCost === true && before.casting?.activation != null) {
      tally.abilityDiscards += 1;
    }
  }
  for (const e of events) {
    if (e.kind === 'resolved') {
      const name = cardNameOf(before, e.object);
      if (
        ['SYNTHETIC Crowd Burn', 'SYNTHETIC Land Tithe', 'SYNTHETIC Hand Refill'].includes(name)
      ) {
        tally.countedEffects += 1;
      }
    }
  }
}

test(
  `${GAMES} cost games run clean, replay exactly and use every new path`,
  async () => {
    const total = newTally();
    const turns: number[] = [];
    for (let g = 1; g <= GAMES; g += 1) {
      const styles = COST_STYLE_PAIRS[g % COST_STYLE_PAIRS.length] ?? ['costs', 'costs'];
      const config = smallGameConfig(g, styles);
      // Seats of CasualAgent by game: seat 0, seat 1, both, neither (random against random).
      const casual = new Set<number>([[0], [1], [0, 1], []][g % 4] ?? []);
      const make = (seat: number): Agent & { fallbacks: readonly unknown[] } =>
        casual.has(seat)
          ? new CasualAgent({ seed: 14500 + 2 * g + seat })
          : new RandomLegalAgent({ seed: 14500 + 2 * g + seat });
      const agents = [make(0), make(1)] as const;
      const tally = newTally();
      const log: { seat: number; action: StepInfo['action'] }[] = [];
      const cast: { events: GameEvent[]; snapshot: GameState | null } = {
        events: [],
        snapshot: null,
      };
      const run = await stepGame(config, agents, LIMITS, (step) => {
        log.push({ seat: step.seat, action: step.action });
        note(tally, casual, cast, step);
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
      for (const key of Object.keys(tally) as (keyof Tally)[]) {
        if (key === 'byCard') {
          for (const [name, n] of tally.byCard)
            total.byCard.set(name, (total.byCard.get(name) ?? 0) + n);
        } else total[key] += tally[key];
      }
    }
    const { byCard, ...counts } = total;
    console.log(
      `100 cost games: ${JSON.stringify({ ...counts, turnsMax: Math.max(...turns), byCard: Object.fromEntries(byCard) })}`,
    );

    expectPath(total.casts);
    expectPath(total.lockedChecks);
    expectPath(total.reducedChecks);
    expectPath(total.sacrificeCasts);
    expectPath(total.discardCasts);
    expectPath(total.lifeCasts);
    expectPath(total.freeCasts);
    expectPath(total.casualFree);
    expectPath(total.casualSacrificeCasts);
    expectPath(total.abilityDiscards);
    expectPath(total.countedEffects);
    expect(COST_CARD_NAMES.length).toBeGreaterThan(20);
  },
  soakTimeout(400_000),
);
