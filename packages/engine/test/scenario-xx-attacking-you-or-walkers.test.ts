// "First Flight" starter commander decks, creatures attacking "you or a planeswalker you control" (Soul Snare, Vow of Duty, Ever-Watching Threshold).
// Pins: CR 508.1b (a creature is declared as attacking a player, a planeswalker or a battle; one at a planeswalker does not attack its controller as a player, but "you or a
// planeswalker you control" is both), CR 506.3 (a player, a planeswalker or a battle can be attacked), CR 115.1 and 608.2b (a target is chosen as the ability goes on the stack and
// checked again as it resolves), CR 508.1a and 508.1c (an attack restriction is about each defender), CR 603.2c and 603.4 (a batch of attackers triggers once; an intervening "if").
// Cards: the SYNTHETIC "Snare", "Duty Aura" and "Threshold" of this file, the SYNTHETIC Vanilla Planeswalker and the real Grizzly Bears, Healer's Hawk, Llanowar Elves and Plains.
import { describe, expect, test } from 'vitest';
import { applyAction } from '../src/index';
import { attackCandidates } from '../src/rules/combat-legality';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const SNARE = 'SYNTHETIC Snare'; // {W}, Sacrifice ~: Exile target creature that's attacking you or a planeswalker you control.
const DUTY = 'SYNTHETIC Duty Aura'; // Enchant creature. Enchanted creature can't attack you or planeswalkers you control.
const THRESHOLD = 'SYNTHETIC Threshold'; // Whenever an opponent attacks, if they attacked you and/or a planeswalker you control, draw a card.
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const ELVES = 'Llanowar Elves';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const walker = singleFaceCard({
  name: WALKER,
  manaCost: ['2'],
  types: ['planeswalker'],
  colors: [],
  colorIdentity: [],
  loyalty: 3,
  oracleText: '',
});

const snare = singleFaceCard({
  name: SNARE,
  manaCost: ['W'],
  types: ['enchantment'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText:
    "{W}, Sacrifice ~: Exile target creature that's attacking you or a planeswalker you control.",
  abilities: [
    {
      kind: 'activated',
      cost: [
        { kind: 'mana', symbols: ['W'] },
        { kind: 'sacrifice', what: { kind: 'this' } },
      ],
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], attackingYou: 'orPlaneswalkers' },
          },
        },
      ],
      effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
    },
  ],
});

const duty = singleFaceCard({
  name: DUTY,
  manaCost: ['2', 'W'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: "Enchant creature\nEnchanted creature can't attack you or planeswalkers you control.",
  abilities: [
    { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
    {
      kind: 'static',
      static: { kind: 'cantAttackYou', creatures: { hostOfSource: true }, planeswalkers: true },
    },
  ],
});

const threshold = singleFaceCard({
  name: THRESHOLD,
  manaCost: ['2', 'U'],
  types: ['enchantment'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText:
    'Whenever an opponent attacks, if they attacked you and/or a planeswalker you control, draw a card.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'attackBatch', who: 'opponent', atLeast: 1 },
      interveningIf: { kind: 'attackersAtYouAtLeast', count: 1 },
      effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
    },
  ],
});

/** Seat 1 attacks seat 0 with the Bears, seat 0's planeswalker with the Hawk, and keeps the Elves home. Seat 0 has the Snare and a Plains. */
function snareBoard() {
  const g = scenario()
    .seat(0)
    .define(snare)
    .define(walker)
    .library(...LIBRARY)
    .battlefield(SNARE, WALKER, 'Plains')
    .seat(1)
    .library(...LIBRARY)
    .battlefield(BEARS, HAWK, ELVES)
    .at('precombatMain', { active: 1 })
    .build();
  g.advanceTo('declareAttackers', { attack: false });
  g.act(1).declareAttackers([
    { attacker: BEARS, target: { player: 0 } },
    { attacker: HAWK, target: WALKER },
  ]);
  g.act(1).pass();
  return g;
}

describe('"Exile target creature that\'s attacking you or a planeswalker you control."', () => {
  test('a creature attacking me as a player is a legal target and is exiled', () => {
    const g = snareBoard();
    g.act(0).activate(SNARE, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
  });

  test('a creature attacking my planeswalker is a legal target and is exiled', () => {
    const g = snareBoard();
    g.act(0).activate(SNARE, { targets: [HAWK], pay: true });
    g.passAll();
    g.expect.zone(HAWK, 'exile', { seat: 1 });
  });

  test('a creature that is not attacking is not a legal target', () => {
    const g = snareBoard();
    expect(() => g.act(0).activate(SNARE, { targets: [ELVES], pay: true })).toThrow();
  });

  test("my own creature attacking an opponent's planeswalker is not attacking me or mine", () => {
    const g = scenario()
      .seat(0)
      .define(snare)
      .library(...LIBRARY)
      .battlefield(SNARE, BEARS, 'Plains')
      .seat(1)
      .define(walker)
      .library(...LIBRARY)
      .battlefield(WALKER)
      .at('precombatMain')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: BEARS, target: WALKER }]);
    expect(() => g.act(0).activate(SNARE, { targets: [BEARS], pay: true })).toThrow();
  });

  test('an attacker of the other player (not me) is not a target: the opponent sees only its own side', () => {
    // Seat 1 holds the Snare; seat 0 attacks seat 1's planeswalker with the Bears and seat 1 itself with the Hawk: both are attacking seat 1 or its planeswalker.
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, HAWK)
      .seat(1)
      .define(snare)
      .define(walker)
      .library(...LIBRARY)
      .battlefield(SNARE, WALKER, 'Plains')
      .at('precombatMain')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([
      { attacker: BEARS, target: WALKER },
      { attacker: HAWK, target: { player: 1 } },
    ]);
    g.act(0).pass();
    g.act(1).activate(SNARE, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
  });
});

/** Seat 1 holds the Aura on seat 0's Bears (the Aura's controller is seat 1) and the planeswalker; seat 0 may attack. */
function dutyBoard(auraSeat: 0 | 1) {
  const b = scenario()
    .seat(0)
    .define(duty)
    .define(walker)
    .library(...LIBRARY);
  const other = auraSeat === 0 ? 1 : 0;
  // The Aura's controller is `auraSeat`; the enchanted creature is the Bears of the other seat.
  return auraSeat === 1
    ? b
        .battlefield(BEARS, ELVES)
        .seat(1)
        .library(...LIBRARY)
        .battlefield(WALKER)
        .battlefield(DUTY, { attachedTo: BEARS })
        .at('precombatMain', { active: other })
        .build()
    : b
        .battlefield(WALKER)
        .seat(1)
        .library(...LIBRARY)
        .battlefield(BEARS, ELVES)
        .seat(0)
        .battlefield(DUTY, { attachedTo: BEARS })
        .at('precombatMain', { active: other })
        .build();
}

describe('"Enchanted creature can\'t attack you or planeswalkers you control."', () => {
  test("the enchanted creature cannot attack the Aura's controller; another creature can", () => {
    const g = dutyBoard(1);
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.act(0).try.declareAttackers([{ attacker: BEARS, target: { player: 1 } }]).ok).toBe(
      false,
    );
    expect(g.act(0).try.declareAttackers([{ attacker: ELVES, target: { player: 1 } }]).ok).toBe(
      true,
    );
  });

  test("the enchanted creature cannot attack the Aura's controller's planeswalker either; another creature can", () => {
    const g = dutyBoard(1);
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.act(0).try.declareAttackers([{ attacker: BEARS, target: WALKER }]).ok).toBe(false);
    expect(g.act(0).try.declareAttackers([{ attacker: ELVES, target: WALKER }]).ok).toBe(true);
  });

  test('another player may still be attacked: with a third player the enchanted creature can attack only that player (CR 508.1)', () => {
    const g = dutyBoard(1);
    const with3 = {
      ...g.state,
      seats: [...g.state.seats, { ...g.state.seats[1], id: 2 }] as typeof g.state.seats,
      turn: { ...g.state.turn, activeSeat: 0 as const },
    };
    const targets =
      attackCandidates(with3, 0).find((c) => c.attacker === g.id(BEARS))?.targets ?? [];
    expect(targets.some((t) => t.kind === 'player' && t.seat === 1)).toBe(false);
    expect(targets.some((t) => t.kind === 'player' && t.seat === 2)).toBe(true);
    expect(targets.some((t) => t.kind === 'permanent' && t.object === g.id(WALKER))).toBe(false);
  });

  test('"you" is the Aura\'s controller: the enchanted creature of its own controller is only barred from attacking that controller', () => {
    // Seat 0 controls the Aura on seat 1's Bears: seat 1's Bears cannot attack seat 0, which is its opponent anyway.
    const g = dutyBoard(0);
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.act(1).try.declareAttackers([{ attacker: BEARS, target: WALKER }]).ok).toBe(false);
    expect(g.act(1).try.declareAttackers([{ attacker: ELVES, target: WALKER }]).ok).toBe(true);
  });
});

/** Seat 1 attacks with the Bears (and the Hawk when `both`), each at the given target of seat 0. */
function thresholdAttack(targets: readonly ('me' | 'walker')[]) {
  const g = scenario()
    .seat(0)
    .define(threshold)
    .define(walker)
    .library(...LIBRARY)
    .battlefield(THRESHOLD, WALKER)
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
}

describe('"Whenever an opponent attacks, if they attacked you and/or a planeswalker you control, draw a card."', () => {
  test('attacking me: the ability triggers and I draw a card', () => {
    const g = thresholdAttack(['me']);
    g.expect.stack([`${THRESHOLD} (ability)`]);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('attacking only my planeswalker: I draw a card', () => {
    const g = thresholdAttack(['walker']);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('attacking me and my planeswalker with two creatures: it triggers once and I draw once (CR 603.2c)', () => {
    const g = thresholdAttack(['me', 'walker']);
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('attacking only a third player: the intervening "if" is false, so nothing is put on the stack and I draw nothing (CR 603.4)', () => {
    // The scenario has two seats: a third is added to the state, a copy of seat 1 with no permanents of its own.
    const g = scenario()
      .seat(0)
      .define(threshold)
      .define(walker)
      .library(...LIBRARY)
      .battlefield(THRESHOLD, WALKER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, HAWK)
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    const with3 = {
      ...g.state,
      seats: [...g.state.seats, { ...g.state.seats[1], id: 2 }] as typeof g.state.seats,
    };
    const result = applyAction(with3, 1, {
      kind: 'declareAttackers',
      attacks: [{ attacker: g.id(BEARS), target: { kind: 'player', seat: 2 } }],
    });
    if (!result.ok) throw new Error(`declaration refused: ${JSON.stringify(result)}`);
    expect(result.state.combat?.attackers).toHaveLength(1);
    expect(result.state.stack).toHaveLength(0);
    expect(result.state.pendingTriggers).toHaveLength(0);
  });

  test('my own attack does not trigger it: "an opponent attacks"', () => {
    const g = scenario()
      .seat(0)
      .define(threshold)
      .library(...LIBRARY)
      .battlefield(THRESHOLD, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.expect.stack([]);
  });
});
