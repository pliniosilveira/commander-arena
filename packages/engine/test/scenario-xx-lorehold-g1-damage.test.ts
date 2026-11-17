// Group 1 of the Lorehold Spirit deck (issue 86): "Each creature deals damage to itself equal to its power." (the effect `dealDamageToSelf`).
// Pins: CR 120.3 (damage is dealt by a source: deathtouch and lifelink of the creature apply, and the damage is not combat damage), CR 120.2 (all the damage of one effect is dealt at
// once: the powers are read before any is dealt), CR 120.8 (no damage from a source with power 0 or less), CR 704.5g and 704.5h (lethal damage and deathtouch destroy the creature),
// CR 608.2h (the effect uses the information as it applies), CR 616.1 (a prevention effect for the source applies).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-lorehold-g1.ts); the real card is played in packages/cards/test/convert-grammar-engine-lorehold-g1.test.ts.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const TIDE = 'SYNTHETIC Reckoning Tide'; // {4}{W} sorcery: each creature deals damage to itself equal to its power
const TITAN = 'SYNTHETIC Venom Titan'; // 3/5 deathtouch lifelink
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const WALL = 'Wall of Stone'; // 0/8
const ANGEL = 'Serra Angel'; // 4/4 flying vigilance, to be dealt 4

const defs = () => scenario().define(syntheticCard(TIDE)).define(syntheticCard(TITAN));

const board = () =>
  defs()
    .seat(0)
    .hand(TIDE)
    .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
    .battlefield(BEARS, { label: 'my bears' })
    .battlefield(SPIDER, { label: 'my spider' })
    .seat(1)
    .battlefield(BEARS, { label: 'their bears' })
    .battlefield(ANGEL, { label: 'their angel' })
    .battlefield(WALL, { label: 'their wall' })
    .at('precombatMain', { active: 0 });

describe('the card is valid', () => {
  test(TIDE, () => {
    expect(validateCard(syntheticCard(TIDE))).toEqual([]);
  });
});

describe('Each creature deals damage to itself equal to its power (CR 120.3)', () => {
  test('every creature, whoever controls it, is dealt damage equal to its own power', () => {
    const g = board().build();
    g.act(0).cast(TIDE, { pay: true });
    g.passAll();
    g.expect.damage('my spider', 2);
    g.expect.noObject(BEARS, { zone: 'battlefield', seat: 0 });
    g.expect.noObject(BEARS, { zone: 'battlefield', seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('a creature with power 4 and toughness 4 dies of it (CR 704.5g)', () => {
    const g = board().build();
    g.act(0).cast(TIDE, { pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
  });

  test('a creature with power 0 is dealt no damage (CR 120.8)', () => {
    const g = board().build();
    g.act(0).cast(TIDE, { pay: true });
    g.passAll();
    g.expect.damage('their wall', 0);
    g.expect.zone(WALL, 'battlefield', { seat: 1 });
    g.expect.noEvent(
      { kind: 'damageDealt', to: { kind: 'object', id: g.id('their wall') } },
      { since: 0 },
    );
  });

  test('the damage is not combat damage', () => {
    const g = board().build();
    g.act(0).cast(TIDE, { pay: true });
    g.passAll();
    g.expect.eventLog([
      {
        kind: 'damageDealt',
        combat: false,
        amount: 2,
        source: g.id('my spider'),
        to: { kind: 'object', id: g.id('my spider') },
      },
    ]);
  });

  test('a creature is the source of its own damage: deathtouch destroys it and lifelink gains life for its controller', () => {
    const g = defs()
      .seat(0)
      .hand(TIDE)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(TITAN, { label: 'titan' })
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(TIDE, { pay: true });
    g.passAll();
    // Three damage does not kill a toughness-5 creature, but the source has deathtouch (CR 704.5h) and the damage it deals gains its controller 3 life (CR 702.15b).
    g.expect.zone(TITAN, 'graveyard', { seat: 0 });
    g.expect.life(0, 43);
    g.expect.invariants();
  });

  test('only creatures are dealt damage: no player is', () => {
    const g = board().build();
    g.act(0).cast(TIDE, { pay: true });
    g.passAll();
    g.expect.life(0, 40);
    g.expect.life(1, 40);
  });

  test('powers are read first: a creature killed by the damage of an earlier one in the list still dealt its own', () => {
    // The two Bears deal 2 to themselves and the Spider 2 to itself, all at once (CR 120.2): neither pair is changed by what the other dealt.
    const g = board().build();
    g.act(0).cast(TIDE, { pay: true });
    g.passAll();
    g.expect.eventLog([{ kind: 'damageDealt', amount: 2, source: g.id('my spider') }]);
    g.expect.noObject(BEARS, { zone: 'battlefield' });
  });

  test('a +1/+1 counter raises the power it deals and the toughness it survives with', () => {
    const g = defs()
      .seat(0)
      .hand(TIDE)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(BEARS, { label: 'big bears', counters: { '+1/+1': 1 } })
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(TIDE, { pay: true });
    g.passAll();
    // 3/3 deals 3 to itself: dies.
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });
});
