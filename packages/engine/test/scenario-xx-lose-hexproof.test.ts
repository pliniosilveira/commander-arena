// Issue 89 (Silverquill Influence), "creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud" (D-599): an effect that takes the two
// protections from a group of creatures until end of turn.
// Pins: CR 702.11b (Hexproof), CR 702.18a (Shroud), CR 611.2c (the set of creatures is fixed when the effect begins), CR 514.2 (it ends at the cleanup step),
// CR 613.1f (an ability-removing effect is a layer 6 effect), CR 702.16b (protection is another ability and stays).
// Cards: SYNTHETIC cards of this file, Lightning Bolt and the basic lands.
import { describe, expect, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const BOLT = 'Lightning Bolt';
const UNSHROUD = 'SYNTHETIC Unshroud'; // Instant. Until end of turn, creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud.
const HEX = 'SYNTHETIC Hexproof Bear';
const SHROUD = 'SYNTHETIC Shroud Bear';
const PRO = 'SYNTHETIC Pro-Red Bear';

const bear = (name: string, keyword: 'hexproof' | 'shroud', oracleText: string) =>
  singleFaceCard({
    name,
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText,
    abilities: [{ kind: 'keyword', keyword: { kind: keyword } }],
  });

const unshroud = singleFaceCard({
  name: UNSHROUD,
  manaCost: ['W'],
  types: ['instant'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText:
    "Until end of turn, creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud.",
  spell: {
    effect: {
      kind: 'loseHexproofShroud',
      objects: { kind: 'each', filter: { types: ['creature'], controller: 'opponent' } },
      duration: 'untilEndOfTurn',
    },
  },
});

function board(): ScenarioGame {
  return scenario()
    .seat(0)
    .define(unshroud)
    .hand(UNSHROUD, BOLT, BOLT, BOLT)
    .battlefield('Plains', 'Mountain', 'Mountain', 'Mountain')
    .library('Plains', 'Plains', 'Plains')
    .seat(1)
    .define(bear(HEX, 'hexproof', 'Hexproof'))
    .define(bear(SHROUD, 'shroud', 'Shroud'))
    .define(
      singleFaceCard({
        name: PRO,
        manaCost: ['1', 'G'],
        types: ['creature'],
        colors: ['G'],
        colorIdentity: ['G'],
        power: 2,
        toughness: 2,
        oracleText: 'Hexproof\nProtection from red',
        abilities: [
          { kind: 'keyword', keyword: { kind: 'hexproof' } },
          { kind: 'keyword', keyword: { kind: 'protection', from: 'color', colors: ['R'] } },
        ],
      }),
    )
    .battlefield(HEX, SHROUD, PRO)
    .library('Plains', 'Plains', 'Plains')
    .at('precombatMain')
    .build();
}

/** Whether the Bolt can be cast at `target`: the engine refuses an illegal target. */
const canBolt = (g: ScenarioGame, target: string): boolean => {
  try {
    g.act(0).cast(`${BOLT}[0]`, { targets: [target], pay: true });
    return true;
  } catch {
    return false;
  }
};

describe('creatures your opponents control lose hexproof and shroud (CR 702.11b, 702.18a)', () => {
  test('before the effect neither can be targeted', () => {
    const g = board();
    expect(canBolt(g, HEX)).toBe(false);
    expect(canBolt(g, SHROUD)).toBe(false);
  });

  test('after it, both can be targeted by the spells of the controller of the effect', () => {
    const g = board();
    g.act(0).cast(UNSHROUD, { pay: true });
    g.passAll();
    expect(canBolt(g, HEX)).toBe(true);
    expect(canBolt(g, SHROUD)).toBe(true);
  });

  test('protection is another ability and stays (CR 702.16b)', () => {
    const g = board();
    g.act(0).cast(UNSHROUD, { pay: true });
    g.passAll();
    expect(canBolt(g, PRO)).toBe(false);
  });

  test('it ends with the turn (CR 514.2)', () => {
    const g = board();
    g.act(0).cast(UNSHROUD, { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.continuousEffects).toHaveLength(0);
  });
});
