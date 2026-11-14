// Command Tower and commander color identity.
// Pins: CR 903.4 (Commander): color identity is the colors of mana symbols in a card's cost and
// rules text; CR 903.4a: it is established before the game; CR 903.4f: if an ability refers to the
// colors in a commander's color identity, that quality is undefined when the player has no
// commander, the part of the ability won't do anything and costs that refer to it are unpayable;
// CR 605.1a (Mana Abilities): the Tower's ability is a mana ability, so it never uses the stack.
// "SYNTHETIC Colorless Commander" is an invented card (not real data) with an empty identity.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { scenario } from '../src/testing/index';

const ISAMARU = 'Isamaru, Hound of Konda';
const YARGLE = 'Yargle, Glutton of Urborg';

const colorless = singleFace({
  name: 'SYNTHETIC Colorless Commander',
  manaCost: ['5'],
  supertypes: ['legendary'],
  types: ['artifact', 'creature'],
  subtypes: ['Golem'],
  colors: [],
  colorIdentity: [],
  power: 4,
  toughness: 4,
  oracleText: '',
});

describe('CR 903.4 (Commander): Command Tower makes only the commander colors', () => {
  test('a white commander: the Tower makes white', () => {
    const g = scenario().seat(0).battlefield('Command Tower').commander(ISAMARU).build();
    g.act(0).tapForMana('Command Tower');
    g.expect.pool(0, 'W');
    g.expect.tapped('Command Tower');
  });

  test('a black commander: the Tower makes black', () => {
    const g = scenario().seat(0).battlefield('Command Tower').commander(YARGLE).build();
    g.act(0).tapForMana('Command Tower');
    g.expect.pool(0, 'B');
  });

  test('one color only: asking for another color is rejected and not offered', () => {
    const g = scenario().seat(0).battlefield('Command Tower').commander(ISAMARU).build();
    for (const color of ['U', 'B', 'R', 'G', 'C'] as const) {
      g.expect.illegal(0, { tap: 'Command Tower', color });
    }
    g.expect.legal(0, { tap: 'Command Tower', color: 'W' });
  });

  test('two commanders combine their identities: white or black, one mana each tap (CR 903.4)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Command Tower')
      .commander(ISAMARU)
      .commander(YARGLE)
      .build();
    g.expect.legal(0, { tap: 'Command Tower', color: 'W' });
    g.expect.legal(0, { tap: 'Command Tower', color: 'B' });
    g.expect.illegal(0, { tap: 'Command Tower', color: 'R' });
    g.act(0).tapForMana('Command Tower', { color: 'B' });
    g.expect.pool(0, 'B');
  });

  test('the commander need not be in the command zone: its identity was set before the game (CR 903.4a)', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Command Tower')
      .battlefield(ISAMARU, { commander: true })
      .build();
    g.expect.legal(0, { tap: 'Command Tower', color: 'W' });
    const dead = scenario()
      .seat(0)
      .battlefield('Command Tower')
      .graveyard(ISAMARU, { commander: true })
      .build();
    dead.expect.legal(0, { tap: 'Command Tower', color: 'W' });
  });

  test('the mana pays a cost of that color: Command Tower casts Isamaru from the command zone', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Command Tower')
      .commander(ISAMARU, { label: 'cmd' })
      .build();
    g.act(0).cast('cmd', { pay: true });
    g.expect.stack([ISAMARU]);
    g.expect.tapped('Command Tower');
  });

  test('it is a mana ability: no stack, no priority pass (CR 605.3b)', () => {
    const g = scenario().seat(0).battlefield('Command Tower').commander(ISAMARU).seat(1).build();
    g.act(0).tapForMana('Command Tower');
    g.expect.stack([]);
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'priorityPassed' });
  });

  test('it can only tap once: a tapped Tower is not offered again', () => {
    const g = scenario().seat(0).battlefield('Command Tower').commander(ISAMARU).build();
    g.act(0).tapForMana('Command Tower');
    g.expect.illegal(0, { tap: 'Command Tower' });
  });
});

describe('CR 903.4f (Commander): a colorless commander gives nothing', () => {
  test('the Tower produces no mana for a colorless commander: not offered, rejected', () => {
    const g = scenario()
      .define(colorless)
      .seat(0)
      .battlefield('Command Tower')
      .commander('SYNTHETIC Colorless Commander')
      .build();
    g.expect.illegal(0, { tap: 'Command Tower' });
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C'] as const) {
      g.expect.illegal(0, { tap: 'Command Tower', color });
    }
    g.expect.tapped('Command Tower', false);
    g.expect.pool(0, '');
  });

  test('a player with no commander gets nothing from the Tower', () => {
    const g = scenario().seat(0).battlefield('Command Tower').build();
    g.expect.illegal(0, { tap: 'Command Tower' });
  });

  test('a colorless commander does not make Sol Ring or lands stop working', () => {
    const g = scenario()
      .define(colorless)
      .seat(0)
      .battlefield('Command Tower', 'Sol Ring', 'Forest')
      .commander('SYNTHETIC Colorless Commander')
      .build();
    g.act(0).tapForMana('Sol Ring');
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'CCG');
  });

  test('the opponent commander does not count: identity is per player', () => {
    const g = scenario().seat(0).battlefield('Command Tower').seat(1).commander(YARGLE).build();
    g.expect.illegal(0, { tap: 'Command Tower' });
    expect(g.state.seats[0]?.commanders).toEqual([]);
  });
});

describe('CR 903.4 (Commander): the Tower for the other seat', () => {
  test("seat 1's Tower uses seat 1's commander", () => {
    const g = scenario()
      .seat(0)
      .commander(ISAMARU)
      .seat(1)
      .battlefield('Command Tower')
      .commander(YARGLE)
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.act(1).tapForMana('Command Tower');
    g.expect.pool(1, 'B');
  });

  test('the identity of the fixtures matches what the test relies on', () => {
    const g = scenario().seat(0).commander(ISAMARU).seat(1).commander(YARGLE).build();
    const identity = (seat: number) => {
      const card = g.state.seats[seat]?.commanders[0];
      const def = card ? g.state.definitions[g.state.cards[card]?.definition ?? -1] : undefined;
      return def?.colorIdentity;
    };
    expect(identity(0)).toEqual(['W']);
    expect(identity(1)).toEqual(['B']);
  });
});
