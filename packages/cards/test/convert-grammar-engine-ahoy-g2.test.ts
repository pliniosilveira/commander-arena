// Ahoy Mateys deck, group 2: Hostage Taker, Dire Fleet Daredevil and King Narfi's Betrayal, read from their real Oracle text and run by the engine.
// "... exile another target creature or artifact until this creature leaves the battlefield. You may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell."
// "... exile target instant or sorcery card from an opponent's graveyard. You may cast it this turn, and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead."
// "I - Each player mills four cards. Then you may exile a creature or planeswalker card from each graveyard. II, III - Until end of turn, you may cast spells from among cards exiled with this Saga, and you
// may spend mana as though it were mana of any color to cast those spells."
// Pins (the CR text was not available here: the numbers are those the engine's comments cite): CR 609.4b (mana of any type, mana as though of any color), CR 601.2 (casting from exile), CR 611.2a
// (how long a permission lasts), CR 400.7 (a card that changes zone is a new object, so a permission names the card as it is), CR 610.3 (exile until the source leaves the battlefield), CR 614.1a (exile it
// instead), CR 607.2a (cards exiled with a permanent), CR 608.2d (the choices of a resolving ability).
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { real } from './agatha-helpers';

const TAKER = real('Hostage Taker');
const DAREDEVIL = real('Dire Fleet Daredevil');
const NARFI = real("King Narfi's Betrayal");
const BEARS = 'Grizzly Bears'; // {1}{G}
const BOLT = 'Lightning Bolt'; // {R}
const GOBLIN = 'Raging Goblin'; // {R}
const MURDER = 'Murder';
const exiledOf = (name: string, seat: 0 | 1) => ({ name, zone: 'exile' as const, seat });
const FILLER = Array.from({ length: 8 }, () => 'Plains');

describe('every card is valid', () => {
  test.each([TAKER, DAREDEVIL, NARFI] as readonly CardDefinition[])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Hostage Taker', () => {
  /** Seat 0 has the Taker and six lands none of which makes green mana; seat 1 has the Bears. Up to the Taker's trigger on the stack. */
  const taken = () => {
    const g = scenario()
      .define(TAKER)
      .seat(0)
      .hand('Hostage Taker')
      .library(...FILLER)
      .battlefield('Island', 'Swamp', 'Mountain', 'Mountain', 'Plains', 'Plains')
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS)
      .hand(MURDER)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Hostage Taker', { pay: true });
    g.passAll();
    if (g.state.pending?.kind === 'targets') {
      g.act(0).chooseTargets({ name: BEARS });
      g.passAll();
    }
    return g;
  };

  test('exiles the target, and its controller may cast it paying with mana of any type (CR 609.4b)', () => {
    const g = taken();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    // {1}{G} with the two lands left: neither makes green mana, any mana pays for any symbol.
    g.act(0).cast(exiledOf(BEARS, 1), { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('without the permission a card that needs green mana cannot be paid with those lands', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS)
      .library(...FILLER)
      .battlefield('Mountain', 'Plains')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.illegal(0, { cast: BEARS });
  });

  test('the permission lasts for as long as the card remains exiled: another turn too (CR 611.2a)', () => {
    const g = taken();
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 2 });
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.legal(0, { cast: exiledOf(BEARS, 1) });
  });

  test('when the Taker leaves the battlefield the card returns, and nothing is left to cast (CR 610.3, 400.7)', () => {
    const g = taken();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.act(0).pass();
    g.act(1).cast(MURDER, { targets: [{ name: 'Hostage Taker' }], pay: true });
    g.passAll();
    g.expect.zone('Hostage Taker', 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test("the other player cannot cast the exiled card: the permission is its controller's", () => {
    const g = taken();
    g.expect.illegal(1, { cast: exiledOf(BEARS, 1) });
  });
});

describe('Dire Fleet Daredevil', () => {
  const daredevil = () => {
    const g = scenario()
      .define(DAREDEVIL)
      .seat(0)
      .hand('Dire Fleet Daredevil')
      .library(...FILLER)
      .battlefield('Mountain', 'Plains', 'Plains')
      .seat(1)
      .library(...FILLER)
      .graveyard(BOLT, 'Grizzly Bears')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast('Dire Fleet Daredevil', { pay: true });
    g.passAll();
    if (g.state.pending?.kind === 'targets') {
      g.act(0).chooseTargets({ name: BOLT, zone: 'graveyard', seat: 1 });
    }
    g.passAll();
    return g;
  };

  test('exiles the instant or sorcery card of an opponent and lets you cast it this turn with any mana (CR 609.4b)', () => {
    const g = daredevil();
    g.expect.zone(BOLT, 'exile', { seat: 1 });
    // The Bears is a creature card: not a target, still in the graveyard.
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    // {R} with the one Plains left.
    g.act(0).cast(exiledOf(BOLT, 1), { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
  });

  test('the spell is exiled instead of going to a graveyard (CR 614.1a)', () => {
    const g = daredevil();
    g.act(0).cast(exiledOf(BOLT, 1), { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(g.find({ name: BOLT, zone: 'exile' })).toHaveLength(1);
    expect(g.find({ name: BOLT, zone: 'graveyard' })).toHaveLength(0);
  });

  test('the permission ends with the turn (CR 611.2a)', () => {
    const g = daredevil();
    g.expect.legal(0, { cast: exiledOf(BOLT, 1) });
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 2 });
    g.expect.illegal(0, { cast: exiledOf(BOLT, 1) });
  });
});

describe("King Narfi's Betrayal", () => {
  /** Seat 0 mills a creature, seat 1 a creature and an instant; the Saga is cast and chapter I resolves up to the choices. */
  const betrayal = () => {
    const g = scenario()
      .define(NARFI)
      .seat(0)
      .hand("King Narfi's Betrayal")
      .library(BEARS, 'Plains', 'Plains', 'Plains', ...FILLER)
      .battlefield('Island', 'Swamp', 'Mountain')
      .seat(1)
      .library(GOBLIN, BOLT, 'Plains', 'Plains', ...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast("King Narfi's Betrayal", { pay: true });
    g.passAll();
    return g;
  };

  test('chapter I: each player mills four, then you may exile a creature or planeswalker card from each graveyard', () => {
    const g = betrayal();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: BEARS, zone: 'graveyard', seat: 0 });
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: GOBLIN, zone: 'graveyard', seat: 1 });
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(GOBLIN, 'exile', { seat: 1 });
    // The instant is not a creature or planeswalker card: it stays.
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('chapter I: each choice is optional', () => {
    const g = betrayal();
    g.act(0).chooseCards();
    g.act(0).chooseCards({ name: GOBLIN, zone: 'graveyard', seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(GOBLIN, 'exile', { seat: 1 });
  });

  test('chapter II: the cards exiled with it may be cast this turn with mana of any color (CR 607.2a, 609.4b)', () => {
    const g = betrayal();
    g.act(0).chooseCards({ name: BEARS, zone: 'graveyard', seat: 0 });
    g.act(0).chooseCards({ name: GOBLIN, zone: 'graveyard', seat: 1 });
    // Not castable in the turn of chapter I.
    g.expect.illegal(0, { cast: exiledOf(GOBLIN, 1) });
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 2 });
    g.passAll();
    // {R} with Island, Swamp and Mountain (the Bears needs {1}{G}: green from any color).
    g.expect.legal(0, { cast: exiledOf(GOBLIN, 1) });
    g.expect.legal(0, { cast: exiledOf(BEARS, 0) });
    g.act(0).cast(exiledOf(BEARS, 0), { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('chapter II: only the cards exiled with it, and only this turn', () => {
    const g = betrayal();
    g.act(0).chooseCards({ name: BEARS, zone: 'graveyard', seat: 0 });
    g.act(0).chooseCards({ name: GOBLIN, zone: 'graveyard', seat: 1 });
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 2 });
    g.passAll();
    expect(g.find({ name: BOLT, zone: 'graveyard', seat: 1 })).toHaveLength(1);
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 2 });
    // Chapter III: the permission is given again.
    g.passAll();
    g.expect.legal(0, { cast: exiledOf(GOBLIN, 1) });
  });
});
