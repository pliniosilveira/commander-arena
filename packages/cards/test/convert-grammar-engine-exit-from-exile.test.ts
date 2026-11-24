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

describe('"Exile the top two cards of your library. You may play cards exiled this way until the end of your next turn." (CR 701.13, 601.2, 305.1, 611.2a)', () => {
  const wilds = parsed(
    'SYNTHETIC Wilds Escape',
    'Sorcery',
    'Exile the top two cards of your library. You may play cards exiled this way until the end of your next turn.',
    { manaCost: '{2}{G}', colors: ['G'] },
  );
  const build = () =>
    scenario()
      .define(wilds)
      .seat(0)
      .hand(wilds.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .library('Grizzly Bears', 'Forest', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the cards are exiled and can be played this turn', () => {
    const g = build();
    g.act(0).cast(wilds.name, { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'exile');
    g.act(0).playLand({ name: 'Forest', zone: 'exile' });
    g.expect.zone('Forest', 'battlefield', { seat: 0 });
  });

  test('the permission is still there in the next turn of the controller', () => {
    const g = build();
    g.act(0).cast(wilds.name, { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
  });
});

describe('"~ deals 2 damage to each opponent and each creature they control. If ~ was cast from exile, it deals 5 damage ... instead." (CR 120.2, 601.2a, 614.1a)', () => {
  const blast = parsed(
    'SYNTHETIC Delayed Blast',
    'Sorcery',
    '~ deals 2 damage to each opponent and each creature they control. If ~ was cast from exile, it deals 5 damage to each opponent and each creature they control instead.',
    { manaCost: '{4}{R}{R}', colors: ['R'] },
  );
  const keeper = parsed(
    'SYNTHETIC Exile Keeper',
    'Creature — Elf Advisor',
    'Draw Arcanum — {T}: Look at the top card of your library. You may exile it face down.\nPlay Arcanum — {T}: Until end of turn, you may play cards exiled with ~. Spells you cast this way cost {2} less to cast.',
    { manaCost: '{W}{U}', power: '1', toughness: '3', colors: ['W', 'U'] },
  );
  const build = (top: string | null) =>
    scenario()
      .define(blast)
      .define(keeper)
      .seat(0)
      .hand(...(top === null ? [blast.name] : []))
      .battlefield(
        keeper.name,
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
        'Mountain',
      )
      .library(top ?? 'Island', ...FILLER)
      .seat(1)
      .life(20)
      .battlefield('Serra Angel', 'Grizzly Bears')
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('cast from the hand: 2 to the opponent and to each of their creatures', () => {
    const g = build(null);
    g.act(0).cast(blast.name, { pay: true });
    g.passAll();
    expect(g.state.seats[1]?.life).toBe(18);
    g.expect.noObject('Grizzly Bears', { zone: 'battlefield' });
    g.expect.zone('Serra Angel', 'battlefield', { seat: 1 });
  });

  test('cast from exile: 5 damage instead', () => {
    const g = build(blast.name);
    g.act(0).activate(keeper.name, { ability: 0 });
    g.passAll();
    g.act(0).chooseCards(blast.name);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).activate(keeper.name, { ability: 1 });
    g.passAll();
    g.act(0).cast({ name: blast.name, zone: 'exile' }, { pay: true });
    g.passAll();
    expect(g.state.seats[1]?.life).toBe(15);
    g.expect.noObject('Serra Angel', { zone: 'battlefield' });
  });
});

describe('"... you may cast spells from among those exiled cards this turn" and "... without paying its mana cost" (CR 601.2, 118.9, 305.1)', () => {
  const among = parsed(
    'SYNTHETIC Among Spells',
    'Sorcery',
    'Exile the top two cards of your library. You may cast spells from among those exiled cards this turn.',
    { manaCost: '{1}', colors: [] },
  );
  const free = parsed(
    'SYNTHETIC Free Play',
    'Sorcery',
    'Exile the top card of your library. You may play it this turn without paying its mana cost.',
    { manaCost: '{1}', colors: [] },
  );
  const build = (spell: string, ...top: string[]) =>
    scenario()
      .define(among)
      .define(free)
      .seat(0)
      .hand(spell)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest')
      .library(...top, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('a spell among the exiled cards can be cast, a land among them cannot be played', () => {
    const g = build(among.name, 'Forest', 'Grizzly Bears');
    g.act(0).cast(among.name, { pay: true });
    g.passAll();
    expect(g.legalActions(0).some((a) => a.type === 'playLand')).toBe(false);
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'exile' }, { pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Forest', 'exile');
  });

  test('without paying its mana cost: the spell is cast for no mana', () => {
    const g = build(free.name, 'Grizzly Bears');
    g.act(0).cast(free.name, { pay: true });
    g.passAll();
    const untappedBefore = Object.values(g.state.objects).filter(
      (o) => o.zone === 'battlefield' && o.tapped !== true,
    ).length;
    g.act(0).cast({ name: 'Grizzly Bears', zone: 'exile' }, { alternative: 'free' });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    const untappedAfter = Object.values(g.state.objects).filter(
      (o) => o.zone === 'battlefield' && o.tapped !== true,
    ).length;
    expect(untappedAfter).toBe(untappedBefore + 1);
  });
});
