// Issue 89 (Silverquill Influence), group 8 (D-595): "Spells you cast that target a creature cost {2} less to cast." (Killian, Ink Duelist).
// Pins: CR 601.2f (the cost is determined after the targets are chosen, CR 601.2c), CR 118.7a (a reduction takes only generic mana, never below zero), CR 115.1 (a spell that targets: its
// chosen targets), D-424 (before any target is chosen the engine asks whether the spell can be cast assuming the most favourable target), and "you cast": an opponent's spell is not reduced.
// Cards: the SYNTHETIC "Duelist" of this file, SYNTHETIC Might Aura ({1}{G}, targets a creature) and the real Grizzly Bears ({1}{G}, no target), SYNTHETIC Vanilla 3/3 (the creature to enchant: it makes no mana) and the basic lands.
import { describe, expect, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const DUELIST = 'SYNTHETIC Target Duelist';
const AURA = 'SYNTHETIC Might Aura';
const BEARS = 'Grizzly Bears';
const VANILLA = 'SYNTHETIC Vanilla 3/3';

const duelist = singleFaceCard({
  name: DUELIST,
  manaCost: ['2', 'U'],
  types: ['creature'],
  subtypes: ['Human', 'Wizard'],
  colors: ['U'],
  colorIdentity: ['U'],
  power: 2,
  toughness: 3,
  oracleText: 'Spells you cast that target a creature cost {2} less to cast.',
  abilities: [
    {
      kind: 'static',
      static: {
        kind: 'costReduction',
        spells: { controller: 'you', targetsObject: { types: ['creature'] } },
        amount: 2,
      },
    },
  ],
});

/** Seat 0 has one Forest and the Aura and the Bears in hand, with or without the Duelist on the battlefield, and a creature to enchant. */
function board(withDuelist: boolean): ScenarioGame {
  return scenario()
    .seat(0)
    .define(duelist)
    .hand(AURA, BEARS)
    .battlefield('Forest', VANILLA, ...(withDuelist ? [DUELIST] : []))
    .library('Plains', 'Plains', 'Plains')
    .seat(1)
    .library('Plains', 'Plains', 'Plains')
    .at('precombatMain')
    .build();
}

describe('"Spells you cast that target a creature cost {2} less to cast."', () => {
  test('with the Duelist an Aura that targets a creature costs {G}: one Forest pays it', () => {
    const g = board(true);
    g.act(0).cast(AURA, { targets: [VANILLA], pay: true });
    g.passAll();
    g.expect.zone(AURA, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('without the Duelist one Forest does not pay for it: {1}{G}', () => {
    const g = board(false);
    expect(() => g.act(0).cast(AURA, { targets: [VANILLA], pay: true })).toThrow(/engine rejected/);
  });

  test('a spell that does not target is not reduced: the Bears still cost {1}{G}, so one Forest cannot pay it', () => {
    // The action to begin casting is offered before any target is chosen (D-424 assumes the most favourable one); the cost as it is paid is not reduced.
    const g = board(true);
    expect(() => g.act(0).cast(BEARS, { pay: true })).toThrow(/cannot pay/);
  });
});
