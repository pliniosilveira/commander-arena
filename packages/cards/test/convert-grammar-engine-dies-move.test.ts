// Parsed text is worth something only if the engine runs it as written. "When this creature dies, put it on the bottom of its owner's library" and
// "When this creature dies, return it to its owner's hand at the beginning of the next end step": the card a creature became (CR 400.7, 603.10a) is
// moved by the dies ability itself, or by a delayed triggered ability the dies ability creates (CR 603.7, 603.7c). Every card name starts with
// "SYNTHETIC"; the wording is that of a trigger of the card itself dying. No real card's text is claimed.
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

// The Adventure half of the real card this wording comes from is plain text the grammar already reads (parsed() requires full support).
parsed(
  'SYNTHETIC Parsed Swift',
  'Instant',
  'Destroy target creature or planeswalker. You lose 2 life.',
  {
    manaCost: '{B}{B}',
    colors: ['B'],
  },
);

const FILLER = ['Island', 'Forest', 'Plains', 'Swamp'] as const;

const bottom = parsed(
  'SYNTHETIC Parsed Bottomer',
  'Creature — Skeleton',
  "When ~ dies, put it on the bottom of its owner's library.",
  { manaCost: '{1}{B}', power: '2', toughness: '2', colors: ['B'] },
);
const top = parsed(
  'SYNTHETIC Parsed Topper',
  'Creature — Skeleton',
  "When ~ dies, put it on top of its owner's library.",
  { manaCost: '{1}{B}', power: '2', toughness: '2', colors: ['B'] },
);
const returner = parsed(
  'SYNTHETIC Parsed Returner',
  'Creature — Skeleton',
  "When ~ dies, return it to its owner's hand at the beginning of the next end step.",
  { manaCost: '{1}{B}', power: '2', toughness: '2', colors: ['B'] },
);

const libraryNames = (g: ScenarioGame, seat: 0 | 1) =>
  g.state.seats[seat]?.library.map((id) => {
    const o = g.state.objects[id];
    const c = o?.card == null ? undefined : g.state.cards[o.card];
    return c === undefined ? '?' : (g.state.definitions[c.definition]?.name ?? '?');
  });

describe('"put it on the bottom / on top of its owner\'s library" in a trigger of the creature dying (CR 401.3, 400.7, 603.10a)', () => {
  test('on the bottom of its owner’s library', () => {
    const g = scenario()
      .define(bottom)
      .seat(0)
      .life(20)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield(bottom.name)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast('Murder', { targets: [bottom.name], pay: true });
    g.passAll();
    expect(libraryNames(g, 1)).toEqual([...FILLER, bottom.name]); // its owner's (seat 1), not the killer's
    expect(libraryNames(g, 0)).toEqual([...FILLER]);
    g.expect.noObject(bottom.name, { zone: 'graveyard' });
    g.expect.invariants();
  });

  test('on top of its owner’s library', () => {
    const g = scenario()
      .define(top)
      .seat(0)
      .life(20)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield(top.name)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast('Murder', { targets: [top.name], pay: true });
    g.passAll();
    expect(libraryNames(g, 1)).toEqual([top.name, ...FILLER]);
    g.expect.invariants();
  });
});

describe('"return it to its owner\'s hand at the beginning of the next end step" in a trigger of the creature dying (CR 603.7, 603.7c, 400.7)', () => {
  const setup = () =>
    scenario()
      .define(returner)
      .seat(0)
      .life(20)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield(returner.name)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('the card waits in the graveyard, then returns to its owner’s hand at the end step', () => {
    const g = setup();
    g.act(0).cast('Murder', { targets: [returner.name], pay: true });
    g.passAll();
    g.expect.zone(returner.name, 'graveyard', { seat: 1 });
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.advanceTo('end');
    g.pass();
    g.pass();
    g.expect.zone(returner.name, 'hand', { seat: 1 });
    g.expect.invariants();
  });
});
