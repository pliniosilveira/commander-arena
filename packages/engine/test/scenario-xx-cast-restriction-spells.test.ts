// "Your opponents can't cast spells with mana value 3 or less." (CR 101.2, 601.2, 604.1, 202.3, 202.3e; D-282): the static ability of a permanent that describes the spells
// its controller's opponents can't cast, by any means ("can't" beats "can", CR 101.2). The filter describes the spell as it is on the stack: its mana value, with the
// announced X of an {X} in its cost (CR 202.3e), so a spell with an X is cast only with an X that takes it out of the filter. Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-meld.ts); Lightning Bolt, Murder and Serra Angel are the fixtures of real cards.
import { describe, expect, test } from 'vitest';
import { scenario } from '../src/testing/index';

const KEEPER = 'SYNTHETIC Gatekeeper'; // "Your opponents can't cast spells with mana value 3 or less."
const SURGE = 'SYNTHETIC X Surge'; // {X}{R}: you gain X life

const build = (hand: string[], lands: string[]) =>
  scenario()
    .seat(0)
    .battlefield(KEEPER)
    .library('Island', { count: 6 })
    .seat(1)
    .hand(...hand)
    .battlefield(...lands)
    .library('Island', { count: 6 })
    .at('precombatMain', { active: 1, turn: 4, priority: 1 })
    .build();

describe('the opponents of the controller (CR 101.2)', () => {
  test('can not cast a spell with mana value 3 or less: {R} (1) and {1}{B}{B} (3)', () => {
    const g = build(['Lightning Bolt', 'Murder'], ['Mountain', 'Swamp', 'Swamp', 'Swamp']);
    g.expect.illegal(1, { cast: 'Lightning Bolt' });
    g.expect.illegal(1, { cast: 'Murder' });
  });

  test('can cast a spell with mana value 4 or more: {3}{W}{W} (5)', () => {
    const g = build(['Serra Angel'], ['Plains', 'Plains', 'Plains', 'Plains', 'Plains']);
    g.expect.legal(1, { cast: 'Serra Angel' });
  });

  test('the controller of the permanent is not stopped', () => {
    const g = scenario()
      .seat(0)
      .battlefield(KEEPER, 'Mountain')
      .hand('Lightning Bolt')
      .library('Island', { count: 6 })
      .seat(1)
      .library('Island', { count: 6 })
      .build();
    g.expect.legal(0, { cast: 'Lightning Bolt' });
  });

  test('without the permanent they can: it is the ability that stops them', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 6 })
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .library('Island', { count: 6 })
      .at('precombatMain', { active: 1, turn: 4, priority: 1 })
      .build();
    g.expect.legal(1, { cast: 'Lightning Bolt' });
  });
});

describe('a spell with an {X} in its mana cost (CR 202.3e, 107.3a)', () => {
  test('is cast only with an X that gives it a mana value above 3: {X}{R} needs X of 3 or more, and the announcement offers nothing less', () => {
    const g = build([SURGE], ['Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain']);
    g.expect.legal(1, { cast: SURGE });
    g.act(1).cast(SURGE);
    g.expect.pending('chooseX', 1);
    const d = g.state.pending;
    expect(d?.kind === 'chooseX' && [d.min, d.max]).toEqual([3, 4]);
    expect(() => g.act(1).chooseX(2)).toThrow();
  });

  test('with that X it is cast and resolves', () => {
    const g = build([SURGE], ['Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain']);
    g.act(1).cast(SURGE, { x: 3, pay: true });
    g.passAll();
    g.expect.life(1, 43);
  });

  test('with too little mana for that X it can not be cast at all', () => {
    const g = build([SURGE], ['Mountain', 'Mountain', 'Mountain']);
    g.expect.illegal(1, { cast: SURGE });
  });

  test('without the permanent the X may be 0', () => {
    const g = scenario()
      .seat(0)
      .library('Island', { count: 6 })
      .seat(1)
      .hand(SURGE)
      .battlefield('Mountain', 'Mountain')
      .library('Island', { count: 6 })
      .at('precombatMain', { active: 1, turn: 4, priority: 1 })
      .build();
    g.act(1).cast(SURGE);
    g.expect.pending('chooseX', 1);
    const d = g.state.pending;
    expect(d?.kind === 'chooseX' && d.min).toBe(0);
  });
});
