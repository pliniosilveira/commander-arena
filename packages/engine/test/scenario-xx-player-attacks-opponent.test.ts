// Issue 89 (Silverquill Influence), group 11 (D-648): "Whenever a player attacks one of your opponents, that attacking player draws a card and that opponent loses 1 life."
// (the trigger of Breena, the Demagogue and Combat Calligrapher).
// Pins: CR 508.1 (the attackers are declared together), CR 603.2 and 603.2c (the ability triggers once for each player attacked by the declaration, however many creatures attack it),
// CR 506.3 and 508.6 (an attack on a planeswalker is not an attack on the player who controls it), CR 603.7c is not involved, and "one of your opponents": the controller of the ability is
// not one of its own opponents, so an attack on the controller does not trigger it.
// Cards: the SYNTHETIC "Opponent Watcher" of this file, the SYNTHETIC Vanilla Planeswalker and the real Grizzly Bears, Healer's Hawk and the basic lands.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const WATCHER = 'SYNTHETIC Opponent Watcher';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const watcher = singleFaceCard({
  name: WATCHER,
  manaCost: ['2', 'W'],
  types: ['creature'],
  subtypes: ['Bird', 'Cleric'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 3,
  toughness: 3,
  oracleText:
    'Whenever a player attacks one of your opponents, that attacking player draws a card and that opponent loses 1 life.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'playerAttacksOpponent' },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'draw', player: { kind: 'triggerPlayer' }, count: 1 },
          { kind: 'loseLife', player: { kind: 'triggerAttackedPlayer' }, amount: 1 },
        ],
      },
    },
  ],
});

/** Seat 0 has the Watcher and attacks with `attackers` at the opponent (or at its planeswalker). */
const myAttack = (...targets: readonly ('player' | 'walker')[]) => {
  const g = scenario()
    .seat(0)
    .define(watcher)
    .library(...LIBRARY)
    .battlefield(WATCHER, BEARS, HAWK)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(WALKER)
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  const attackers = [BEARS, HAWK] as const;
  g.act(0).declareAttackers(
    targets.map((t, i) => ({
      attacker: attackers[i] ?? BEARS,
      target: t === 'walker' ? WALKER : { player: 1 },
    })),
  );
  return g;
};

describe('"Whenever a player attacks one of your opponents"', () => {
  test('I attack my opponent: it triggers, I draw a card and my opponent loses 1 life', () => {
    const g = myAttack('player');
    g.expect.stack([`${WATCHER} (ability)`]);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.life(1, 39);
    g.expect.invariants();
  });

  test('two creatures at the same opponent: it triggers once for that player (CR 603.2c)', () => {
    const g = myAttack('player', 'player');
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.life(1, 39);
  });

  test("an attack on the opponent's planeswalker is not an attack on the opponent: nothing triggers (CR 508.6)", () => {
    const g = myAttack('walker');
    g.expect.stack([]);
    g.expect.handSize(0, 0);
    g.expect.life(1, 40);
  });

  test('a creature at the player and one at the planeswalker: the player is attacked once, so it triggers once', () => {
    const g = myAttack('player', 'walker');
    expect(g.state.stack).toHaveLength(1);
  });

  test('the opponent attacks me, the controller: I am not one of my own opponents, so nothing triggers', () => {
    const g = scenario()
      .seat(0)
      .define(watcher)
      .library(...LIBRARY)
      .battlefield(WATCHER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack([BEARS]);
    g.expect.stack([]);
    g.expect.handSize(0, 0);
    g.expect.handSize(1, 0);
  });
});

describe('Combat Calligrapher: "that attacking player creates a tapped 2/1 ... Inkling creature token with flying that\'s attacking that opponent"', () => {
  const MAKER = 'SYNTHETIC Inkling Maker';
  const maker = singleFaceCard({
    name: MAKER,
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Bird', 'Cleric'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 3,
    toughness: 3,
    oracleText:
      "Whenever a player attacks one of your opponents, that attacking player creates a tapped 2/1 white and black Inkling creature token with flying that's attacking that opponent.",
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'playerAttacksOpponent' },
        effect: {
          kind: 'createToken',
          token: {
            kind: 'custom',
            definition: {
              name: 'Inkling',
              manaCost: null,
              supertypes: [],
              types: ['creature'],
              subtypes: ['Inkling'],
              colors: ['W', 'B'],
              power: 2,
              toughness: 1,
              loyalty: null,
              defense: null,
              oracleText: 'Flying',
              abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
            },
          },
          count: 1,
          controller: { kind: 'triggerPlayer' },
          tapped: true,
          attacking: { at: { kind: 'triggerAttackedPlayer' } },
        },
      },
    ],
  });

  const attacked = () => {
    const g = scenario()
      .seat(0)
      .define(maker)
      .library(...LIBRARY)
      .battlefield(MAKER, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.passAll();
    return g;
  };

  test('the attacking player gets a tapped Inkling token that is attacking the opponent', () => {
    const g = attacked();
    const tokens = g.find({ name: 'Inkling', zone: 'battlefield' });
    expect(tokens).toHaveLength(1);
    const token = tokens[0];
    if (token === undefined) throw new Error('no token');
    expect(token.tapped).toBe(true);
    expect(g.state.combat?.attackers.some((a) => a.object === token.id)).toBe(true);
    const entry = g.state.combat?.attackers.find((a) => a.object === token.id);
    expect(entry?.target).toEqual({ kind: 'player', seat: 1 });
    g.expect.invariants();
  });

  test('it was never declared as an attacker (CR 508.4): its damage still goes to the opponent', () => {
    const g = attacked();
    g.advanceTo('endOfCombat');
    // The Bears (2) and the Inkling (2) are unblocked.
    g.expect.life(1, 36);
  });
});
