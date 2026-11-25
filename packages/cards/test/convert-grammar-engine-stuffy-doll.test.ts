// The Draconic Dissent deck (issue 167), damage triggers: the real Stuffy Doll (the golden corpus holds it) goes through the grammar with no override (NO_OVERRIDES), is validated,
// and is played through applyAction. Pins: CR 614.12a and 607.2d (the player is chosen as it enters, by its controller, among the players in the game, and the abilities that read
// "the chosen player" are linked to it), CR 120.3 (a creature that is dealt damage triggers once for each source, and "that much" is that source's damage), CR 120.2 (the damage
// the permanent deals to the chosen player and to itself), CR 702.12b (indestructible), CR 104.3 (a chosen player who has left the game is nobody), CR 400.7 (the choice is gone when
// the permanent leaves), and three seats (the choice is any player, the controller included).
import { readFileSync } from 'node:fs';
import { applyAction, type CardDefinition, validateCard } from '@commander-arena/engine';
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

const DOLL = real('Stuffy Doll');
const PINGER = 'SYNTHETIC Spark Pinger'; // {T}: 2 damage to any target
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('Stuffy Doll', () => {
  test('validates, and its three abilities are the choice, the damage trigger and the tap ability', () => {
    expect(validateCard(DOLL)).toEqual([]);
    const abilities = JSON.stringify(DOLL.faces[0]?.abilities);
    expect(abilities).toContain('"asEntersChoose"');
    expect(abilities).toContain('"enteredChosenPlayer"');
    expect(abilities).toContain('"triggerDamage"');
  });

  /** Seat 0 casts the Doll; the choice is asked of seat 0, and the Doll then sits on the battlefield. */
  const cast = (seats: 2 | 3 = 2) => {
    const b = scenario({ seats })
      .define(DOLL)
      .seat(0)
      .library(...LIBRARY)
      .hand(DOLL.name);
    b.battlefield('Plains', { count: 5 });
    const rest = b
      .seat(1)
      .library(...LIBRARY)
      .battlefield(PINGER);
    const done = seats === 3 ? rest.seat(2).library(...LIBRARY) : rest;
    const g = done.at('precombatMain', { active: 0, turn: 1 }).build();
    g.act(0).cast(DOLL.name, { pay: true });
    g.passAll();
    return g;
  };

  test('as it enters, its controller is asked to choose a player', () => {
    const g = cast();
    g.expect.pending('chooseOption', 0);
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('no choice');
    expect(d.purpose).toBe('player');
    // Any player of the game, the controller included.
    expect(d.options).toEqual(['seat:0', 'seat:1']);
    g.act(0).chooseOption('seat:1');
    g.expect.zone(DOLL.name, 'battlefield', { seat: 0 });
    g.expect.chosen(DOLL.name, { player: 1 });
  });

  test('it refuses an answer that is not a player of the game', () => {
    const g = cast();
    expect(applyAction(g.state, 0, { kind: 'chooseOption', option: 'seat:7' }).ok).toBe(false);
  });

  /** The Doll is already on the battlefield, as it was when it chose `chosen` (seat 1 by default); seat 1 holds a Spark Pinger. */
  const placed = (chosen: 0 | 1 | 2 = 1, seats: 2 | 3 = 2, active: 0 | 1 = 1) => {
    const b = scenario({ seats })
      .define(DOLL)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DOLL.name, { chosen: { player: chosen } });
    const rest = b
      .seat(1)
      .library(...LIBRARY)
      .battlefield(PINGER);
    const done = seats === 3 ? rest.seat(2).library(...LIBRARY) : rest;
    return done.at('precombatMain', { active, turn: active + 1 }).build();
  };

  test('damage to the Doll is dealt, as much, to the chosen player (indestructible: it survives)', () => {
    const g = placed(1);
    // Seat 1 pings the Doll for 2: the Doll deals 2 to the chosen player, seat 1.
    g.act(1).activate(PINGER, { targets: [{ name: DOLL.name, seat: 0 }] });
    g.passAll();
    g.passAll();
    g.expect.life(1, 38);
    g.expect.life(0, 40);
    g.expect.zone(DOLL.name, 'battlefield', { seat: 0 });
  });

  test('a player may choose themselves: the Doll then damages its controller', () => {
    const g = placed(0);
    g.act(1).activate(PINGER, { targets: [{ name: DOLL.name, seat: 0 }] });
    g.passAll();
    g.passAll();
    g.expect.life(0, 38);
    g.expect.life(1, 40);
  });

  test('"{T}: ~ deals 1 damage to itself" damages the Doll, which triggers its other ability', () => {
    const g = placed(1, 2, 0);
    g.act(0).activate(DOLL.name);
    g.passAll();
    g.passAll();
    g.expect.life(1, 39);
    g.expect.life(0, 40);
  });

  test('three seats: the third seat can be chosen, and only it takes the damage', () => {
    const g = placed(2, 3, 0);
    g.act(0).activate(DOLL.name);
    g.passAll();
    g.passAll();
    g.expect.life(2, 39);
    g.expect.life(1, 40);
    g.expect.life(0, 40);
  });

  test('a chosen player who has left the game is nobody: no damage is dealt', () => {
    const g = scenario({ seats: 3 })
      .define(DOLL)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DOLL.name, { chosen: { player: 2 } })
      .seat(1)
      .library(...LIBRARY)
      .seat(2)
      .library(...LIBRARY)
      .life(0)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).activate(DOLL.name);
    g.expect.hasLost(2);
    g.passAll();
    g.passAll();
    g.expect.life(1, 40);
    g.expect.life(0, 40);
  });
});
