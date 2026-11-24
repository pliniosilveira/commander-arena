// Will Kenrith and Rowan Kenrith (Draconic Dissent, issue 167): the REAL Oracle text (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override,
// is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 508.1d (a requirement is
// obeyed when able), CR 611.2a and 611.2c (a continuous effect from a resolving ability lasts as long as it says, its set is fixed as it resolves), CR 500.1 (the turn it resolves in is
// not counted), CR 613.1f and 613.4b (losing abilities, base power and toughness), CR 601.2f and 118.7a (a cost reduction is generic mana, never below zero), CR 114 (emblems), CR 602.2
// and 707.10 (an activated ability is copied, the copy may take new targets), CR 606 (loyalty abilities).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const will = real('Will Kenrith');
const rowan = real('Rowan Kenrith');
const WILL = will.name;
const ROWAN = rowan.name;
const BEARS = 'Grizzly Bears';
const HAWK = "Healer's Hawk"; // 1/1 flying, lifelink
const NEEDLE = 'SYNTHETIC Needle Rogue'; // {T}: 1 damage to target creature
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('both are valid cards', () => {
  test('validateCard finds nothing, and each is a planeswalker with loyalty 4 and partner with the other', () => {
    expect(validateCard(will)).toEqual([]);
    expect(validateCard(rowan)).toEqual([]);
    expect(will.faces[0]?.loyalty).toBe(4);
    expect(rowan.faces[0]?.loyalty).toBe(4);
    expect(will.faces[0]?.abilities).toContainEqual({
      kind: 'keyword',
      keyword: { kind: 'partnerWith', name: 'Rowan Kenrith' },
    });
    expect(rowan.faces[0]?.abilities).toContainEqual({
      kind: 'keyword',
      keyword: { kind: 'partnerWith', name: 'Will Kenrith' },
    });
  });
});

describe('Rowan Kenrith', () => {
  const board = () =>
    scenario()
      .define(rowan)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ROWAN, 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, HAWK, 'Mountain')
      .at('precombatMain', { active: 0 })
      .build();

  test("+2: on the target player's next turn each creature that can attack must attack", () => {
    const g = board();
    g.act(0).activate(ROWAN, { ability: 0, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.counters(ROWAN, { loyalty: 6 });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers')
      throw new Error(`expected declareAttackers, got ${d?.kind}`);
    expect([...d.mustAttack].sort()).toEqual([g.id(BEARS), g.id(HAWK)].sort());
    // Not attacking, or leaving one home, is refused (CR 508.1d); attacking the player with both is accepted.
    expect(g.act(1).try.declareAttackers([]).ok).toBe(false);
    expect(g.act(1).try.declareAttackers([{ attacker: BEARS }]).ok).toBe(false);
    expect(g.act(1).try.declareAttackers([{ attacker: BEARS }, { attacker: HAWK }]).ok).toBe(true);
    g.expect.invariants();
  });

  test('+2: a creature that cannot attack (a defender) is not required to, and the requirement ends with that turn', () => {
    const g = scenario()
      .define(rowan)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ROWAN, 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Wall of Stone')
      .battlefield(HAWK)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(ROWAN, { ability: 0, targets: [{ player: 1 }] });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    const d = g.state.pending;
    if (d?.kind !== 'declareAttackers')
      throw new Error(`expected declareAttackers, got ${d?.kind}`);
    expect(d.mustAttack).toEqual([g.id(HAWK)]);
    // The turn after it is free again.
    g.act(1).attack([HAWK]);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('declareAttackers', { attack: false });
    expect(g.act(1).try.declareAttackers([]).ok).toBe(true);
  });

  test('-2: 3 damage to each tapped creature the target player controls, and only those', () => {
    const g = scenario()
      .define(rowan)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ROWAN)
      .battlefield('Wall of Stone', { tapped: true })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { tapped: true })
      .battlefield('Giant Spider', { tapped: true })
      .battlefield(HAWK)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(ROWAN, { ability: 1, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.counters(ROWAN, { loyalty: 2 });
    // 3 damage kills a tapped 2/2, leaves a tapped 2/4 alive with the damage on it, and misses the untapped creature.
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone('Giant Spider', 'battlefield', { seat: 1 });
    g.expect.damage('Giant Spider', 3);
    g.expect.damage(HAWK, 0);
    // My own tapped creature is not one the target player controls.
    g.expect.damage('Wall of Stone', 0);
    g.expect.invariants();
  });

  test('-8: the target player gets an emblem that copies the abilities they activate, and may take new targets', () => {
    const g = scenario()
      .define(rowan)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ROWAN, { counters: { loyalty: 8 } })
      .battlefield(NEEDLE)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(HAWK, 'Typhoid Rats')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(ROWAN, { ability: 2, targets: [{ player: 0 }] });
    g.passAll();
    g.expect.zone(ROWAN, 'graveyard');
    // Activating a non-mana ability puts a copy on the stack as well (CR 707.10), which may take another target.
    g.act(0).activate(NEEDLE, { targets: [HAWK] });
    g.pass();
    g.pass();
    g.act(0).chooseTargets('Typhoid Rats');
    g.passAll();
    g.expect.zone(HAWK, 'graveyard', { seat: 1 });
    g.expect.zone('Typhoid Rats', 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('-8: the abilities of an opponent are not copied by my emblem, and a mana ability is not', () => {
    const g = scenario()
      .define(rowan)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(ROWAN, { counters: { loyalty: 8 } })
      .battlefield('Forest')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, NEEDLE)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(ROWAN, { ability: 2, targets: [{ player: 0 }] });
    g.passAll();
    // A land's mana ability never uses the stack, so nothing is copied.
    g.act(0).tapForMana('Forest');
    g.expect.stack([]);
    g.expect.pool(0, { G: 1 });
    // The opponent's ability (they have no emblem) is not copied by mine.
    g.pass();
    g.pass();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(1).activate(NEEDLE, { targets: [BEARS] });
    g.expect.stack([`${NEEDLE} (ability)`]);
  });
});

describe('Will Kenrith', () => {
  const board = (hand: readonly string[] = [], mine: readonly string[] = []) =>
    scenario()
      .define(will)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WILL, ...mine)
      .hand(...hand)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, 'Serra Angel', 'Giant Spider')
      .at('precombatMain', { active: 0 })
      .build();

  test('+2: up to two target creatures are 0/3 and lose their abilities until my next turn', () => {
    const g = board();
    g.act(0).activate(WILL, { ability: 0, targets: [BEARS, 'Serra Angel'] });
    g.passAll();
    g.expect.counters(WILL, { loyalty: 6 });
    g.expect.pt(BEARS, 0, 3);
    g.expect.pt('Serra Angel', 0, 3);
    g.expect.derived('Serra Angel', { keywords: [] });
    // The third creature is not a target.
    g.expect.pt('Giant Spider', 2, 4);
    g.expect.derived('Giant Spider', { keywords: ['reach'] });
    // Still in effect through the opponent's turn (CR 500.1: the turn it resolved in is not counted)...
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt(BEARS, 0, 3);
    g.expect.derived('Serra Angel', { keywords: [] });
    // ...and over as my next turn begins.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt('Serra Angel', 4, 4);
    g.expect.derived('Serra Angel', { keywords: ['flying', 'vigilance'] });
    g.expect.invariants();
  });

  test('+2: no target at all is legal (up to two), and nothing changes', () => {
    const g = board();
    g.act(0).activate(WILL, { ability: 0, targets: [] });
    g.passAll();
    g.expect.counters(WILL, { loyalty: 6 });
    g.expect.pt(BEARS, 2, 2);
    g.expect.pt('Serra Angel', 4, 4);
  });

  test('-2: draws two cards, and instants, sorceries and planeswalkers cost {2} less until my next turn', () => {
    const g = board(['Divination'], ['Island']);
    // {2}{U} with one land is out of reach before the ability.
    expect(() => g.act(0).cast('Divination', { pay: true })).toThrow(/engine rejected/);
    g.act(0).activate(WILL, { ability: 1, targets: [{ player: 0 }] });
    g.passAll();
    g.expect.counters(WILL, { loyalty: 2 });
    g.expect.handSize(0, 3);
    // Now {U} is enough: the reduction is of generic mana (CR 118.7a, 601.2f).
    g.act(0).cast('Divination', { pay: true });
    g.passAll();
    g.expect.handSize(0, 4);
    g.expect.invariants();
  });

  test('-2: it names the target player, not the controller, and does not reach a creature spell', () => {
    const g = scenario()
      .define(will)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WILL, 'Island')
      .hand('Giant Spider')
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Island')
      .hand('Divination')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(WILL, { ability: 1, targets: [{ player: 1 }] });
    g.passAll();
    // I drew nothing: the opponent drew two, and their discount is theirs.
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 3);
    expect(() => g.act(0).cast('Giant Spider', { pay: true })).toThrow(/engine rejected/);
  });

  test('-2: the reduction ends as my next turn begins', () => {
    const g = board(['Divination'], ['Island']);
    g.act(0).activate(WILL, { ability: 1, targets: [{ player: 0 }] });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(() => g.act(0).cast('Divination', { pay: true })).toThrow(/engine rejected/);
  });
});
