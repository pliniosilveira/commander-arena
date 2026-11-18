// Issue 89 (Silverquill Influence), "Whenever an enchanted creature dies, draw a card for each Aura you controlled that was attached to it." (D-654; Hateful Eidolon).
// Pins: CR 603.10a (a leaves-the-battlefield ability looks back in time), CR 113.7a (last-known information: the Auras that were attached as it died), CR 303.4e (the Auras'
// controller is separate from the creature's: only Auras the controller of the ability controlled count), CR 704.5m (the Auras go to the graveyard afterwards).
// Cards: the SYNTHETIC "Eidolon" and Aura of this file, the real Grizzly Bears and Lightning Bolt.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const EIDOLON = 'SYNTHETIC Aura Eidolon'; // Whenever an enchanted creature dies, draw a card for each Aura you controlled that was attached to it.
const AURA = 'SYNTHETIC Plain Aura';
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const eidolon = singleFaceCard({
  name: EIDOLON,
  manaCost: ['2', 'W'],
  types: ['enchantment', 'creature'],
  subtypes: ['Spirit'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 2,
  toughness: 2,
  oracleText:
    'Whenever an enchanted creature dies, draw a card for each Aura you controlled that was attached to it.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'dies', what: { types: ['creature'], enchanted: true } },
      effect: {
        kind: 'draw',
        player: { kind: 'you' },
        count: { kind: 'aurasAttachedToTriggerSubject', controlledBy: 'you' },
      },
    },
  ],
});

const aura = singleFaceCard({
  name: AURA,
  manaCost: ['1', 'W'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'Enchant creature',
  abilities: [{ kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } }],
});

/** Bears (seat 1's) carry `mine` Auras of seat 0 and `theirs` Auras of seat 1; seat 0 bolts them. */
function bolted(mine: number, theirs: number) {
  const b = scenario()
    .seat(0)
    .define(eidolon)
    .define(aura)
    .hand(BOLT)
    .library(...LIBRARY)
    .battlefield('Mountain', EIDOLON);
  let withMine = b;
  for (let i = 0; i < mine; i += 1)
    withMine = withMine.seat(0).battlefield(AURA, { attachedTo: BEARS });
  let s1 = withMine
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS);
  for (let i = 0; i < theirs; i += 1) s1 = s1.seat(1).battlefield(AURA, { attachedTo: BEARS });
  const g = s1.at('precombatMain').build();
  g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
  g.passAll();
  g.passAll();
  return g;
}

describe('"draw a card for each Aura you controlled that was attached to it"', () => {
  test('two Auras of mine and one of theirs: I draw two', () => {
    const g = bolted(2, 1);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.handSize(0, 2);
  });

  test('one Aura of mine: I draw one', () => {
    expect(bolted(1, 0).state.seats[0]?.hand.length).toBe(1);
  });

  test('only an Aura of theirs: the creature is enchanted, so it triggers, but I controlled none: I draw nothing', () => {
    const g = bolted(0, 1);
    g.expect.handSize(0, 0);
  });

  test('a creature with no Aura: nothing triggers', () => {
    const g = bolted(0, 0);
    g.expect.stack([]);
    g.expect.handSize(0, 0);
  });
});
