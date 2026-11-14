// Group 3 of the Gisa deck (issue 41, D-484): "Each opponent chooses a permanent they control of each permanent type and sacrifices the rest." (Liliana, Dreadhorde General), the
// SYNTHETIC Culling Walker and Culling Rite of `src/cards/fixtures/synthetic-gisa-g3.ts`. Pins: CR 608.2d (the player chooses as the effect resolves), CR 701.21a (a player sacrifices
// permanents they control), CR 101.4 (the players choose in turn order, the active player first), CR 110.4 (the six permanent types), CR 205.2b (an object with two card types satisfies
// the criteria for both), CR 603.10a (permanents sacrificed together leave together).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const WALKER = 'SYNTHETIC Culling Walker';
const RITE = 'SYNTHETIC Culling Rite';
const RELIC = 'SYNTHETIC Gisa Relic';
const GOLEM = 'SYNTHETIC Gisa Golem';
const WARD = 'SYNTHETIC Gisa Ward';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([WALKER, RITE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

const onBattlefield = (g: ScenarioGame, seat: 0 | 1): string[] =>
  Object.values(g.state.objects)
    .filter((o) => o.zone === 'battlefield' && o.controller === seat)
    .map((o) => {
      const card = o.card === null ? undefined : g.state.cards[o.card];
      return card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
    })
    .sort();

const decision = (g: ScenarioGame) => {
  const d = g.state.pending;
  if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
  return d;
};

describe('Liliana, Dreadhorde General (the opponent keeps one permanent of each type)', () => {
  const game = (opponent: (b: ReturnType<typeof scenario>) => unknown) => {
    const b = scenario()
      .seat(0)
      .battlefield(WALKER)
      .battlefield(BEARS, RELIC)
      .library(...LIBRARY)
      .seat(1);
    opponent(b);
    return b
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  };

  test('the opponent chooses for each type they control; every other permanent they control is sacrificed, lands too; yours stay', () => {
    const g = game((b) => b.battlefield(BEARS, SPIDER, RELIC, WARD, 'Island', 'Island', 'Forest'));
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    // The artifact (the relic alone) and the enchantment (the ward alone) are kept without a question. The creatures: the bears and the spider.
    let d = decision(g);
    expect(d.purpose).toBe('spare');
    expect(d.spare).toEqual({ player: 1, type: 'creature', own: true });
    // The opponent chooses, not the controller of the planeswalker.
    expect(d.seat).toBe(1);
    g.act(1).choosePermanents({ name: SPIDER, seat: 1 });
    d = decision(g);
    expect(d.spare).toEqual({ player: 1, type: 'land', own: true });
    expect(d.seat).toBe(1);
    expect(d.legal).toHaveLength(3);
    g.act(1).choosePermanents({ name: 'Forest', seat: 1 });
    g.passAll();
    expect(onBattlefield(g, 1)).toEqual(['Forest', RELIC, SPIDER, WARD].sort());
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    // The planeswalker's controller keeps everything: their bears, relic and the walker (with no loyalty left it is put into the graveyard).
    expect(onBattlefield(g, 0)).toEqual([BEARS, RELIC].sort());
    g.expect.invariants();
  });

  test('a permanent that has two types may be the one chosen for both (CR 205.2b)', () => {
    const g = game((b) => b.battlefield(GOLEM, BEARS, RELIC, 'Island'));
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    // Artifacts: the golem and the relic.
    let d = decision(g);
    expect(d.spare).toEqual({ player: 1, type: 'artifact', own: true });
    g.act(1).choosePermanents({ name: GOLEM, seat: 1 });
    // Creatures: the golem and the bears: the golem may be chosen again.
    d = decision(g);
    expect(d.spare).toEqual({ player: 1, type: 'creature', own: true });
    expect(d.legal).toHaveLength(2);
    g.act(1).choosePermanents({ name: GOLEM, seat: 1 });
    g.passAll();
    expect(onBattlefield(g, 1)).toEqual([GOLEM, 'Island'].sort());
    g.expect.zone(RELIC, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('with one permanent of each type nothing is asked and nothing is sacrificed', () => {
    const g = game((b) => b.battlefield(BEARS, RELIC, 'Island'));
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(onBattlefield(g, 1)).toEqual([BEARS, 'Island', RELIC].sort());
    g.expect.invariants();
  });

  test('an opponent with no permanents is not asked', () => {
    const g = game(() => undefined);
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.invariants();
  });

  test('the permanents are sacrificed together and tell the game so (events name the opponent)', () => {
    const g = game((b) => b.battlefield(BEARS, SPIDER, 'Island', 'Forest'));
    g.act(0).activate(WALKER, { ability: 0 });
    g.passAll();
    g.act(1).choosePermanents({ name: BEARS, seat: 1 });
    g.act(1).choosePermanents({ name: 'Island', seat: 1 });
    g.passAll();
    const sacrificed = g.events.filter((e) => e.kind === 'sacrificed');
    expect(sacrificed.map((e) => (e.kind === 'sacrificed' ? e.controller : -1))).toEqual([1, 1]);
  });
});

describe('each player chooses for themselves, the active player first', () => {
  test('the players choose in turn order and each sacrifices the rest of their own permanents', () => {
    const g = scenario()
      .seat(0)
      .hand(RITE)
      .battlefield('Swamp', { count: 4 })
      .battlefield(BEARS, SPIDER)
      .library(...LIBRARY)
      .seat(1)
      .battlefield(BEARS, SPIDER)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(RITE, { pay: true });
    g.passAll();
    let d = decision(g);
    expect(d.spare).toEqual({ player: 0, type: 'creature', own: true });
    expect(d.seat).toBe(0);
    g.act(0).choosePermanents({ name: SPIDER, seat: 0 });
    d = decision(g);
    expect(d.spare).toEqual({ player: 0, type: 'land', own: true });
    g.act(0).choosePermanents({ name: 'Swamp', seat: 0, nth: 0 });
    d = decision(g);
    expect(d.spare).toEqual({ player: 1, type: 'creature', own: true });
    expect(d.seat).toBe(1);
    g.act(1).choosePermanents({ name: BEARS, seat: 1 });
    g.passAll();
    expect(onBattlefield(g, 0)).toEqual([SPIDER, 'Swamp']);
    expect(onBattlefield(g, 1)).toEqual([BEARS]);
    g.expect.invariants();
  });
});
