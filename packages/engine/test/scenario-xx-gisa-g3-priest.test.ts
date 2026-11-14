// Group 3 of the Gisa deck (issue 41, D-1421 to D-1423): "{T}, Sacrifice two other creatures: Any number of target players each lose 2 life and sacrifice a creature of their choice.
// You add {B}{B} and draw a card." (Priest of Forgotten Gods), the SYNTHETIC Sacrifice Priest of `src/cards/fixtures/synthetic-gisa-g3.ts`. Pins: CR 118.3 and 701.21a (a cost of
// sacrificing two other creatures needs two creatures besides the source, which the controller chooses), CR 602.2b and 115.1 (any number of target players: none, one or each),
// CR 608.2d and 101.4 (each target player chooses the creature they sacrifice, in turn order), CR 605.1a (an ability with a target is not a mana ability: it adds mana as it
// resolves), CR 106.4 (mana goes into the mana pool).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const PRIEST = 'SYNTHETIC Sacrifice Priest';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const ANGEL = 'Serra Angel';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the card is valid', () => {
  test(PRIEST, () => {
    expect(validateCard(syntheticCard(PRIEST))).toEqual([]);
  });
});

const names = (g: ScenarioGame, seat: 0 | 1, zone: 'battlefield' | 'graveyard'): string[] =>
  Object.values(g.state.objects)
    .filter((o) => o.zone === zone && o.owner === seat)
    .map((o) => {
      const card = o.card === null ? undefined : g.state.cards[o.card];
      return card === undefined ? '?' : (g.state.definitions[card.definition]?.name ?? '?');
    })
    .sort();

describe('Priest of Forgotten Gods', () => {
  const game = (opponent: readonly string[] = [BEARS, SPIDER], mine: readonly string[] = []) =>
    scenario()
      .seat(0)
      .battlefield(PRIEST, BEARS, SPIDER, ANGEL, ...mine)
      .library(...LIBRARY)
      .seat(1)
      .battlefield(...opponent)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('two other creatures are sacrificed as the cost (never the priest), it taps, and the opponent loses 2 life and sacrifices a creature of their choice', () => {
    const g = game();
    g.act(0).activate(PRIEST, { ability: 0, targets: [{ player: 1 }] });
    // Three other creatures: the controller chooses two; the priest is not among the candidates.
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.purpose).toBe('sacrifice');
    expect(d.forCost).toBe(true);
    expect(d.min).toBe(2);
    expect(d.max).toBe(2);
    expect(d.legal).toHaveLength(3);
    g.act(0).choosePermanents(BEARS, SPIDER);
    g.expect.tapped(PRIEST);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 0 });
    g.passAll();
    // The opponent chooses which of their two creatures to sacrifice.
    const e = g.state.pending;
    if (e?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${e?.kind}`);
    expect(e.seat).toBe(1);
    g.act(1).choosePermanents({ name: SPIDER, seat: 1 });
    g.expect.life(1, 38);
    expect(names(g, 1, 'graveyard')).toEqual([SPIDER]);
    expect(names(g, 1, 'battlefield')).toEqual([BEARS]);
    // "You add {B}{B}": the mana is in the pool; "draw a card".
    g.expect.pool(0, 'BB');
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('no target: nobody loses life or sacrifices, but the controller still adds the mana and draws', () => {
    const g = game();
    g.act(0).activate(PRIEST, { ability: 0, targets: [] });
    g.act(0).choosePermanents(BEARS, SPIDER);
    g.passAll();
    g.expect.life(1, 40);
    expect(names(g, 1, 'battlefield')).toEqual([BEARS, SPIDER].sort());
    g.expect.pool(0, 'BB');
    g.expect.handSize(0, 1);
  });

  test('every player may be a target, the controller too: each loses 2 life and sacrifices a creature, the active player choosing first', () => {
    const g = game();
    g.act(0).activate(PRIEST, { ability: 0, targets: [{ player: 0 }, { player: 1 }] });
    g.act(0).choosePermanents(BEARS, SPIDER);
    g.passAll();
    // Seat 0 has the priest and the angel left, the active player chooses first.
    let d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.seat).toBe(0);
    g.act(0).choosePermanents(ANGEL);
    d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.seat).toBe(1);
    g.act(1).choosePermanents({ name: BEARS, seat: 1 });
    g.expect.life(0, 38);
    g.expect.life(1, 38);
    expect(names(g, 0, 'battlefield')).toEqual([PRIEST]);
    expect(names(g, 1, 'battlefield')).toEqual([SPIDER]);
    g.expect.invariants();
  });

  test('a target with one creature sacrifices it without a question; a target with none only loses the life', () => {
    const g = game([BEARS]);
    g.act(0).activate(PRIEST, { ability: 0, targets: [{ player: 1 }] });
    g.act(0).choosePermanents(BEARS, SPIDER);
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(names(g, 1, 'battlefield')).toEqual([]);
    g.expect.life(1, 38);
    const h = game([]);
    h.act(0).activate(PRIEST, { ability: 0, targets: [{ player: 1 }] });
    h.act(0).choosePermanents(BEARS, SPIDER);
    h.passAll();
    h.expect.life(1, 38);
    expect(h.state.pending?.kind).toBe('priority');
  });

  test('exactly two other creatures: nothing is asked, they are sacrificed', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PRIEST, BEARS, SPIDER)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(PRIEST, { ability: 0, targets: [{ player: 1 }] });
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(SPIDER, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.life(1, 38);
    g.expect.pool(0, 'BB');
  });

  test('with only one other creature the ability cannot be activated (the priest is not one of the two)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PRIEST, BEARS)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(g.act(0).try.activate(PRIEST, { ability: 0 }).ok).toBe(false);
  });

  test('a summoning-sick priest cannot pay {T}', () => {
    const g = scenario()
      .seat(0)
      .battlefield(PRIEST, { fresh: true } as never)
      .battlefield(BEARS, SPIDER)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    expect(g.act(0).try.activate(PRIEST, { ability: 0 }).ok).toBe(false);
  });
});
