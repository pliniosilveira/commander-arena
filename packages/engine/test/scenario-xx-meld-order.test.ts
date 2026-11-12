// The order of the two cards of a melded permanent that left the battlefield (CR 712.21a, 712.21b; D-993): in a graveyard or a library their owner may arrange them
// in any order (the order in a library is not revealed), and a player who exiles a melded permanent determines the relative timestamp order of the two cards.
// The question is asked as state-based actions are next checked, of the owner of the cards, with the names of the two cards: the answer is the card that goes on
// top (or that is exiled last). It is not asked when the cards go to a hand or the command zone, and a pair that is no longer together is dropped.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-meld.ts).
import { describe, expect, test } from 'vitest';
import { checkInvariants, stateHash } from '../src/index';
import { scenario } from '../src/testing/index';
import { settle } from './meld-helpers';

const DUSK = 'SYNTHETIC Dusk Squire';
const DAWN = 'SYNTHETIC Dawn Squire';
const EXILE = 'SYNTHETIC Meld Exile';
const TUCK = 'SYNTHETIC Meld Tuck';

const build = (...hand: string[]) =>
  scenario()
    .seat(0)
    .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn' })
    .battlefield(DAWN, { label: 'dawn' })
    .battlefield('Swamp', 'Swamp', 'Swamp', 'Plains', 'Island', 'Island')
    .hand(...hand)
    .library('Island', { count: 6 })
    .seat(1)
    .library('Island', { count: 6 })
    .build();

type G = ReturnType<typeof build>;

const nameOfObject = (g: G, id: string): string => {
  const card = g.state.objects[id as never]?.card;
  return card === null || card === undefined
    ? ''
    : (g.state.definitions[g.state.cards[card]?.definition ?? -1]?.name ?? '');
};

describe('a melded permanent goes to the graveyard (CR 712.21a)', () => {
  test('its owner is asked for the order, with the names of the two cards, and the answer is the card that goes on top', () => {
    const g = build('Murder');
    g.act(0).cast('Murder', { targets: ['dusk'], pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    const d = g.state.pending;
    expect(d?.kind === 'chooseOption' && d.purpose).toBe('meldOrder');
    expect(d?.kind === 'chooseOption' && [...d.options].sort()).toEqual([DAWN, DUSK].sort());
    g.act(0).chooseOption(DUSK);
    settle(g);
    const yard = g.state.seats[0]?.graveyard.map((id) => nameOfObject(g, id)) ?? [];
    // The top of a graveyard is its last card; Murder went there after the two cards.
    expect(yard.indexOf(DUSK)).toBeGreaterThan(yard.indexOf(DAWN));
    expect(Math.abs(yard.indexOf(DUSK) - yard.indexOf(DAWN))).toBe(1);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('the other answer puts the other card on top', () => {
    const g = build('Murder');
    g.act(0).cast('Murder', { targets: ['dusk'], pay: true });
    g.passAll();
    g.act(0).chooseOption(DAWN);
    settle(g);
    const yard = g.state.seats[0]?.graveyard.map((id) => nameOfObject(g, id)) ?? [];
    expect(yard.indexOf(DAWN)).toBeGreaterThan(yard.indexOf(DUSK));
  });

  test('an answer that is not one of the two cards is refused', () => {
    const g = build('Murder');
    g.act(0).cast('Murder', { targets: ['dusk'], pay: true });
    g.passAll();
    expect(() => g.act(0).chooseOption('Grizzly Bears')).toThrow();
  });
});

describe('a melded permanent is put into a library (CR 712.21a)', () => {
  test('the two cards are on top of the library, in the order the owner chose', () => {
    const g = build(TUCK);
    g.act(0).cast(TUCK, { targets: ['dusk'], pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption(DAWN);
    settle(g);
    const library = g.state.seats[0]?.library.map((id) => nameOfObject(g, id)) ?? [];
    expect(library.slice(0, 2)).toEqual([DAWN, DUSK]); // the top of a library is its first card
    expect(library).toHaveLength(8);
  });

  test('the other order', () => {
    const g = build(TUCK);
    g.act(0).cast(TUCK, { targets: ['dusk'], pay: true });
    g.passAll();
    g.act(0).chooseOption(DUSK);
    settle(g);
    const library = g.state.seats[0]?.library.map((id) => nameOfObject(g, id)) ?? [];
    expect(library.slice(0, 2)).toEqual([DUSK, DAWN]);
  });
});

describe('a melded permanent is exiled (CR 712.21b)', () => {
  test('the player who exiled it determines which card has the later timestamp', () => {
    const g = build(EXILE);
    g.act(0).cast(EXILE, { targets: ['dusk'], pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption(DUSK);
    settle(g);
    expect(g.object(DUSK).timestamp).toBeGreaterThan(g.object(DAWN).timestamp);
  });

  test('the other order', () => {
    const g = build(EXILE);
    g.act(0).cast(EXILE, { targets: ['dusk'], pay: true });
    g.passAll();
    g.act(0).chooseOption(DAWN);
    settle(g);
    expect(g.object(DAWN).timestamp).toBeGreaterThan(g.object(DUSK).timestamp);
  });
});

describe('when nothing is asked', () => {
  test('to the hand: there is no order to a hand', () => {
    const g = build('Unsummon');
    g.act(0).cast('Unsummon', { targets: ['dusk'], pay: true });
    g.passAll();
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.meldOrders ?? []).toEqual([]);
  });

  test('answering the question clears the record, so it is asked once', () => {
    const g = build('Murder');
    g.act(0).cast('Murder', { targets: ['dusk'], pay: true });
    g.passAll();
    g.act(0).chooseOption(DAWN);
    expect(g.state.meldOrders ?? []).toEqual([]);
  });
});

describe('replay', () => {
  test('the same actions give the same game, state hash included', () => {
    const run = () => {
      const g = build('Murder');
      g.act(0).cast('Murder', { targets: ['dusk'], pay: true });
      g.passAll();
      g.act(0).chooseOption(DUSK);
      settle(g);
      return stateHash(g.state);
    };
    expect(run()).toBe(run());
  });
});
