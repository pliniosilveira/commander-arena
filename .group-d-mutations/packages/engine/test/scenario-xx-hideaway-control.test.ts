// "You may play the exiled card without paying its mana cost" by a permanent that changed controller (D-149, polish of D-145).
// Pins: CR 702.75a (Hideaway: the controller of the permanent that exiled the card may look at it), CR 607.2a (the exiled card is the one this
// permanent exiled, whoever now controls it), CR 608.2g and 118.9 (cast without paying its mana cost: by the player who controls the
// ability that lets them), CR 305.1 and 305.2a (a land played by an effect uses a land drop of the player who plays it, on their turn),
// CR 110.2a (a permanent enters under the control of the player who played it). The cards in exile are owned by the other player: what
// matters is who controls the ability, not who owns the card. Cards are SYNTHETIC (src/cards/fixtures/synthetic-free-cast.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { getView } from '../src/index';
import { canCastDuringResolution, canPlayLandByEffect } from '../src/rules/legality';
import { patchObject } from '../src/state/ops';
import { createDriver, type ScenarioGame, scenario } from '../src/testing/index';

const CACHE = 'SYNTHETIC Hidden Cache'; // artifact {1}, Hideaway 3, {2},{T}: play the exiled card without paying its mana cost
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Island');

/**
 * Seat 0 owns the Cache and a hidden card; seat 1 controls the Cache (it was taken from seat 0) and it is seat 1's turn, main phase, with three
 * Forests. The link between the permanent and the card it exiled is what Hideaway made as the card was exiled.
 */
const stolen = (hidden: string): ScenarioGame => {
  const inExile = { name: hidden, zone: 'exile' as const, seat: 0 as const };
  const built = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(CACHE, { controller: 1 })
    .exile(hidden)
    .seat(1)
    .library(...LIBRARY)
    .battlefield('Forest', { count: 3 })
    .at('precombatMain', { active: 1 })
    .build();
  const cache = built.id(CACHE);
  const card = built.id(inExile);
  const linked = patchObject(patchObject(built.state, cache, { linkedExile: [card] }), card, {
    hideaway: cache,
  });
  return createDriver(linked);
};

describe('the new controller plays the exiled card', () => {
  test('a spell: cast without paying its mana cost, controlled by the player who plays it, owned by the other', () => {
    const g = stolen(BEARS);
    g.act(1).activate(CACHE, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
    expect(d.seat).toBe(1);
    expect(d.purpose).toBe('cast');
    expect(d.legal).toEqual([g.id(BEARS)]);
    g.act(1).chooseCards({ name: BEARS, zone: 'exile', seat: 0 });
    g.passAll();
    const bears = g.find({ name: BEARS, zone: 'battlefield' })[0];
    expect(bears?.controller).toBe(1);
    expect(bears?.owner).toBe(0);
    g.expect.invariants();
  });

  test('a land: played by seat 1 on its turn, entering under its control', () => {
    const g = stolen('Forest');
    g.act(1).activate(CACHE, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
    expect(d.legal).toEqual([g.id({ name: 'Forest', zone: 'exile', seat: 0 })]);
    g.act(1).chooseCards({ name: 'Forest', zone: 'exile', seat: 0 });
    const forest = g
      .find({ name: 'Forest', zone: 'battlefield', seat: 1 })
      .filter((o) => o.owner === 0);
    expect(forest).toHaveLength(1);
    expect(forest[0]?.controller).toBe(1);
    expect(g.state.seats[1]?.landsPlayedThisTurn).toBe(1);
    g.expect.invariants();
  });

  test('a land is not played off the turn of the player who controls the ability (CR 305.3)', () => {
    const built = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(CACHE, { controller: 1 })
      .exile('Forest')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Forest', { count: 3 })
      .at('precombatMain', { active: 0 })
      .build();
    const cache = built.id(CACHE);
    const card = built.id({ name: 'Forest', zone: 'exile', seat: 0 });
    const linked = patchObject(patchObject(built.state, cache, { linkedExile: [card] }), card, {
      hideaway: cache,
    });
    const g = createDriver(linked);
    g.pass(0);
    g.act(1).activate(CACHE, { pay: true });
    g.passAll();
    // Nothing is offered: the land cannot be played on seat 0's turn.
    expect(g.state.pending?.kind).not.toBe('chooseCards');
  });
});

describe('who may look at the exiled card (CR 702.75a)', () => {
  test('the new controller of the permanent sees it, the player who owns it does not', () => {
    const g = stolen(BEARS);
    const id = g.id(BEARS);
    const theirs = getView(g.state, 1).exile.find((o) => o.id === id);
    const mine = getView(g.state, 0).exile.find((o) => o.id === id);
    expect(theirs?.name).toBe(BEARS);
    expect(mine?.name).not.toBe(BEARS);
    expect(mine?.faceDown).toBe(true);
  });
});

describe('a card in another player’s hand is never the effect’s to play', () => {
  test('neither cast nor played as a land by the other seat', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS, 'Forest')
      .seat(1)
      .battlefield('Forest', { count: 3 })
      .at('precombatMain', { active: 1 })
      .build();
    const bears = g.find({ name: BEARS, zone: 'hand' })[0];
    const forest = g.find({ name: 'Forest', zone: 'hand' })[0];
    if (bears === undefined || forest === undefined) throw new Error('no card');
    expect(canCastDuringResolution(g.state, 1, bears)).toBe(false);
    expect(canPlayLandByEffect(g.state, 1, forest)).toBe(false);
    // The same cards are the owner's to cast or play.
    expect(canCastDuringResolution(g.state, 0, bears)).toBe(true);
  });
});
