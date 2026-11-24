// The Exit from Exile precon (issue 168), read by the grammar and run by the engine. Every card here is SYNTHETIC: its only text is a real line of the deck
// (the name replaced by ~), run through `applyAction` with the scenario DSL.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Island', 'Plains', 'Swamp', 'Island'] as const;

describe('"Whenever you cast a spell from exile, ..." (CR 601.2a, 601.2i, 406.1)', () => {
  const watcher = parsed(
    'SYNTHETIC Exile Watcher',
    'Creature — Elf Advisor',
    'Whenever you cast a spell from exile, you gain 2 life.\nDraw Arcanum — {T}: Look at the top card of your library. You may exile it face down.\nPlay Arcanum — {T}: Until end of turn, you may play cards exiled with ~. Spells you cast this way cost {2} less to cast.',
    { manaCost: '{W}{U}', power: '1', toughness: '3', colors: ['W', 'U'] },
  );
  const build = () =>
    scenario()
      .define(watcher)
      .seat(0)
      .life(20)
      .hand('Grizzly Bears')
      .battlefield(watcher.name, 'Forest', 'Forest')
      .library('Grizzly Bears', ...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('a spell cast from exile triggers it', () => {
    const g = build();
    g.act(0).activate(watcher.name, { ability: 1 });
    g.passAll();
    g.act(0).chooseCards('Grizzly Bears');
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(watcher.name, { ability: 2 });
    g.passAll();
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'exile' }, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(22);
  });

  test('a spell cast from the hand does not', () => {
    const g = build();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(20);
  });
});

describe('"Whenever you cast a spell from exile or a land you control enters from exile, ..." (CR 603.2c, 603.6a, 400.7)', () => {
  const lander = parsed(
    'SYNTHETIC Exile Lander',
    'Creature — Elf Advisor',
    'Whenever you cast a spell from exile or a land you control enters from exile, you gain 2 life.\nDraw Arcanum — {T}: Look at the top card of your library. You may exile it face down.\nPlay Arcanum — {T}: Until end of turn, you may play cards exiled with ~. Spells you cast this way cost {2} less to cast.',
    { manaCost: '{W}{U}', power: '1', toughness: '3', colors: ['W', 'U'] },
  );
  const build = (top: string) =>
    scenario()
      .define(lander)
      .seat(0)
      .life(20)
      .hand('Forest')
      .battlefield(lander.name, 'Forest', 'Forest')
      .library(top, ...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  const exiled = (top: string) => {
    const g = build(top);
    g.act(0).activate(lander.name, { ability: 2 });
    g.passAll();
    g.act(0).chooseCards(top);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(lander.name, { ability: 3 });
    g.passAll();
    return g;
  };

  test('a land played from exile triggers it once', () => {
    const g = exiled('Forest');
    g.act(0).playLand({ name: 'Forest', zone: 'exile' });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(22);
  });

  test('a spell cast from exile triggers it once', () => {
    const g = exiled('Grizzly Bears');
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'exile' }, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(22);
  });

  test('a land played from the hand does not', () => {
    const g = build('Grizzly Bears');
    g.act(0).playLand('Forest');
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(20);
  });
});
