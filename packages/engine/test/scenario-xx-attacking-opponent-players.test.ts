// Issue 89 (Silverquill Influence), "each other creature that's attacking one of your opponents gets +1/+1 until end of turn" (D-650; Martial Impetus).
// Pins: CR 508.1b (a creature attacks a player, a planeswalker or a battle: one at a planeswalker does not attack the player), CR 611.2c (the group is fixed as the effect
// resolves), CR 603.2 (the Aura's controller's ability triggers when the enchanted creature attacks), CR 303.4m (the Aura's own abilities).
// Cards: the SYNTHETIC Aura and Vanilla Planeswalker of this file, the real Grizzly Bears, Healer's Hawk and Llanowar Elves.
import { describe, expect, test } from 'vitest';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const AURA = 'SYNTHETIC Rally Aura'; // Enchant creature. Whenever enchanted creature attacks, each other creature that's attacking one of your opponents gets +1/+1 until end of turn.
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const ELVES = 'Llanowar Elves';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const aura = singleFaceCard({
  name: AURA,
  manaCost: ['1', 'W'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText:
    "Enchant creature\nWhenever enchanted creature attacks, each other creature that's attacking one of your opponents gets +1/+1 until end of turn.",
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'attached' } },
      effect: {
        kind: 'modifyPt',
        objects: {
          kind: 'each',
          filter: { zone: 'battlefield', types: ['creature'], attackingOpponents: 'players' },
          except: { kind: 'triggerSubject' },
        },
        power: 1,
        toughness: 1,
        duration: 'untilEndOfTurn',
      },
    },
  ],
});

/** I attack with the enchanted Bears at the player, the Hawk at the player and the Elves at the planeswalker. */
function myAttack() {
  const g = scenario()
    .seat(0)
    .define(aura)
    .library(...LIBRARY)
    .battlefield(BEARS, HAWK, ELVES)
    .battlefield(AURA, { attachedTo: BEARS })
    .seat(1)
    .define(
      singleFaceCard({
        name: WALKER,
        manaCost: ['2'],
        types: ['planeswalker'],
        colors: [],
        colorIdentity: [],
        loyalty: 3,
        oracleText: '',
      }),
    )
    .library(...LIBRARY)
    .battlefield(WALKER)
    .at('precombatMain')
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).declareAttackers([
    { attacker: BEARS, target: { player: 1 } },
    { attacker: HAWK, target: { player: 1 } },
    { attacker: ELVES, target: WALKER },
  ]);
  g.passAll();
  return g;
}

const power = (g: ReturnType<typeof myAttack>, name: string) =>
  derive(g.state, g.object(g.id(name))).power;

describe('"each other creature that\'s attacking one of your opponents gets +1/+1"', () => {
  test('a creature attacking the opponent as a player gets it', () => {
    expect(power(myAttack(), HAWK)).toBe(2);
  });

  test('the enchanted creature is not "other"', () => {
    expect(power(myAttack(), BEARS)).toBe(2);
  });

  test('a creature attacking a planeswalker does not attack the opponent (CR 508.1b)', () => {
    expect(power(myAttack(), ELVES)).toBe(1);
  });
});
