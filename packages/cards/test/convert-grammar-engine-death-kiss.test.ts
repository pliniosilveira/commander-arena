// Death Kiss (Draconic Dissent precon, issue 167): the REAL Oracle text of the golden corpus goes through the grammar as a card with no override, and is played through applyAction.
// "Whenever a creature an opponent controls attacks one of your opponents, double its power until end of turn." reads the defending player of each attacker (CR 508.5: the player
// it attacks, the controller of the planeswalker it attacks or the protector of the battle it attacks), "{X}{X}{R}: Monstrosity X." is CR 701.37a with an X announced once and paid
// twice (CR 107.3a), and "When this creature becomes monstrous, goad up to X target creatures your opponents control." reads the X of the monstrosity (CR 701.37c, 107.3c, 603.3d).
// Pins: CR 508.5, 506.2, 701.37a-c, 107.3a, 603.3d, 701.15 (Goad), 701.10 (Double), 613.4 (a power change that is not a set), CR 400.7.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const kiss = real('Death Kiss');
const DK = kiss.name;
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');
const MOUNTAINS = Array.from({ length: 7 }, () => 'Mountain');

test('Death Kiss is a valid card', () => {
  expect(validateCard(kiss)).toEqual([]);
});

describe('the attack trigger: a creature an opponent controls attacks one of your opponents', () => {
  /** Seat 0 has Death Kiss; seat 1 (active) has the Bears, the Spider and the Walker; seat 2 has the Walker. */
  const board = () =>
    scenario({ seats: 3 })
      .define(kiss)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DK)
      .battlefield(SPIDER, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(SPIDER, { label: 'spider' })
      .seat(2)
      .library(...LIBRARY)
      .battlefield(WALKER, { label: 'walker' })
      .battlefield(BEARS, { label: 'other' })
      .at('precombatMain', { active: 1, turn: 2 })
      .build();

  test('an opponent attacks another opponent: its power is doubled until end of turn (2 players away from you)', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack('bears', { player: 2 });
    g.passAll();
    g.expect.pt('bears', 4, 2);
    g.expect.pt('spider', 2, 4);
    g.advanceTo('end');
    g.expect.pt('bears', 4, 2);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('bears', 2, 2);
    g.expect.invariants();
  });

  test('each attacker triggers its own ability, and only the one that attacks one of your opponents', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).declareAttackers([
      { attacker: 'bears', target: { player: 2 } },
      { attacker: 'spider', target: { player: 0 } },
    ]);
    g.passAll();
    g.expect.pt('bears', 4, 2);
    g.expect.pt('spider', 2, 4);
    g.expect.invariants();
  });

  test('an opponent attacks you: no trigger (you are not one of your opponents)', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack('bears', { player: 0 });
    g.passAll();
    g.expect.pt('bears', 2, 2);
    g.expect.invariants();
  });

  // CR 508.1b, 508.6: "attacks one of your opponents" is read as attacking a player, the repository's reading of the wording (the trigger rule `trigger.attacks-you`, shared with the
  // other cards that say it); an attack on a planeswalker is not an attack on the player. The Scryfall rulings of Death Kiss were not available to check it.
  test('an opponent attacks a planeswalker an opponent of yours controls: it does not trigger (it attacks a permanent, not the player)', () => {
    const g = board();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack('bears', 'walker');
    g.passAll();
    g.expect.pt('bears', 2, 2);
    g.expect.invariants();
  });

  test('your own creature attacking an opponent does not trigger it (it is not a creature an opponent controls)', () => {
    const g = scenario({ seats: 3 })
      .define(kiss)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DK)
      .battlefield(SPIDER, { label: 'mine' })
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack('mine', { player: 1 });
    g.passAll();
    g.expect.pt('mine', 2, 4);
    g.expect.invariants();
  });

  test('with two players, whoever attacks you does not trigger it', () => {
    const g = scenario()
      .define(kiss)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DK)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .at('precombatMain', { active: 1 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack('bears', { player: 0 });
    g.passAll();
    g.expect.pt('bears', 2, 2);
    g.expect.invariants();
  });

  test('each Death Kiss reads its own opponents: the copy of seat 2 sees an attack on seat 2 as an attack on itself and does not trigger, so the power is doubled once', () => {
    const g = scenario({ seats: 3 })
      .define(kiss)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DK)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .seat(2)
      .library(...LIBRARY)
      .battlefield(DK)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(1).attack('bears', { player: 2 });
    g.passAll();
    g.expect.pt('bears', 4, 2);
    g.expect.invariants();
  });
});

describe('{X}{X}{R}: Monstrosity X, and the goad of the monstrous trigger', () => {
  const board = (seats: 2 | 3 = 3) => {
    const b = scenario({ seats }).define(kiss);
    b.seat(0)
      .library(...LIBRARY)
      .battlefield(DK, { label: 'kiss' })
      .battlefield(...MOUNTAINS);
    b.seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'b1' })
      .battlefield(SPIDER, { label: 's1' });
    if (seats === 3) {
      b.seat(2)
        .library(...LIBRARY)
        .battlefield(BEARS, { label: 'b2' });
    }
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };

  const goadedBy = (g: ReturnType<typeof board>, label: string): number[] =>
    g.state.continuousEffects.flatMap((e) =>
      e.change.kind === 'goaded' && e.objects.includes(g.id(label)) ? [e.change.by] : [],
    );

  test('X = 2: five mana (X announced once, paid twice), two counters, monstrous with X = 2, and the trigger goads the two targets', () => {
    const g = board();
    g.act(0).activate(DK, { x: 2, pay: true });
    g.passAll();
    g.expect.counters('kiss', { '+1/+1': 2 });
    expect(g.object('kiss').monstrous).toBe(true);
    expect(g.object('kiss').monstrousX).toBe(2);
    g.expect.pt('kiss', 7, 7);
    const d = g.state.pending;
    if (d?.kind !== 'targets')
      throw new Error(`expected the targets of the trigger, got ${d?.kind}`);
    expect(d.specs[0]?.max).toBe(2);
    expect(d.specs[0]?.min).toBe(0);
    // Only creatures the opponents control: not the Death Kiss itself.
    expect(d.specs[0]?.legal.length).toBe(3);
    g.act(0).chooseTargets('b1', 'b2');
    g.passAll();
    expect(goadedBy(g, 'b1')).toEqual([0]);
    expect(goadedBy(g, 'b2')).toEqual([0]);
    expect(goadedBy(g, 's1')).toEqual([]);
    g.expect.invariants();
  });

  test('X = 1: up to one target (a second one is not allowed)', () => {
    const g = board();
    g.act(0).activate(DK, { x: 1, pay: true });
    g.passAll();
    g.expect.counters('kiss', { '+1/+1': 1 });
    expect(g.object('kiss').monstrousX).toBe(1);
    const d = g.state.pending;
    if (d?.kind !== 'targets')
      throw new Error(`expected the targets of the trigger, got ${d?.kind}`);
    expect(d.specs[0]?.max).toBe(1);
    expect(() => g.act(0).chooseTargets('b1', 'b2')).toThrow();
    g.act(0).chooseTargets('s1');
    g.passAll();
    expect(goadedBy(g, 's1')).toEqual([0]);
    expect(goadedBy(g, 'b1')).toEqual([]);
    g.expect.invariants();
  });

  test('X = 0: it becomes monstrous with no counters, and the trigger has no target to goad, so it is not put on the stack (CR 603.3d)', () => {
    const g = board();
    g.act(0).activate(DK, { x: 0, pay: true });
    g.passAll();
    g.expect.counters('kiss', {});
    expect(g.object('kiss').monstrous).toBe(true);
    expect(g.object('kiss').monstrousX).toBe(0);
    expect(g.state.stack.length).toBe(0);
    expect(g.state.pending?.kind).toBe('priority');
    expect(goadedBy(g, 'b1')).toEqual([]);
    g.expect.invariants();
  });

  test('a second monstrosity does nothing (CR 701.37a: it is monstrous already): no counters, no trigger, the first X stays', () => {
    const g = board();
    g.act(0).activate(DK, { x: 1, pay: true });
    g.passAll();
    g.act(0).chooseTargets('b1');
    g.passAll();
    g.act(0).activate(DK, { x: 1, pay: true });
    g.passAll();
    g.expect.counters('kiss', { '+1/+1': 1 });
    expect(g.object('kiss').monstrousX).toBe(1);
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.stack.length).toBe(0);
    g.expect.invariants();
  });

  test("with two players the trigger can target the only opponent's creatures", () => {
    const g = board(2);
    g.act(0).activate(DK, { x: 2, pay: true });
    g.passAll();
    g.act(0).chooseTargets('b1', 's1');
    g.passAll();
    expect(goadedBy(g, 'b1')).toEqual([0]);
    expect(goadedBy(g, 's1')).toEqual([0]);
    g.expect.invariants();
  });
});

describe('the X of the monstrosity is forgotten when the permanent leaves the battlefield (CR 400.7)', () => {
  test('a Death Kiss that died keeps no monstrous designation or X anywhere on the battlefield', () => {
    const g = scenario()
      .define(kiss)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DK, { label: 'kiss' })
      .battlefield(...MOUNTAINS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Swamp', 'Swamp', 'Swamp', BEARS)
      .hand('Murder')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(DK, { x: 1, pay: true });
    g.passAll();
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    expect(g.object('kiss').monstrousX).toBe(1);
    g.act(0).pass();
    g.act(1).cast('Murder', { targets: ['kiss'], pay: true });
    g.passAll();
    g.expect.zone(DK, 'graveyard', { seat: 0 });
    const dead = Object.values(g.state.objects).filter(
      (o) => o.zone === 'graveyard' && o.owner === 0,
    );
    expect(dead).toHaveLength(1);
    expect(dead[0]?.monstrous).toBeUndefined();
    expect(dead[0]?.monstrousX).toBeUndefined();
  });
});
