// Issue 144 (the Goblin deck): "Whenever one or more Goblins you control attack, create a 1/1 red Goblin creature token that's tapped and attacking" (General Kreat, the Boltbringer) and
// "At the beginning of your end step, if you attacked this turn, ..." (Raid, Searslicer Goblin). Cards are SYNTHETIC, written as nodes: the real Oracle text of the three cards is
// read and played in packages/cards/test/convert-grammar-engine-issue144.test.ts.
// Pins: CR 508.1 and 603.2c (one trigger for the declaration), CR 508.4 and 110.5b (a token that enters tapped and attacking was never declared as an attacker: no attack trigger sees it
// and the turn log does not count it), CR 603.4 (the intervening "if" is read as the ability triggers and as it resolves), `triggerAttackedPlayer` valid in an `attackBatch` trigger.
import { describe, expect, test } from 'vitest';
import { validateCard } from '../src/index';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const GOBLIN_TOKEN = {
  kind: 'custom',
  definition: {
    name: 'Goblin',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: ['Goblin'],
    colors: ['R'],
    power: 1,
    toughness: 1,
    loyalty: null,
    defense: null,
    oracleText: '',
    abilities: [],
  },
} as const;

const LEADER = 'SYNTHETIC Goblin Leader';
const leader = singleFaceCard({
  name: LEADER,
  manaCost: ['2', 'R'],
  types: ['creature'],
  subtypes: ['Goblin', 'Soldier'],
  colors: ['R'],
  colorIdentity: ['R'],
  power: 2,
  toughness: 3,
  oracleText:
    "Whenever one or more Goblins you control attack, create a 1/1 red Goblin creature token that's tapped and attacking.",
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'attackBatch', who: 'you', atLeast: 1, what: { subtypes: ['Goblin'] } },
      effect: {
        kind: 'createToken',
        token: GOBLIN_TOKEN,
        count: 1,
        tapped: true,
        attacking: { at: { kind: 'triggerAttackedPlayer' } },
      },
    },
  ],
});

const SLICER = 'SYNTHETIC End Step Raider';
const slicer = singleFaceCard({
  name: SLICER,
  manaCost: ['1', 'R'],
  types: ['creature'],
  subtypes: ['Goblin'],
  colors: ['R'],
  colorIdentity: ['R'],
  power: 2,
  toughness: 1,
  oracleText:
    'At the beginning of your end step, if you attacked this turn, create a 1/1 red Goblin creature token.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'step', step: 'endStep', whose: 'you' },
      interveningIf: { kind: 'attackedWithCreaturesThisTurn', atLeast: 1 },
      effect: { kind: 'createToken', token: GOBLIN_TOKEN, count: 1 },
    },
  ],
});

const BEARS = 'Grizzly Bears';
const GOBLIN = 'Raging Goblin';
const LIBRARY = Array.from({ length: 12 }, () => 'Mountain');

describe('the cards are valid', () => {
  test.each([leader, slicer])('$name', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('"Whenever one or more Goblins you control attack, create a token that\'s tapped and attacking"', () => {
  const board = (...others: string[]) => {
    const g = scenario()
      .seat(0)
      .define(leader)
      .library(...LIBRARY)
      .battlefield(LEADER, GOBLIN, ...others)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };
  const tokens = (g: ReturnType<typeof board>) => g.find({ name: 'Goblin', zone: 'battlefield' });

  test('two Goblins attack: one token, tapped, attacking the player they attacked', () => {
    const g = board();
    g.act(0).attack([LEADER, GOBLIN]);
    g.passAll();
    const made = tokens(g);
    expect(made).toHaveLength(1);
    const [token] = made;
    if (token === undefined) throw new Error('no token');
    expect(token.tapped).toBe(true);
    const entry = g.state.combat?.attackers.find((a) => a.object === token.id);
    expect(entry?.target).toEqual({ kind: 'player', seat: 1 });
    g.expect.invariants();
  });

  test('it was never declared as an attacker (CR 508.4): the turn log does not count it, its damage is dealt', () => {
    const g = board();
    g.act(0).attack([GOBLIN]);
    g.passAll();
    const [token] = tokens(g);
    if (token === undefined) throw new Error('no token');
    expect(g.state.turnLog.attackedWith.some((a) => a.object === token.id)).toBe(false);
    g.advanceTo('endOfCombat');
    // Raging Goblin (1) and the token (1), unblocked.
    g.expect.life(1, 38);
  });

  test('a creature that is not a Goblin attacking does not trigger it', () => {
    const g = board(BEARS);
    g.act(0).attack([BEARS]);
    g.passAll();
    expect(tokens(g)).toHaveLength(0);
  });
});

describe('"At the beginning of your end step, if you attacked this turn"', () => {
  const board = () => {
    const g = scenario()
      .seat(0)
      .define(slicer)
      .library(...LIBRARY)
      .battlefield(SLICER, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };
  const tokens = (g: ReturnType<typeof board>) => g.find({ name: 'Goblin', zone: 'battlefield' });

  test('one attacker is enough', () => {
    const g = board();
    g.act(0).attack([BEARS]);
    g.advanceTo('end');
    g.passAll();
    expect(tokens(g)).toHaveLength(1);
  });

  test('no attack: the ability does not trigger', () => {
    const g = board();
    g.act(0).noAttackers();
    g.advanceTo('end');
    g.expect.stack([]);
    g.passAll();
    expect(tokens(g)).toHaveLength(0);
  });
});
