// Issue 89 (Silverquill Influence), group 9 (D-646): "Enchantment spells you cast have affinity for Auras." (Pearl-Ear, Imperial Advisor), as the reduction of {1} for each Aura the
// controller controls that CR 702.41a says affinity is.
// Pins: CR 702.41a ("affinity for [text]" means "costs {1} less to cast for each [text] you control"), CR 601.2f (the cost is determined as the spell is cast: the Auras that are on the
// battlefield then), CR 118.7a (a reduction takes only generic mana, never below zero), "you cast" (an opponent's spells are not reduced).
// Cards: the SYNTHETIC "Pearl Lord" of this file, SYNTHETIC Might Aura ({1}{G}) and the SYNTHETIC Vanilla 3/3 and the basic lands.
import { describe, expect, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const LORD = 'SYNTHETIC Pearl Lord';
const AURA = 'SYNTHETIC Might Aura';
const VANILLA = 'SYNTHETIC Vanilla 3/3';

const lord = singleFaceCard({
  name: LORD,
  manaCost: ['2', 'W'],
  types: ['creature'],
  subtypes: ['Human', 'Advisor'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 2,
  toughness: 2,
  oracleText: 'Enchantment spells you cast have affinity for Auras.',
  abilities: [
    {
      kind: 'static',
      static: {
        kind: 'costReduction',
        spells: { types: ['enchantment'], controller: 'you' },
        amount: { kind: 'countOf', filter: { subtypes: ['Aura'], controller: 'you' } },
      },
    },
  ],
});

function board(withLord: boolean): ScenarioGame {
  return scenario()
    .seat(0)
    .define(lord)
    .hand(AURA, { label: 'a1' })
    .hand(AURA, { label: 'a2' })
    .battlefield('Forest', 'Forest', 'Forest', VANILLA, ...(withLord ? [LORD] : []))
    .library('Plains', 'Plains', 'Plains')
    .seat(1)
    .library('Plains', 'Plains', 'Plains')
    .at('precombatMain')
    .build();
}

describe('"Enchantment spells you cast have affinity for Auras."', () => {
  test('the first Aura costs its {1}{G}, the second costs {G} for the one Aura on the battlefield: three Forests pay both', () => {
    const g = board(true);
    g.act(0).cast('a1', { targets: [VANILLA], pay: true });
    g.passAll();
    g.act(0).cast('a2', { targets: [VANILLA], pay: true });
    g.passAll();
    expect(g.find({ name: AURA, zone: 'battlefield' })).toHaveLength(2);
    g.expect.invariants();
  });

  test('without it the second Aura costs {1}{G} too: three Forests do not pay both', () => {
    const g = board(false);
    g.act(0).cast('a1', { targets: [VANILLA], pay: true });
    g.passAll();
    expect(() => g.act(0).cast('a2', { targets: [VANILLA], pay: true })).toThrow(/engine rejected/);
  });
});
