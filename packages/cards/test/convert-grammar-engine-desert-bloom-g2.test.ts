// The Desert Bloom deck, group G2: cards put into your graveyard from anywhere (CR 603.2, 603.2c, 404.1), once for each card or as a batch, "for the first time each turn" and "only
// once each turn", and "for each land card milled this way" (CR 701.17a, 608.2c). The cards are SYNTHETIC stand-ins carrying the Oracle text of the real cards the group is for
// (the golden corpus does not hold them), read through the grammar only and played through applyAction.
import { type Action, type GameState, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = Array.from({ length: 30 }, () => 'Island');
const names = (state: GameState, seat: 0 | 1): string[] =>
  getView(state, seat).battlefield.map((o) => o.name);
const count = (state: GameState, name: string): number =>
  names(state, 0).filter((n) => n === name).length;

/** Passes priority until the stack is empty. */
function settle(g: {
  state: GameState;
  passAll(): unknown;
  legalActions(seat: 0 | 1): readonly Action[];
  choose(seat: 0 | 1, action: Action): unknown;
}) {
  for (let i = 0; i < 16; i += 1) {
    const d = g.state.pending;
    if (d !== null && d.kind === 'orderTriggers') {
      g.choose(d.seat as 0 | 1, g.legalActions(d.seat as 0 | 1)[0] as Action);
    } else if (g.state.stack.length > 0) g.passAll();
    else break;
  }
}

const MILL_TWO = parsed('SYNTHETIC Mill Two', 'Sorcery', 'Mill two cards.', { manaCost: '{1}' });
const MILL_TWO_B = parsed('SYNTHETIC Mill Two B', 'Sorcery', 'Mill two cards.', {
  manaCost: '{1}',
});
const MILL_ONE = parsed('SYNTHETIC Mill One', 'Sorcery', 'Mill a card.', { manaCost: '{1}' });
const BEAR = parsed('SYNTHETIC Bear', 'Creature — Bear', '', {
  manaCost: '{1}{G}',
  power: '2',
  toughness: '2',
});
const DESERT = parsed('SYNTHETIC Dry Basin', 'Land — Desert', '');

const CRAWLING = parsed(
  'SYNTHETIC Crawling Sensation',
  'Enchantment',
  'At the beginning of your upkeep, you may mill two cards.\nWhenever one or more land cards are put into your graveyard from anywhere for the first time each turn, create a 1/1 green Insect creature token.',
  { manaCost: '{2}{G}' },
);
const SCOUT = parsed(
  'SYNTHETIC Sand Scout',
  'Creature — Human Scout',
  'When ~ enters, if an opponent controls more lands than you, search your library for a Desert card, put it onto the battlefield tapped, then shuffle.\nWhenever one or more land cards are put into your graveyard from anywhere, create a 1/1 red, green, and white Sand Warrior creature token. This ability triggers only once each turn.',
  { manaCost: '{1}{W}', power: '2', toughness: '2' },
);
const SOWER = parsed(
  'SYNTHETIC Turntimber Sower',
  'Creature — Elemental',
  'Whenever one or more land cards are put into your graveyard from anywhere, create a 0/1 green Plant creature token.\n{G}, Sacrifice three creatures: Return target land card from your graveyard to your hand.',
  { manaCost: '{2}{G}', power: '3', toughness: '3' },
);
const YUMA = parsed(
  'SYNTHETIC Yuma',
  'Legendary Creature — Elemental',
  'Whenever a Desert card is put into your graveyard from anywhere, create a 4/2 green Plant Warrior creature token with reach.\nWhenever ~ enters or attacks, you may sacrifice a land. If you do, draw a card.',
  { manaCost: '{5}{R}{G}{W}', power: '6', toughness: '6' },
);
const CHANTER = parsed(
  'SYNTHETIC Dune Chanter',
  'Creature — Human Druid',
  '{T}: Mill two cards. You gain 1 life for each land card milled this way.',
  { manaCost: '{2}{G}', power: '2', toughness: '3' },
);

const build = (top: readonly string[], ...bf: string[]) =>
  scenario()
    .define(CRAWLING)
    .define(SCOUT)
    .define(SOWER)
    .define(YUMA)
    .define(CHANTER)
    .define(MILL_TWO)
    .define(MILL_TWO_B)
    .define(MILL_ONE)
    .define(BEAR)
    .define(DESERT)
    .seat(0)
    .hand(MILL_TWO.name, MILL_TWO_B.name, MILL_ONE.name)
    .battlefield(...bf)
    .battlefield('Plains', { count: 6 })
    .library(...top, ...FILLER)
    .seat(1)
    .library('Forest', 'Forest', ...FILLER)
    .at('precombatMain', { active: 0, turn: 1 })
    .build();

describe('Dune Chanter ("You gain 1 life for each land card milled this way")', () => {
  test('two land cards milled: two life; the cost taps it (CR 701.17a, 608.2c)', () => {
    const g = build(['Forest', 'Mountain'], CHANTER.name);
    const before = g.state.seats[0]?.life ?? 0;
    g.act(0).activate(CHANTER.name);
    settle(g);
    expect(g.state.seats[0]?.life).toBe(before + 2);
    g.expect.invariants();
  });

  test('only the land cards count', () => {
    const g = build([BEAR.name, 'Forest'], CHANTER.name);
    const before = g.state.seats[0]?.life ?? 0;
    g.act(0).activate(CHANTER.name);
    settle(g);
    expect(g.state.seats[0]?.life).toBe(before + 1);
  });

  test('no land card milled: no life', () => {
    const g = build([BEAR.name, BEAR.name], CHANTER.name);
    const before = g.state.seats[0]?.life ?? 0;
    g.act(0).activate(CHANTER.name);
    settle(g);
    expect(g.state.seats[0]?.life).toBe(before);
  });
});

describe('Yuma ("Whenever a Desert card is put into your graveyard from anywhere")', () => {
  test('a Desert milled makes a Plant Warrior; a Forest does not (CR 603.2, 205.3i)', () => {
    const g = build([DESERT.name, 'Forest'], YUMA.name);
    g.act(0).cast(MILL_TWO.name, { pay: true });
    settle(g);
    expect(count(g.state, 'Plant Warrior')).toBe(1);
    g.expect.invariants();
  });

  test('two Deserts milled: one token for each card', () => {
    const g = build([DESERT.name, DESERT.name], YUMA.name);
    g.act(0).cast(MILL_TWO.name, { pay: true });
    settle(g);
    expect(count(g.state, 'Plant Warrior')).toBe(2);
  });

  test('a Desert in an opponent’s graveyard is not "your graveyard"', () => {
    const g = scenario()
      .define(YUMA)
      .define(MILL_ONE)
      .define(DESERT)
      .seat(0)
      .hand(MILL_ONE.name)
      .battlefield(YUMA.name)
      .battlefield('Plains', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library(DESERT.name, ...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(MILL_ONE.name, { pay: true });
    settle(g);
    expect(count(g.state, 'Plant Warrior')).toBe(0);
  });
});

describe('Crawling Sensation ("for the first time each turn")', () => {
  test('lands milled together: one Insect; a later land card the same turn: no more (CR 603.2c)', () => {
    const g = build(['Forest', 'Mountain', 'Swamp', 'Forest'], CRAWLING.name);
    g.act(0).cast(MILL_TWO.name, { pay: true });
    settle(g);
    expect(count(g.state, 'Insect')).toBe(1);
    g.act(0).cast(MILL_TWO_B.name, { pay: true });
    settle(g);
    expect(count(g.state, 'Insect')).toBe(1);
  });

  test('a first mill of nonland cards does not use it up', () => {
    const g = build([BEAR.name, BEAR.name, 'Forest'], CRAWLING.name);
    g.act(0).cast(MILL_TWO.name, { pay: true });
    settle(g);
    expect(count(g.state, 'Insect')).toBe(0);
    g.act(0).cast(MILL_ONE.name, { pay: true });
    settle(g);
    expect(count(g.state, 'Insect')).toBe(1);
  });
});

describe('Sand Scout ("This ability triggers only once each turn")', () => {
  test('lands put into the graveyard twice in a turn: one Sand Warrior', () => {
    const g = build(['Forest', 'Mountain', 'Swamp', 'Forest'], SCOUT.name);
    g.act(0).cast(MILL_TWO.name, { pay: true });
    settle(g);
    expect(count(g.state, 'Sand Warrior')).toBe(1);
    g.act(0).cast(MILL_TWO_B.name, { pay: true });
    settle(g);
    expect(count(g.state, 'Sand Warrior')).toBe(1);
  });

  test('entering while an opponent controls more lands: a Desert comes from the library tapped', () => {
    const g = scenario()
      .define(SCOUT)
      .define(DESERT)
      .seat(0)
      .hand(SCOUT.name)
      .battlefield('Plains', { count: 2 })
      .library(...FILLER, DESERT.name)
      .seat(1)
      .battlefield('Forest', { count: 5 })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(SCOUT.name, { pay: true });
    settle(g);
    expect(g.state.pending?.kind).toBe('chooseCards');
    g.act(0).chooseCards(DESERT.name);
    settle(g);
    expect(count(g.state, DESERT.name)).toBe(1);
    g.expect.tapped(DESERT.name, true);
    g.expect.invariants();
  });

  test('entering with no more lands for the opponent: nothing is searched', () => {
    const g = scenario()
      .define(SCOUT)
      .define(DESERT)
      .seat(0)
      .hand(SCOUT.name)
      .battlefield('Plains', { count: 2 })
      .library(...FILLER, DESERT.name)
      .seat(1)
      .battlefield('Forest', { count: 1 })
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(SCOUT.name, { pay: true });
    settle(g);
    expect(count(g.state, DESERT.name)).toBe(0);
  });
});

describe('Turntimber Sower ("Whenever one or more land cards are put into your graveyard")', () => {
  test('lands milled together: one Plant; again later the same turn: another', () => {
    const g = build(['Forest', 'Mountain', 'Swamp'], SOWER.name);
    g.act(0).cast(MILL_TWO.name, { pay: true });
    settle(g);
    expect(count(g.state, 'Plant')).toBe(1);
    g.act(0).cast(MILL_ONE.name, { pay: true });
    settle(g);
    expect(count(g.state, 'Plant')).toBe(2);
  });

  test('a nonland card milled: no Plant', () => {
    const g = build([BEAR.name, BEAR.name], SOWER.name);
    g.act(0).cast(MILL_TWO.name, { pay: true });
    settle(g);
    expect(count(g.state, 'Plant')).toBe(0);
  });
});
