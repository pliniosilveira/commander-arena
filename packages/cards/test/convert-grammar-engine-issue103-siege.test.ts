// Parsed text is only worth something if the engine runs it as written. This test imports a SYNTHETIC card through the grammar (never through a fixture) with the
// real lines of Frontier Siege (golden corpus, acceptance card of issue 103): "At the beginning of each of your main phases, add {G}{G}." (CR 505.1, 603.2b, 106.4)
// and "Whenever a creature you control with flying enters, you may have it fight target creature you don't control." (CR 701.14), each behind the choice made as the
// permanent enters (CR 614.12, 607.2d). The name starts with "SYNTHETIC" and no real card's definition is claimed.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const SIEGE = parsed(
  'SYNTHETIC Parsed Frontier Siege',
  'Enchantment',
  "As this enchantment enters, choose Khans or Dragons.\n• Khans — At the beginning of each of your main phases, add {G}{G}.\n• Dragons — Whenever a creature you control with flying enters, you may have it fight target creature you don't control.",
  { manaCost: '{3}{G}', colors: ['G'] },
);
const NAME = SIEGE.name;
const FILLER = Array.from({ length: 8 }, () => 'Forest');

describe('Khans: "At the beginning of each of your main phases, add {G}{G}."', () => {
  test('the trigger names both main phases of my turns', () => {
    const triggers = (SIEGE.faces[0]?.abilities ?? []).flatMap((a) =>
      a.kind === 'triggered' ? [a.trigger] : [],
    );
    expect(triggers).toContainEqual({
      kind: 'step',
      step: 'main1',
      alsoStep: 'main2',
      whose: 'you',
    });
  });

  test('{G}{G} is added at the start of each of my main phases and not on the opponent turn', () => {
    const g = scenario()
      .seat(0)
      .define(SIEGE)
      .battlefield(NAME, { chosen: { option: 'Khans' } })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 0 });
    g.expect.stack([`${NAME} (ability)`]);
    g.passAll();
    g.expect.pool(0, { G: 2 });
    g.advanceTo('postcombatMain');
    g.expect.stack([`${NAME} (ability)`]);
    g.passAll();
    g.expect.pool(0, { G: 2 });
    // The opponent's main phases trigger nothing.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.step('precombatMain', { active: 1 });
    g.expect.stack([]);
  });

  test('with Dragons chosen the main phase adds nothing', () => {
    const g = scenario()
      .seat(0)
      .define(SIEGE)
      .battlefield(NAME, { chosen: { option: 'Dragons' } })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 1, turn: 2 })
      .build();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.stack([]);
  });
});

describe('Dragons: "Whenever a creature you control with flying enters, you may have it fight target creature you don\'t control."', () => {
  const game = (land: 'Plains' | 'Forest') =>
    scenario()
      .seat(0)
      .define(SIEGE)
      .battlefield(NAME, { chosen: { option: 'Dragons' } })
      .battlefield(land, { count: 5 })
      .hand('Serra Angel', 'Grizzly Bears')
      .library(...FILLER)
      .seat(1)
      .battlefield('Raging Goblin')
      .library(...FILLER)
      .build();

  test('a flying creature entering triggers it, and accepting makes it fight the target creature', () => {
    const g = game('Plains');
    g.act(0).cast('Serra Angel', { pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.passAll();
    // Serra Angel (4/4) and Raging Goblin (1/1) fight: the Goblin dies, the Angel takes 1 (CR 701.14a).
    g.expect.zone('Raging Goblin', 'graveyard', { seat: 1 });
    g.expect.damage('Serra Angel', 1);
    g.expect.invariants();
  });

  test('"you may": declining leaves both creatures alone', () => {
    const g = game('Plains');
    g.act(0).cast('Serra Angel', { pay: true });
    g.passAll();
    g.act(0).decline();
    g.passAll();
    g.expect.zone('Raging Goblin', 'battlefield', { seat: 1 });
    g.expect.damage('Serra Angel', 0);
  });

  test('a creature without flying does not trigger it', () => {
    const g = game('Forest');
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.zone('Raging Goblin', 'battlefield', { seat: 1 });
  });
});
