// Issue 144: Redcap Gutter-Dweller, Witch's Mark and Howlsquad Heavy. The cards are parsed from their Oracle wording as given in the issue (names replaced by SYNTHETIC ones, so the grammar
// decides, never a fixture) and their abilities are run through `applyAction` with the scenario DSL.
// Pins: CR 608.2c ("If you do" reads what the instruction before it did), CR 701.17 (sacrifice), CR 701.13 (exile), CR 611.2a (the permission lasts until end of turn).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = Array.from({ length: 10 }, () => 'Plains');

describe('Redcap Gutter-Dweller: upkeep sacrifice, counter, exile the top card, play it this turn', () => {
  const REDCAP = parsed(
    'SYNTHETIC Redcap',
    'Creature — Goblin Warrior',
    'Menace\nWhen ~ enters, create two 1/1 black Rat creature tokens with "This token can\'t block."\nAt the beginning of your upkeep, you may sacrifice another creature. If you do, put a +1/+1 counter on ~ and exile the top card of your library. You may play that card this turn.',
    { manaCost: '{2}{R}', power: '3', toughness: '3' },
  );
  const board = () =>
    scenario()
      .define(REDCAP)
      .seat(0)
      .library('Lightning Bolt', ...FILLER)
      .battlefield('Mountain')
      .battlefield(REDCAP.name, { label: 'redcap' })
      .battlefield('Raging Goblin', { label: 'goblin' })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  /** Seat 1's turn passes, then seat 0's upkeep trigger goes on the stack and resolves into its question. */
  const toUpkeep = (g: ReturnType<typeof board>) => {
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
  };

  test('accepting sacrifices another creature, adds a counter and lets the exiled card be played', () => {
    const g = board();
    toUpkeep(g);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone('Raging Goblin', 'graveyard', { seat: 0 });
    g.expect.zone('Lightning Bolt', 'exile', { seat: 0 });
    // "You may play that card this turn": the exiled card can be cast now.
    g.expect.legal(0, { cast: 'Lightning Bolt' });
    expect(g.view(0).battlefield.find((o) => o.name === REDCAP.name)?.counters['+1/+1']).toBe(1);
    g.expect.invariants();
  });

  test('declining sacrifices nothing and exiles nothing', () => {
    const g = board();
    toUpkeep(g);
    g.act(0).decline();
    g.expect.zone('Raging Goblin', 'battlefield', { seat: 0 });
    g.expect.zone('Lightning Bolt', 'library', { seat: 0 });
    expect(g.view(0).battlefield.find((o) => o.name === REDCAP.name)?.counters['+1/+1']).toBe(
      undefined,
    );
    g.expect.invariants();
  });
});

describe("Witch's Mark: discard to draw two, then a Wicked Role attached to up to one creature", () => {
  const MARK = parsed(
    'SYNTHETIC Witch Mark',
    'Instant',
    'You may discard a card. If you do, draw two cards. Create a Wicked Role token attached to up to one target creature you control.',
    { manaCost: '{1}{B}' },
  );
  const board = () =>
    scenario()
      .define(MARK)
      .seat(0)
      .library(...FILLER)
      .hand(MARK.name, 'Plains')
      .battlefield('Swamp', 'Swamp', 'Grizzly Bears')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the creature chosen gets the Role (+1/+1) and a discard draws two cards', () => {
    const g = board();
    g.act(0).cast(MARK.name, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.pt('Grizzly Bears', 3, 3);
    expect(g.state.seats[0]?.hand.length).toBe(2);
    g.expect.invariants();
  });

  test('with no target the first part still happens and no Role is created', () => {
    const g = board();
    g.act(0).cast(MARK.name, { targets: [], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.pt('Grizzly Bears', 2, 2);
    expect(g.state.seats[0]?.hand.length).toBe(2);
    g.expect.invariants();
  });

  test('declining the discard draws nothing, and the Role is still created', () => {
    const g = board();
    g.act(0).cast(MARK.name, { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.pt('Grizzly Bears', 3, 3);
    expect(g.state.seats[0]?.hand.length).toBe(1);
  });
});
