// Issue 89 (Silverquill Influence), group 3 (D-590): a static ability that gives annihilator ("Enchanted creature has trample and annihilator 2", Eldrazi Conscription).
// Pins: CR 702.86a (Annihilator N: whenever this creature attacks, defending player sacrifices N permanents), CR 702.86b (each instance triggers separately), CR 113.2c (an
// object with several instances of an ability: each functions independently), CR 613.1f (a granted keyword is a layer 6 effect that ends with its source, CR 611.3a).
// Cards: the SYNTHETIC "Annihilation Aura" of this file, the real Grizzly Bears, Llanowar Elves and the basic lands.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const AURA = 'SYNTHETIC Annihilation Aura'; // Enchant creature. Enchanted creature has annihilator 2.
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';

const annihilationAura = singleFaceCard({
  name: AURA,
  manaCost: ['1', 'W'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'Enchant creature\nEnchanted creature has annihilator 2.',
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    {
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: { kind: 'attached', types: ['creature'] },
        keyword: { kind: 'annihilator', count: 2 },
      },
    },
  ],
});

describe('CR 702.86a with CR 613.1f: an Aura that gives annihilator', () => {
  test('the enchanted creature attacks: the defending player sacrifices the number of permanents the grant says', () => {
    const g = scenario()
      .seat(0)
      .define(annihilationAura)
      .hand(AURA)
      .battlefield('Plains', 'Plains', BEARS)
      .seat(1)
      .battlefield(ELVES, 'Island', 'Mountain', 'Swamp')
      .library('Plains', 'Plains', 'Plains')
      .at('precombatMain')
      .build();
    g.act(0).cast(AURA, { targets: [BEARS], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.expect.stack([`${BEARS} (ability)`]);
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.seat).toBe(1);
    expect(d.purpose).toBe('sacrifice');
    expect(d.min).toBe(2);
    expect(d.max).toBe(2);
    g.act(1).choosePermanents('Island', 'Mountain');
    g.expect.zone('Island', 'graveyard', { seat: 1 });
    g.expect.zone('Mountain', 'graveyard', { seat: 1 });
    g.expect.zone(ELVES, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('without the Aura the creature has no such trigger', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS)
      .seat(1)
      .battlefield(ELVES, 'Island', 'Mountain')
      .library('Plains', 'Plains', 'Plains')
      .at('precombatMain')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.expect.stack([]);
  });

  test('two Auras are two instances: two triggers (CR 702.86b)', () => {
    const g = scenario()
      .seat(0)
      .define(annihilationAura)
      .hand(AURA, { label: 'a1' })
      .hand(AURA, { label: 'a2' })
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', BEARS)
      .seat(1)
      .battlefield(ELVES, 'Island', 'Mountain', 'Swamp')
      .library('Plains', 'Plains', 'Plains')
      .at('precombatMain')
      .build();
    g.act(0).cast('a1', { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).cast('a2', { targets: [BEARS], pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    expect(g.state.stack).toHaveLength(2);
  });
});
