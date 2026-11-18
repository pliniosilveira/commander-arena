// The "First Flight" starter commander decks, creatures attacking "you or a planeswalker you control": the Oracle text of Soul Snare, Vow of Duty and Ever-Watching Threshold goes
// through the grammar as a card with no override (NO_OVERRIDES) and is played through applyAction, so the nodes the parser writes are what the engine runs. The golden corpus does not
// hold these cards yet: the names and lines are the real ones, the other fields (mana costs) are the printed ones; no other card data is claimed. The board is the engine's own
// fixtures (Grizzly Bears, Healer's Hawk, Llanowar Elves, the basic lands and a SYNTHETIC vanilla planeswalker).
// Pins: CR 508.1b (an attack at a planeswalker is not an attack at its controller), CR 506.3, CR 508.1a and 508.1c (an attack restriction), CR 115.1 and 608.2b (targets),
// CR 603.2c and 603.4 (a batch of attackers triggers once; the intervening "if" is read from the declaration).
import { applyAction } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk";
const ELVES = 'Llanowar Elves';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const SNARE = parsed(
  'Soul Snare',
  'Enchantment',
  "{W}, Sacrifice ~: Exile target creature that's attacking you or a planeswalker you control.",
  { manaCost: '{W}', colors: ['W'] },
);
const DUTY = parsed(
  'Vow of Duty',
  'Enchantment — Aura',
  "Enchant creature\nEnchanted creature gets +2/+2, has vigilance, and can't attack you or planeswalkers you control.",
  { manaCost: '{2}{W}', colors: ['W'] },
);
const THRESHOLD = parsed(
  'Ever-Watching Threshold',
  'Enchantment',
  'Whenever an opponent attacks, if they attacked you and/or a planeswalker you control, draw a card.',
  { manaCost: '{2}{U}', colors: ['U'] },
);

describe('Soul Snare: "Exile target creature that\'s attacking you or a planeswalker you control." (CR 508.1b, 506.3)', () => {
  /** Seat 1 attacks me with the Bears, my planeswalker with the Hawk, and keeps the Elves home. */
  const board = () => {
    const g = scenario()
      .define(SNARE)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SNARE.name, WALKER, 'Plains')
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
  };

  test('the lowering names the attacker of you or of your planeswalkers', () => {
    expect(SNARE.faces[0]?.abilities).toMatchObject([
      { kind: 'activated', targets: [{ what: { filter: { attackingYou: 'orPlaneswalkers' } } }] },
    ]);
  });

  test('a creature attacking me is exiled', () => {
    const g = board();
    g.act(0).activate(SNARE.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.zone(SNARE.name, 'graveyard', { seat: 0 });
  });

  test('a creature attacking my planeswalker is exiled', () => {
    const g = board();
    g.act(0).activate(SNARE.name, { targets: [HAWK], pay: true });
    g.passAll();
    g.expect.zone(HAWK, 'exile', { seat: 1 });
  });

  test('a creature that is not attacking is not a legal target', () => {
    const g = board();
    expect(() => g.act(0).activate(SNARE.name, { targets: [ELVES], pay: true })).toThrow();
  });

  test("my own creature attacking an opponent's planeswalker is not a legal target", () => {
    const g = scenario()
      .define(SNARE)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(SNARE.name, BEARS, 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(WALKER)
      .at('precombatMain')
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: BEARS, target: WALKER }]);
    expect(() => g.act(0).activate(SNARE.name, { targets: [BEARS], pay: true })).toThrow();
  });
});

describe('Vow of Duty: "Enchanted creature gets +2/+2, has vigilance, and can\'t attack you or planeswalkers you control." (CR 508.1a, 506.3)', () => {
  /** Seat 1 controls the Aura on seat 0's Bears; seat 0 has the Elves too, and seat 1 a planeswalker. It is seat 0's turn. */
  const board = () =>
    scenario()
      .define(DUTY)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, ELVES)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(WALKER)
      .battlefield(DUTY.name, { attachedTo: BEARS })
      .at('precombatMain', { active: 0 })
      .build();

  test('the enchanted creature gets +2/+2 and vigilance', () => {
    const g = board();
    g.expect.pt(BEARS, 4, 4);
    g.expect.derived(BEARS, { keywords: ['vigilance'] });
  });

  test("it cannot attack the Aura's controller; another creature can", () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.act(0).try.declareAttackers([{ attacker: BEARS, target: { player: 1 } }]).ok).toBe(
      false,
    );
    expect(g.act(0).try.declareAttackers([{ attacker: ELVES, target: { player: 1 } }]).ok).toBe(
      true,
    );
  });

  test("it cannot attack the Aura's controller's planeswalker; another creature can", () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.act(0).try.declareAttackers([{ attacker: BEARS, target: WALKER }]).ok).toBe(false);
    expect(g.act(0).try.declareAttackers([{ attacker: ELVES, target: WALKER }]).ok).toBe(true);
  });
});

describe('Ever-Watching Threshold: "Whenever an opponent attacks, if they attacked you and/or a planeswalker you control, draw a card." (CR 603.2c, 603.4)', () => {
  const board = () =>
    scenario()
      .define(THRESHOLD)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(THRESHOLD.name, WALKER)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, HAWK)
      .at('precombatMain', { active: 1 })
      .build();

  const attack = (targets: readonly ('me' | 'walker')[]) => {
    const g = board();
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

  test('the lowering is the batch trigger of an opponent with the intervening "if"', () => {
    expect(THRESHOLD.faces[0]?.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'attackBatch', who: 'opponent', atLeast: 1 },
        interveningIf: { kind: 'attackersAtYouAtLeast', count: 1 },
      },
    ]);
  });

  test('an attack on me draws a card', () => {
    const g = attack(['me']);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('an attack on only my planeswalker draws a card', () => {
    const g = attack(['walker']);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('two creatures at me and at my planeswalker: it triggers once and draws once', () => {
    const g = attack(['me', 'walker']);
    expect(g.state.stack).toHaveLength(1);
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('an attack on only a third player triggers nothing (CR 603.4)', () => {
    // The scenario has two seats: a third is added to the state, a copy of seat 1 with no permanents of its own.
    const g = board();
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
});
