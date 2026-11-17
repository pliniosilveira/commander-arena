// Issue 89 (Silverquill Influence), group 6 (D-593): "Whenever an opponent attacks with creatures, if two or more of those creatures are attacking you and/or planeswalkers you
// control, draw a card" (Mangara, the Diplomat; Tomik, Wielder of Law).
// Pins: CR 508.1b (a creature attacks a player, a planeswalker or a battle; those at a planeswalker are not at its controller as a player, but "you and/or planeswalkers you
// control" counts both), CR 603.2 (the ability triggers once for the declaration), CR 603.4 (an intervening "if": the ability triggers only if the condition is true as the
// attack is declared, and checks it again as it resolves, from the declaration), CR 603.10 (the declaration is what is read, so a creature removed from combat still counts).
// Cards: the SYNTHETIC "Watcher" of this file, the SYNTHETIC Vanilla Planeswalker and the real Grizzly Bears and Healer's Hawk.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const WATCHER = 'SYNTHETIC Attack Watcher'; // Whenever an opponent attacks with creatures, if two or more of those creatures are attacking you and/or planeswalkers you control, draw a card.
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const watcher = singleFaceCard({
  name: WATCHER,
  manaCost: ['2', 'W'],
  types: ['creature'],
  subtypes: ['Cleric'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 2,
  toughness: 4,
  oracleText:
    'Whenever an opponent attacks with creatures, if two or more of those creatures are attacking you and/or planeswalkers you control, draw a card.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'attackBatch', who: 'opponent', atLeast: 1 },
      interveningIf: { kind: 'attackersAtYouAtLeast', count: 2 },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    },
  ],
});

/** Seat 1 attacks with the Bears and the Hawk, each at me or at my planeswalker, or only with the first `count` creatures. */
const theirAttack = (targets: readonly ('me' | 'walker')[]) => {
  const g = scenario()
    .seat(0)
    .define(watcher)
    .library(...LIBRARY)
    .battlefield(WATCHER, WALKER)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, HAWK)
    .at('precombatMain', { active: 1 })
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  const attackers = [BEARS, HAWK] as const;
  g.act(1).declareAttackers(
    attackers.slice(0, targets.length).map((attacker, i) => ({
      attacker,
      target: targets[i] === 'walker' ? WALKER : { player: 0 },
    })),
  );
  return g;
};

describe('"if two or more of those creatures are attacking you and/or planeswalkers you control"', () => {
  test('both at me: the ability triggers and I draw a card', () => {
    const g = theirAttack(['me', 'me']);
    g.expect.stack([`${WATCHER} (ability)`]);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('one at me and one at my planeswalker: two of them attack what I own, so I draw', () => {
    const g = theirAttack(['me', 'walker']);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('both at my planeswalker: I draw', () => {
    const g = theirAttack(['walker', 'walker']);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('one attacker only: the intervening "if" is false, so nothing is put on the stack (CR 603.4)', () => {
    const g = theirAttack(['me']);
    g.expect.stack([]);
    expect(g.state.pendingTriggers).toHaveLength(0);
    g.expect.handSize(0, 0);
  });

  test('it triggers once for the declaration, however many creatures (CR 603.2)', () => {
    const g = theirAttack(['me', 'me']);
    expect(g.state.stack).toHaveLength(1);
  });

  test('my own attack does not trigger it: "an opponent attacks"', () => {
    const g = scenario()
      .seat(0)
      .define(watcher)
      .library(...LIBRARY)
      .battlefield(WATCHER, BEARS, HAWK)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS, HAWK]);
    g.expect.stack([]);
  });
});

describe('Tomik, Wielder of Law: "that opponent loses 3 life and you draw a card"', () => {
  const TOMIK = 'SYNTHETIC Attack Punisher';
  const punisher = singleFaceCard({
    name: TOMIK,
    manaCost: ['3', 'W'],
    types: ['creature'],
    subtypes: ['Advisor'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 4,
    oracleText:
      'Whenever an opponent attacks with creatures, if two or more of those creatures are attacking you and/or planeswalkers you control, that opponent loses 3 life and you draw a card.',
    abilities: [
      {
        kind: 'triggered',
        trigger: { kind: 'attackBatch', who: 'opponent', atLeast: 1 },
        interveningIf: { kind: 'attackersAtYouAtLeast', count: 2 },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'loseLife', player: { kind: 'triggerPlayer' }, amount: 3 },
            { kind: 'draw', player: { kind: 'you' }, count: 1 },
          ],
        },
      },
    ],
  });

  test('the attacking opponent loses 3 life and I draw a card', () => {
    const g = scenario()
      .seat(0)
      .define(punisher)
      .library(...LIBRARY)
      .battlefield(TOMIK)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, HAWK)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([
      { attacker: BEARS, target: { player: 0 } },
      { attacker: HAWK, target: { player: 0 } },
    ]);
    g.passAll();
    g.expect.life(1, 37);
    g.expect.life(0, 40);
    g.expect.handSize(0, 1);
  });
});
