// Frontline Medic (Party Time deck, issue 170), Battalion: "Whenever ~ and at least two other creatures attack, creatures you control gain indestructible until end of turn."
// Pins: CR 207.2c (an ability word has no rules meaning), CR 508.1 (the attackers are declared together), CR 603.2 (it triggers only for the declaration that holds the creature
// and at least that many others), CR 702.12b (indestructible: a destroy effect and lethal damage do not destroy it).
// Cards: the SYNTHETIC "Battalion Medic" of this file and the real Grizzly Bears, Healer's Hawk and Llanowar Elves.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const MEDIC = 'SYNTHETIC Battalion Medic';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const ELVES = 'Llanowar Elves';

const medic = singleFaceCard({
  name: MEDIC,
  manaCost: ['2', 'W'],
  types: ['creature'],
  subtypes: ['Human', 'Cleric'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 2,
  toughness: 2,
  oracleText:
    'Battalion — Whenever this creature and at least two other creatures attack, creatures you control gain indestructible until end of turn.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' }, withOthers: 2 },
      effect: {
        kind: 'grantKeyword',
        objects: {
          kind: 'each',
          filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
        },
        keyword: { kind: 'indestructible' },
        duration: 'untilEndOfTurn',
      },
    },
  ],
});

const attackWith = (...attackers: readonly string[]) => {
  const g = scenario().seat(0).define(medic).battlefield(MEDIC, BEARS, HAWK, ELVES).seat(1).build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(0).attack([...attackers]);
  return g;
};

const indestructible = (g: ReturnType<typeof attackWith>, name: string) =>
  g
    .view(0)
    .battlefield.find((o) => o.name === name)
    ?.keywords.includes('indestructible') === true;

describe('Battalion: "~ and at least two other creatures attack"', () => {
  test('the creature and two others attack: it triggers and every creature I control, attacking or not, gains indestructible', () => {
    const g = attackWith(MEDIC, BEARS, HAWK);
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    for (const name of [MEDIC, BEARS, HAWK, ELVES]) expect(indestructible(g, name)).toBe(true);
    g.expect.invariants();
  });

  test('the creature and only one other attack: no trigger', () => {
    const g = attackWith(MEDIC, BEARS);
    g.expect.stack([]);
  });

  test('two other creatures attack but not the creature itself: no trigger', () => {
    const g = attackWith(BEARS, HAWK);
    g.expect.stack([]);
  });

  test('the creature and three others attack: it still triggers once', () => {
    const g = attackWith(MEDIC, BEARS, HAWK, ELVES);
    expect(g.state.stack).toHaveLength(1);
  });
});
