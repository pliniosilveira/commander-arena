// "Pay {E}" as the cost of an activated ability and of a mana ability (issue 105).
// Pins: CR 107.14 (the energy symbol is one energy counter; paying it removes one from the player), CR 118.3 (a player can't pay a cost
// they can't pay in full), CR 605.3 (a mana ability's costs are paid as it is activated, with no stack).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-energy.ts).
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const CELL = 'SYNTHETIC Energy Cell';
const SCRIBE = 'SYNTHETIC Energy Scribe';

describe('an activated ability that costs {E}{E}', () => {
  test('it removes two energy counters and draws', () => {
    const g = scenario().seat(0).energy(3).battlefield(SCRIBE).library('Island', 'Island').build();
    g.act(0).activate(SCRIBE);
    g.expect.energy(0, 1);
    g.pass();
    g.pass(1);
    g.expect.handSize(0, 1);
  });

  test('it is not offered with fewer counters than the cost, and is refused with a reason', () => {
    const g = scenario().seat(0).energy(1).battlefield(SCRIBE).library('Island').build();
    g.expect.illegal(0, { activate: SCRIBE });
    const r = g.act(0).try.activate(SCRIBE);
    expect(r.ok).toBe(false);
    g.expect.energy(0, 1);
  });

  test('a player with no energy counters at all cannot pay it', () => {
    const g = scenario().seat(0).battlefield(SCRIBE).library('Island').build();
    g.expect.illegal(0, { activate: SCRIBE });
  });
});

describe('a mana ability that costs {E}', () => {
  test('it taps, removes one counter and adds the mana at once', () => {
    const g = scenario().seat(0).energy(2).battlefield(CELL).build();
    g.act(0).tapForMana(CELL, { color: 'U' });
    g.expect.pool(0, 'U');
    g.expect.energy(0, 1);
    g.expect.stack([]);
  });

  test('without energy it is not offered', () => {
    const g = scenario().seat(0).battlefield(CELL).build();
    g.expect.illegal(0, { tap: CELL });
    const r = g.act(0).try.tapForMana(CELL, { color: 'U' });
    expect(r.ok).toBe(false);
  });

  test('automatic payment never spends more energy than the player has', () => {
    // Two cells and one counter: only one of them can help pay {1}{1}, so a two-mana spell is not castable by them alone.
    const g = scenario().seat(0).energy(1).battlefield(CELL, CELL).hand('Grizzly Bears').build();
    g.expect.illegal(0, { cast: 'Grizzly Bears' });
  });
});

describe('"You may pay any amount of {E}. If you do, ..." (payAnyAmount with the symbol {E})', () => {
  const BELLOWS = 'SYNTHETIC Energy Bellows';

  test('the player chooses how many counters to pay, from none to all they have, and X is the number paid', () => {
    const g = scenario()
      .seat(0)
      .energy(3)
      .battlefield(BELLOWS)
      .library('Island', 'Island', 'Island', 'Island')
      .build();
    g.act(0).activate(BELLOWS);
    g.passAll();
    const d = g.state.pending;
    expect(d).toMatchObject({ kind: 'chooseX', purpose: 'payAnyAmount', min: 0, max: 3 });
    g.act(0).chooseX(2);
    g.expect.energy(0, 1);
    g.expect.handSize(0, 2);
  });

  test('a player with no energy is not asked and nothing happens', () => {
    const g = scenario().seat(0).battlefield(BELLOWS).library('Island').build();
    g.act(0).activate(BELLOWS);
    g.passAll();
    g.expect.handSize(0, 0);
    g.expect.energy(0, 0);
  });

  test('paying none draws nothing and keeps the counters', () => {
    const g = scenario().seat(0).energy(3).battlefield(BELLOWS).library('Island').build();
    g.act(0).activate(BELLOWS);
    g.passAll();
    g.act(0).chooseX(0);
    g.expect.energy(0, 3);
    g.expect.handSize(0, 0);
  });
});

describe('a Vehicle token (an artifact with power and toughness, crew 2)', () => {
  const MAKER = 'SYNTHETIC Hull Maker';

  test('it is created as a Vehicle with crew, and is no creature until crewed (CR 301.7a, 208.3)', () => {
    const g = scenario().seat(0).battlefield(MAKER, 'Grizzly Bears').build();
    g.act(0).activate(MAKER);
    g.passAll();
    g.expect.zone('Hull', 'battlefield', { seat: 0 });
    // CR 208.3, 301.7a: no power or toughness until it is crewed, and the keyword is on the token.
    g.expect.derived('Hull', { types: ['artifact'], subtypes: ['Vehicle'], keywords: ['crew'] });
  });
});

describe('"You may cast any number of spells from your hand without paying their mana costs" (castFree with max "any" from the hand)', () => {
  const CASTER = 'SYNTHETIC Free Caster';
  const BEAR = 'SYNTHETIC Quiet Bear';

  test('the player is asked again after each spell and may stop, and no mana is paid', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CASTER)
      .hand(BEAR, { label: 'a' })
      .hand(BEAR, { label: 'b' })
      .hand('Island', { label: 'land' })
      .build();
    g.act(0).activate(CASTER);
    g.passAll();
    // The land is no spell: only the two creature cards are offered.
    expect(g.state.pending).toMatchObject({ kind: 'chooseCards', purpose: 'cast' });
    g.act(0).chooseCards('a');
    expect(g.state.pending).toMatchObject({ kind: 'chooseCards', purpose: 'cast' });
    g.act(0).chooseCards('b');
    g.passAll();
    g.expect.zone(BEAR, 'battlefield', { seat: 0, count: 2 });
    g.expect.pool(0, '');
  });

  test('the player may stop after the first', () => {
    const g = scenario()
      .seat(0)
      .battlefield(CASTER)
      .hand(BEAR, { label: 'a' })
      .hand(BEAR, { label: 'b' })
      .build();
    g.act(0).activate(CASTER);
    g.passAll();
    g.act(0).chooseCards('a');
    g.act(0).chooseCards();
    g.passAll();
    g.expect.zone(BEAR, 'battlefield', { seat: 0, count: 1 });
  });
});

describe('"You may pay {E}{E} rather than pay the mana cost for permanent spells you cast" (grantEnergyAlternative)', () => {
  const PATRON = 'SYNTHETIC Energy Patron';
  const BEAR = 'SYNTHETIC Quiet Bear';

  test('a permanent spell may be cast for the energy, paying no mana', () => {
    const g = scenario()
      .seat(0)
      .energy(3)
      .battlefield(PATRON)
      .hand(BEAR)
      .seat(1)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.expect.legal(0, { cast: BEAR, alternative: 'energyGrant' });
    g.act(0).cast(BEAR, { alternative: 'energyGrant' });
    g.passAll();
    g.expect.zone(BEAR, 'battlefield', { seat: 0 });
    g.expect.energy(0, 1);
  });

  test('with fewer counters than the cost it is not offered', () => {
    const g = scenario()
      .seat(0)
      .energy(1)
      .battlefield(PATRON)
      .hand(BEAR)
      .seat(1)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.expect.illegal(0, { cast: BEAR, alternative: 'energyGrant' });
  });

  test('an instant is not a permanent spell: not offered', () => {
    const g = scenario()
      .seat(0)
      .energy(3)
      .battlefield(PATRON)
      .hand('Lightning Bolt')
      .seat(1)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.expect.illegal(0, { cast: 'Lightning Bolt', alternative: 'energyGrant' });
  });

  test('without the permanent it is not offered', () => {
    const g = scenario()
      .seat(0)
      .energy(3)
      .hand(BEAR)
      .seat(1)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.expect.illegal(0, { cast: BEAR, alternative: 'energyGrant' });
  });
});
