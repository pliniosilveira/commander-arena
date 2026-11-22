// "When this creature dies, you may cast it from your graveyard as an Adventure until the end of your next turn" (Hildibrand Manderville, issue 98): a `mayCast` with
// `adventure` and the duration `untilEndOfNextTurn`, made by a dies trigger of the card itself.
// Pins: CR 601.2 (casting from the graveyard when an effect permits it), CR 715.3 (casting an adventurer card as an Adventure), CR 715.3d (the Adventure that resolves is
// exiled, and its card may be cast as the creature from there), CR 611.2a and 514.2 (the permission lasts as long as the effect says: here to the end of the controller's
// next turn), CR 400.7 (a card that left the graveyard is a new object: the permission names the card as it was), CR 603.10a (the dies trigger looks back).
// The card is SYNTHETIC.
import { describe, expect, test } from 'vitest';
import type { CardDefinition, CardFace } from '../src/cards/definition';
import { checkInvariants, getLegalActions, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const KNIGHT = 'SYNTHETIC Fallen Knight // Last Rite';
const BOLT = 'Lightning Bolt';

const face = (input: Partial<CardFace> & Pick<CardFace, 'name' | 'types' | 'oracleText'>) =>
  ({
    manaCost: null,
    supertypes: [],
    subtypes: [],
    colors: [],
    power: null,
    toughness: null,
    loyalty: null,
    defense: null,
    abilities: [],
    spell: null,
    ...input,
  }) satisfies CardFace;

const knight: CardDefinition = {
  oracleId: null,
  name: KNIGHT,
  layout: 'adventure',
  colorIdentity: ['B'],
  support: 'supported',
  faces: [
    face({
      name: 'Fallen Knight',
      manaCost: ['1', 'B'],
      types: ['creature'],
      subtypes: ['Human'],
      colors: ['B'],
      power: 2,
      toughness: 2,
      oracleText:
        'SYNTHETIC: when this creature dies, you may cast it from your graveyard as an Adventure until the end of your next turn.',
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'dies', what: { kind: 'this' } },
          effect: {
            kind: 'mayCast',
            objects: { kind: 'thisCard' },
            duration: 'untilEndOfNextTurn',
            adventure: true,
          },
        },
      ],
    }),
    face({
      name: 'Last Rite',
      manaCost: ['B'],
      types: ['instant'],
      subtypes: ['Adventure'],
      colors: ['B'],
      oracleText: 'SYNTHETIC: you gain 3 life.',
      spell: { effect: { kind: 'gainLife', player: { kind: 'you' }, amount: 3 } },
    }),
  ],
};

/** Seat 0 (active, turn 1) has the Knight, a Bolt and mana; the others have nothing to do. */
function game(seats: 2 | 3 | 4 = 2) {
  let b = scenario({ seats })
    .define(knight)
    .seat(0)
    .hand(BOLT)
    .battlefield(KNIGHT)
    .battlefield('Mountain', 'Mountain', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
    .library('Island', 'Island', 'Island', 'Island');
  for (let s = 1; s < seats; s++) b = b.seat(s as 1 | 2 | 3).library('Island', 'Island', 'Island');
  return b.at('precombatMain', { active: 0, turn: 1 }).build();
}

function killKnight(g: ScenarioGame) {
  g.act(0).cast(BOLT, { targets: [KNIGHT], pay: true });
  g.passAll(); // Bolt resolves, the Knight dies
  g.passAll(); // the dies ability resolves
}

const castAdventure = (g: ScenarioGame) => g.act(0).cast(KNIGHT, { face: 1, pay: true });

describe('the card is valid', () => {
  test('validateCard finds nothing wrong', () => {
    expect(validateCard(knight)).toEqual([]);
  });

  test('the permission needs the card of the dies trigger of the ability itself, an adventurer card and a graveyard', () => {
    const bad: CardDefinition = {
      ...knight,
      faces: [
        {
          ...knight.faces[0],
          abilities: [
            {
              kind: 'triggered',
              trigger: { kind: 'dies', what: { kind: 'this' } },
              effect: {
                kind: 'mayCast',
                objects: { kind: 'thisCard' },
                duration: 'untilEndOfNextTurn',
                adventure: true,
                exileInstead: true,
              },
            },
          ],
        },
        knight.faces[1],
      ] as CardDefinition['faces'],
    };
    expect(validateCard(bad).length).toBeGreaterThan(0);
  });
});

describe('cast from the graveyard as an Adventure (CR 715.3, 601.2)', () => {
  test('after it dies the Adventure can be cast from the graveyard, the creature half cannot', () => {
    const g = game();
    killKnight(g);
    g.expect.zone(KNIGHT, 'graveyard', { seat: 0 });
    g.advanceTo('postcombatMain'); // a main phase, where a creature spell could be cast
    g.expect.legal(0, { cast: KNIGHT, face: 1 });
    g.expect.illegal(0, { cast: KNIGHT, face: 0 });
  });

  test('before it dies, nothing is castable from the graveyard', () => {
    const g = scenario()
      .define(knight)
      .seat(0)
      .graveyard(KNIGHT)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .build();
    g.expect.illegal(0, { cast: KNIGHT, face: 1 });
    g.expect.illegal(0, { cast: KNIGHT, face: 0 });
  });

  test('the Adventure resolves, the card is exiled on an adventure and the creature is cast from exile (CR 715.3d)', () => {
    const g = game();
    killKnight(g);
    castAdventure(g);
    g.passAll();
    g.expect.life(0, 43);
    g.expect.zone(KNIGHT, 'exile', { seat: 0 });
    expect(g.object(KNIGHT).onAdventure).toBe(true);
    g.advanceTo('postcombatMain'); // the creature half is a creature spell: sorcery timing
    g.expect.legal(0, { cast: KNIGHT, face: 0 });
    g.expect.illegal(0, { cast: KNIGHT, face: 1 });
    g.act(0).cast(KNIGHT, { face: 0, pay: true });
    g.passAll();
    g.expect.zone(KNIGHT, 'battlefield', { seat: 0 });
    expect(checkInvariants(g.state)).toEqual([]);
  });
});

describe('until the end of your next turn (CR 611.2a, 514.2)', () => {
  test('it can be cast this turn, and in the controller next turn, not after it', () => {
    const g = game();
    killKnight(g);
    g.expect.legal(0, { cast: KNIGHT, face: 1 });
    // The next turn of seat 0 is turn 3 (two seats): the permission is still there all through it.
    g.advanceTo('upkeep', { turn: 3 });
    g.expect.legal(0, { cast: KNIGHT, face: 1 });
    g.advanceTo('end', { turn: 3 });
    g.expect.legal(0, { cast: KNIGHT, face: 1 });
    // And it is over once that turn has ended.
    g.advanceTo('upkeep', { turn: 4 });
    g.expect.illegal(0, { cast: KNIGHT, face: 1 });
    g.advanceTo('upkeep', { turn: 5 });
    g.expect.illegal(0, { cast: KNIGHT, face: 1 });
  });

  test('a card that left the graveyard and came back is a new object without the permission (CR 400.7)', () => {
    const g = game();
    killKnight(g);
    const id = g.id(KNIGHT);
    castAdventure(g);
    g.passAll();
    // The adventure resolved: exile, not the graveyard, and no graveyard permission applies to the new object.
    expect(g.id(KNIGHT)).not.toBe(id);
    g.expect.illegal(0, { cast: KNIGHT, face: 1 });
  });
});

describe('3 and 4 seats: only the controller gets the permission', () => {
  test.each([3, 4] as const)('%i seats', (seats) => {
    const g = game(seats);
    killKnight(g);
    g.expect.legal(0, { cast: KNIGHT, face: 1 });
    for (let s = 1; s < seats; s++) {
      expect(getLegalActions(g.state, s).filter((a) => a.kind === 'castSpell')).toEqual([]);
    }
    // The next turn of seat 0 comes after every other seat has had one.
    g.advanceTo('upkeep', { turn: seats + 1 });
    g.expect.legal(0, { cast: KNIGHT, face: 1 });
    g.advanceTo('upkeep', { turn: 2 * seats + 1 });
    g.expect.illegal(0, { cast: KNIGHT, face: 1 });
  });
});
