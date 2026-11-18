// Issue 89 (Silverquill Influence), group 10 (D-597): "Inklings can't attack you or planeswalkers you control." (Combat Calligrapher) and "Each creature that's enchanted by an Aura you
// control can't attack you or planeswalkers you control." (Eriette of the Charmed Apple): a static ability of a permanent that keeps the creatures it describes from attacking its
// controller and the planeswalkers that controller controls.
// Pins: CR 508.1a and 508.1c (a creature that can't attack a player or a planeswalker is not declared attacking it; the requirement and the restriction are about each defender), CR 506.3
// (a player, a planeswalker or a battle can be attacked), CR 604.1 (the ability of a permanent that lost its abilities gives nothing), CR 613.1f, and "you": only the controller of the
// permanent and what they control are protected, so another player may still be attacked.
// Cards: the SYNTHETIC "Bear Warden" of this file, the SYNTHETIC Vanilla Planeswalker and the real Grizzly Bears (a Bear), Llanowar Elves (an Elf) and the basic lands.
import { describe, expect, test } from 'vitest';
import { attackCandidates } from '../src/rules/combat-legality';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const WARDEN = 'SYNTHETIC Bear Warden'; // Bears can't attack you or planeswalkers you control.
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const warden = singleFaceCard({
  name: WARDEN,
  manaCost: ['2', 'W'],
  types: ['creature'],
  subtypes: ['Human', 'Cleric'],
  colors: ['W'],
  colorIdentity: ['W'],
  power: 2,
  toughness: 4,
  oracleText: "Bears can't attack you or planeswalkers you control.",
  abilities: [
    {
      kind: 'static',
      static: { kind: 'cantAttackYou', creatures: { subtypes: ['Bear'] }, planeswalkers: true },
    },
  ],
});

/** Seat 1's turn, at its precombat main phase: its Bears and Elves face seat 0's Warden and planeswalker. */
const board = () =>
  scenario()
    .seat(0)
    .define(warden)
    .library(...LIBRARY)
    .battlefield(WARDEN, WALKER)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, ELVES)
    .at('precombatMain', { active: 1 })
    .build();

describe('"Bears can\'t attack you or planeswalkers you control."', () => {
  test('the Bears cannot attack its controller; the Elves still can', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.act(1).try.declareAttackers([{ attacker: BEARS, target: { player: 0 } }]).ok).toBe(
      false,
    );
    expect(g.act(1).try.declareAttackers([{ attacker: ELVES, target: { player: 0 } }]).ok).toBe(
      true,
    );
  });

  test("the Bears cannot attack the controller's planeswalker either; the Elves can", () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.act(1).try.declareAttackers([{ attacker: BEARS, target: WALKER }]).ok).toBe(false);
    expect(g.act(1).try.declareAttackers([{ attacker: ELVES, target: WALKER }]).ok).toBe(true);
  });

  test('another player may still be attacked: with a third player the Bears can attack only that player (CR 508.1)', () => {
    const g = board();
    const with3 = {
      ...g.state,
      seats: [...g.state.seats, { ...g.state.seats[1], id: 2 }] as typeof g.state.seats,
    };
    const bears = g.id(BEARS);
    const candidates = attackCandidates({ ...with3, turn: { ...with3.turn, activeSeat: 1 } }, 1);
    const targets = candidates.find((c) => c.attacker === bears)?.targets ?? [];
    expect(targets.some((t) => t.kind === 'player' && t.seat === 0)).toBe(false);
    expect(targets.some((t) => t.kind === 'player' && t.seat === 2)).toBe(true);
  });

  test('a creature of the controller is not affected: it could not attack its own controller anyway, and the Warden never restricts its own side', () => {
    const g = scenario()
      .seat(0)
      .define(warden)
      .library(...LIBRARY)
      .battlefield(WARDEN, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(WALKER)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.act(0).try.declareAttackers([{ attacker: BEARS, target: WALKER }]).ok).toBe(true);
  });

  test('it lasts as long as the Warden has the ability: with no abilities left the Bears may attack (CR 604.1, 613.1f)', () => {
    const g = board();
    const state = {
      ...g.state,
      turn: { ...g.state.turn, activeSeat: 1 as const },
      continuousEffects: [
        ...g.state.continuousEffects,
        {
          id: 'ce-test',
          timestamp: 999,
          objects: [g.id(WARDEN)],
          until: 'permanent' as const,
          change: { kind: 'loseAllAbilities' as const },
        },
      ],
    };
    const bears = g.id(BEARS);
    const targets = attackCandidates(state, 1).find((c) => c.attacker === bears)?.targets ?? [];
    expect(targets.some((t) => t.kind === 'player' && t.seat === 0)).toBe(true);
  });
});

describe('"Each creature that\'s enchanted by an Aura you control can\'t attack you or planeswalkers you control."', () => {
  const ERIETTE = 'SYNTHETIC Aura Warden';
  const MIGHT = 'SYNTHETIC Might Aura';
  const eriette = singleFaceCard({
    name: ERIETTE,
    manaCost: ['2', 'W'],
    types: ['creature'],
    subtypes: ['Human', 'Warlock'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 2,
    toughness: 4,
    oracleText:
      "Each creature that's enchanted by an Aura you control can't attack you or planeswalkers you control.",
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'cantAttackYou',
          creatures: { types: ['creature'], enchantedByYou: true },
          planeswalkers: true,
        },
      },
    ],
  });

  /** Seat 0 casts the Aura on `target` (of seat 1) in its main phase, then it is seat 1's turn. */
  const enchantedGame = (target: string) => {
    const g = scenario()
      .seat(0)
      .define(eriette)
      .hand(MIGHT)
      .library(...LIBRARY)
      .battlefield('Forest', 'Forest', ERIETTE)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, ELVES)
      .at('precombatMain')
      .build();
    g.act(0).cast(MIGHT, { targets: [{ name: target, seat: 1 }], pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };

  test('a creature enchanted by my Aura cannot attack me; the other creature can', () => {
    const g = enchantedGame(BEARS);
    expect(g.act(1).try.declareAttackers([{ attacker: BEARS, target: { player: 0 } }]).ok).toBe(
      false,
    );
    expect(g.act(1).try.declareAttackers([{ attacker: ELVES, target: { player: 0 } }]).ok).toBe(
      true,
    );
  });

  test('an Aura its own controller put on it is no Aura I control: it can attack me (CR 303.4e)', () => {
    const g = scenario()
      .seat(0)
      .define(eriette)
      .library(...LIBRARY)
      .battlefield(ERIETTE)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .battlefield(MIGHT, { attachedTo: BEARS })
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.act(1).try.declareAttackers([{ attacker: BEARS, target: { player: 0 } }]).ok).toBe(
      true,
    );
  });
});
