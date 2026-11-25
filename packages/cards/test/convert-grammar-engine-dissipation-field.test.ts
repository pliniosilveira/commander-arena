// The Draconic Dissent deck (issue 167), damage triggers: the real Dissipation Field (the golden corpus holds it) goes through the grammar with no override (NO_OVERRIDES), is
// validated, and is played through applyAction. Pins: CR 120.2 and 603.2c (damage of any kind from a permanent, once for each source), CR 603.2g (damage entirely prevented triggers
// nothing), CR 110.1 (a permanent: a spell that deals damage is not one), CR 400.7 and 113.7a (a source that has left is a new object, so "return it" finds nothing), CR 108.3
// (a card goes to its owner's hand, not its controller's), and three seats (the damaged player is "you", the controller of the enchantment, whoever deals the damage).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((candidate) => candidate.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FIELD = real('Dissipation Field');
const BEARS = 'Grizzly Bears';
const PINGER = 'SYNTHETIC Spark Pinger'; // {T}: 2 damage to any target
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('Dissipation Field: "Whenever a permanent deals damage to you, return it to its owner\'s hand."', () => {
  test('validates, and the lowering is damage of any kind to you from a permanent', () => {
    expect(validateCard(FIELD)).toEqual([]);
    expect(FIELD.faces[0]?.abilities).toContainEqual(
      expect.objectContaining({
        kind: 'triggered',
        trigger: expect.objectContaining({ kind: 'dealsDamage', to: 'you' }),
      }),
    );
  });

  /** Seat 0 controls the Field; seat 1 attacks with its Bears (or pings with its Pinger). */
  const board = () =>
    scenario()
      .define(FIELD)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(FIELD.name)
      .seat(1)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield(BEARS)
      .battlefield(PINGER)
      .battlefield('Mountain', { count: 3 })
      .at('precombatMain', { active: 1, turn: 2 })
      .build();

  test("combat damage to you returns the creature to its owner's hand", () => {
    const g = board();
    g.advanceTo('declareAttackers');
    g.act(1).attack([{ name: BEARS, seat: 1 }]);
    g.advanceTo('combatDamage');
    g.passAll();
    g.expect.life(0, 38);
    g.expect.zone(BEARS, 'hand', { seat: 1 });
    g.expect.noObject(BEARS, { zone: 'battlefield' });
  });

  test("damage that is not combat damage counts (a permanent's ability)", () => {
    const g = board();
    g.act(1).activate(PINGER, { targets: [{ player: 0 }] });
    g.passAll();
    g.expect.life(0, 38);
    g.expect.zone(PINGER, 'hand', { seat: 1 });
  });

  test('damage to a creature, or to another player, does not trigger it', () => {
    const g = board();
    g.act(1).activate(PINGER, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 38);
    g.expect.zone(PINGER, 'battlefield', { seat: 1 });
  });

  test('a spell is not a permanent: Lightning Bolt to you triggers nothing (CR 110.1)', () => {
    const g = board();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 37);
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.stack([]);
  });

  test('a source that left the battlefield as it dealt the damage is not returned (CR 400.7)', () => {
    const g = board();
    g.act(1).activate(PINGER, { targets: [{ player: 0 }] });
    g.act(1).cast(BOLT, { targets: [{ name: PINGER, seat: 1 }], pay: true });
    g.passAll();
    g.expect.life(0, 38);
    g.expect.zone(PINGER, 'graveyard', { seat: 1 });
    g.expect.noObject(PINGER, { zone: 'hand' });
  });
});

describe('Dissipation Field in a game of three seats', () => {
  const board = () =>
    scenario({ seats: 3 })
      .define(FIELD)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(FIELD.name)
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .battlefield(PINGER)
      .at('precombatMain', { active: 2, turn: 3 })
      .build();

  test("damage to its controller from the third seat returns the permanent to that seat's hand", () => {
    const g = board();
    g.act(2).activate(PINGER, { targets: [{ player: 0 }] });
    g.passAll();
    g.expect.life(0, 38);
    g.expect.zone(PINGER, 'hand', { seat: 2 });
  });

  test('damage to another opponent of the third seat does not trigger it', () => {
    const g = board();
    g.act(2).activate(PINGER, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 38);
    g.expect.zone(PINGER, 'battlefield', { seat: 2 });
  });
});
