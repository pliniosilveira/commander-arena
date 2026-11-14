// Parsed text is only worth something if the engine runs it as written (stage P42). These tests import SYNTHETIC cards through the grammar (never through a
// fixture), define them in an engine scenario and play them through applyAction: the Korvold deck's control-change slice of D-189 and D-190 (ENGINE_VERSION
// 43). Every card name starts with "SYNTHETIC"; the wording of the Nabber is that of the real card (the owner's request file of 2026-10-29), the powers,
// toughnesses and costs the file does not give are invented, and the other lines are invented wording. No real card's text is claimed.
import { validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const SOL = 'Sol Ring';
const FILLER = Array.from({ length: 12 }, () => 'Plains');

const controlOf = (g: ScenarioGame, name: string): number => {
  const found = g.view(0).battlefield.find((o) => o.name === name);
  if (found === undefined) throw new Error(`${name} is not on the battlefield`);
  return found.controller;
};

describe('"Whenever an opponent taps an artifact for mana, gain control of that artifact until the end of your next turn."', () => {
  const nabber = parsed(
    'SYNTHETIC Parsed Nabber',
    'Creature — Goblin Rogue',
    'Whenever an opponent taps an artifact for mana, gain control of that artifact until the end of your next turn.',
    { manaCost: '{2}{R}', colors: ['R'], power: '3', toughness: '2' },
  );
  const play = () =>
    scenario()
      .seat(0)
      .define(nabber)
      .battlefield(nabber.name)
      .library(...FILLER)
      .seat(1)
      .battlefield(SOL)
      .library(...FILLER)
      .at('precombatMain', { active: 1 })
      .build();

  test('is valid', () => {
    expect(validateCard(nabber)).toEqual([]);
  });

  test('the opponent taps Sol Ring: its controller changes until the end of the Nabber controller next turn, and the Sol Ring is theirs to tap', () => {
    const g = play();
    g.act(1).tapForMana(SOL);
    g.passAll();
    expect(controlOf(g, SOL)).toBe(0);
    g.advanceTo('upkeep', { turn: 4 });
    g.expect.legal(0, { tap: SOL });
    g.advanceTo('end', { turn: 4 });
    expect(controlOf(g, SOL)).toBe(0);
    g.advanceTo('upkeep', { turn: 5 });
    expect(controlOf(g, SOL)).toBe(1);
    g.expect.invariants();
  });
});

describe('"Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn."', () => {
  const snatch = parsed(
    'SYNTHETIC Parsed Snatch',
    'Sorcery',
    'Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn.',
    { manaCost: '{2}{R}', colors: ['R'] },
  );

  test('is valid', () => {
    expect(validateCard(snatch)).toEqual([]);
  });

  test('the creature is the caster until end of turn, untapped and able to attack, and goes back with the turn', () => {
    const g = scenario()
      .seat(0)
      .define(snatch)
      .hand(snatch.name)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS, { tapped: true })
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(snatch.name, { targets: [{ name: BEARS, seat: 1 }], pay: true });
    g.passAll();
    expect(controlOf(g, BEARS)).toBe(0);
    g.expect.tapped({ name: BEARS, seat: 0 }, false);
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack({ name: BEARS, seat: 0 }, true);
    g.act(0).attack([{ name: BEARS, seat: 0 }]);
    g.advanceTo('postcombatMain');
    g.expect.life(1, 38);
    g.advanceTo('upkeep', { turn: 4 });
    expect(controlOf(g, BEARS)).toBe(1);
  });
});

describe('"When ~ enters, gain control of target creature for as long as you control ~."', () => {
  const leash = parsed(
    'SYNTHETIC Parsed Leash',
    'Creature — Illusion',
    'When ~ enters, gain control of target creature for as long as you control ~.',
    { manaCost: '{3}{U}', colors: ['U'], power: '2', toughness: '2' },
  );

  test('is valid', () => {
    expect(validateCard(leash)).toEqual([]);
  });

  test('the creature is the controller while the Leash is, and goes back when it dies', () => {
    const g = scenario()
      .seat(0)
      .define(leash)
      .hand(leash.name, 'Lightning Bolt')
      .battlefield('Island', 'Island', 'Island', 'Island', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .battlefield(BEARS)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(leash.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ name: BEARS, seat: 1 });
    g.passAll();
    expect(controlOf(g, BEARS)).toBe(0);
    g.act(0).cast('Lightning Bolt', { targets: [{ name: leash.name, seat: 0 }], pay: true });
    g.passAll();
    expect(controlOf(g, BEARS)).toBe(1);
  });
});
