// Miracle Worker deck (issue 109), group D: looks at and rearrangements of libraries. Portent, Telling Time and Terminus are read from their REAL Oracle text
// (fixtures/corpus/golden.jsonl) with no override and played through applyAction, on two and on three seats.
// Pins: CR 401.2 (nobody but the player who looks sees the cards), CR 401.4 (the owner arranges cards put into a library together, and does not reveal the order),
// CR 108.3 and 400.3 (a card goes to its owner's library), CR 111.7 (a token that leaves the battlefield ceases to exist), CR 903.9b (a commander may go to the
// command zone instead), CR 603.7 (the delayed draw of Portent at the next turn's upkeep), CR 608.2c (Telling Time with fewer than three cards).
// The helper cards whose names start with SYNTHETIC are not real cards.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getLegalActions, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const PORTENT = real('Portent');
const TELLING_TIME = real('Telling Time');
const TERMINUS = real('Terminus');

/** The names of the cards of a seat's zone, in order (the library top first). */
function names(g: ScenarioGame, seat: number, zone: 'library' | 'hand'): string[] {
  return (g.state.seats[seat]?.[zone] ?? []).map((id) => {
    const card = g.state.objects[id]?.card;
    const def = card == null ? undefined : g.state.cards[card]?.definition;
    return def === undefined ? '?' : (g.state.definitions[def]?.name ?? '?');
  });
}

describe('the lowerings', () => {
  test('the three cards are valid', () => {
    for (const card of [PORTENT, TELLING_TIME, TERMINUS]) expect(validateCard(card)).toEqual([]);
  });

  test('Portent: a reorder of the target player’s library, the offer of that player’s shuffle, and the delayed draw', () => {
    const player = { kind: 'target' };
    expect(PORTENT.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'lookAndReorder', count: 3, from: player },
        { kind: 'may', effect: { kind: 'shuffle', player } },
        {
          kind: 'delayedTrigger',
          at: { step: 'upkeep', whose: 'each' },
          effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
        },
      ],
    });
    expect(PORTENT.faces[0]?.spell?.targets).toHaveLength(1);
  });

  test('Telling Time: a split of three cards into the hand, the top and the bottom', () => {
    expect(TELLING_TIME.faces[0]?.spell?.effect).toEqual({
      kind: 'lookAndSplit',
      count: 3,
      hand: 1,
      top: 1,
      bottom: 1,
      exile: 0,
    });
  });

  test('Terminus: every creature to its owner’s library, the owners arranging theirs', () => {
    expect(TERMINUS.faces[0]?.spell?.effect).toMatchObject({
      kind: 'moveToZone',
      objects: { kind: 'each', filter: { types: ['creature'], zone: 'battlefield' } },
      to: 'library',
      position: 'bottom',
      ownersArrange: true,
    });
  });
});

describe('Portent (CR 401.2, 115.1, 701.24, 603.7)', () => {
  const table = (
    targetLibrary: readonly string[] = ['Llanowar Elves', 'Forest', 'Island', 'Swamp'],
  ) => {
    let b = scenario({ seats: 3 })
      .define(PORTENT)
      .seat(0)
      .hand(PORTENT.name)
      .pool('U')
      .library('Plains', 'Plains', 'Plains')
      .seat(1);
    targetLibrary.forEach((name, i) => {
      b = b.library(name, { label: `t${i}` });
    });
    return b
      .seat(2)
      .library('Mountain', 'Mountain', 'Mountain')
      .at('precombatMain', { active: 0, turn: 4 })
      .build();
  };
  const cast = (g: ScenarioGame, player: number): ScenarioGame => {
    g.act(0).cast(PORTENT.name).targets([{ player }]).pay();
    return g.passAll();
  };

  test('the caster arranges the top three cards of the target player’s library, which stay there', () => {
    const g = cast(table(), 1);
    const pending = g.state.pending;
    expect(pending?.kind).toBe('arrangeCards');
    if (pending?.kind !== 'arrangeCards') return;
    expect(pending.seat).toBe(0);
    expect(pending.purpose).toBe('reorder');
    expect(pending.libraryOf).toBe(1);
    expect(pending.cards).toEqual(['t0', 't1', 't2'].map((l) => g.id(l)));
    g.act(0).arrange({ top: ['t2', 't0', 't1'] });
    expect(names(g, 1, 'library')).toEqual(['Island', 'Llanowar Elves', 'Forest', 'Swamp']);
    // The other libraries are untouched.
    expect(names(g, 0, 'library')).toEqual(['Plains', 'Plains', 'Plains']);
    expect(names(g, 2, 'library')).toEqual(['Mountain', 'Mountain', 'Mountain']);
  });

  test('only the caster sees the cards: neither the owner of the library nor the third player does (CR 401.2)', () => {
    const g = cast(table(), 1);
    expect(g.view(0).pendingCards?.map((c) => c.name)).toEqual([
      'Llanowar Elves',
      'Forest',
      'Island',
    ]);
    for (const seat of [1, 2]) {
      const view = g.view(seat);
      expect(view.pending).toBeNull();
      expect(view.pendingCards).toBeUndefined();
      expect(view.waitingOn).toMatchObject({ seat: 0, purpose: 'reorder' });
      const text = JSON.stringify(view);
      for (const name of ['Llanowar Elves', 'Forest', 'Island', 'Swamp']) {
        expect(text, `${seat} ${name}`).not.toContain(name);
      }
      expect(getLegalActions(g.state, seat)).toEqual([]);
    }
    const mark = g.mark();
    g.act(0).arrange({ top: ['t1', 't0', 't2'] });
    // Nothing the arrangement emits names a card.
    const said = JSON.stringify(g.eventsSince(mark));
    for (const label of ['t0', 't1', 't2']) expect(said).not.toContain(`"${g.id(label)}"`);
  });

  test('then the caster may have that player shuffle: accepting shuffles the target’s library, not the caster’s', () => {
    const g = cast(table(), 1);
    g.act(0).arrange({ top: ['t0', 't1', 't2'] });
    g.expect.pending('confirmOptional', 0);
    const mark = g.mark();
    g.act(0).accept();
    expect(g.eventsSince(mark)).toContainEqual(
      expect.objectContaining({ kind: 'libraryShuffled', seat: 1 }),
    );
    expect(g.eventsSince(mark)).not.toContainEqual(
      expect.objectContaining({ kind: 'libraryShuffled', seat: 0 }),
    );
    expect([...names(g, 1, 'library')].sort()).toEqual(
      ['Forest', 'Island', 'Llanowar Elves', 'Swamp'].sort(),
    );
    g.expect.invariants();
  });

  test('declining leaves the order the caster chose', () => {
    const g = cast(table(), 1);
    g.act(0).arrange({ top: ['t2', 't1', 't0'] });
    const mark = g.mark();
    g.act(0).decline();
    expect(g.eventsSince(mark).map((e) => e.kind)).not.toContain('libraryShuffled');
    expect(names(g, 1, 'library')).toEqual(['Island', 'Forest', 'Llanowar Elves', 'Swamp']);
  });

  test('the caster may target themselves: their own library is the one arranged', () => {
    const g = cast(table(), 0);
    const pending = g.state.pending;
    expect(pending?.kind).toBe('arrangeCards');
    if (pending?.kind !== 'arrangeCards') return;
    expect(pending.libraryOf).toBeUndefined();
    expect(pending.cards).toEqual(g.state.seats[0]?.library.slice(0, 3));
  });

  test('a library of fewer than three cards: the cards there are looked at, and nobody loses (ruling 2004-10-04)', () => {
    const g = cast(table(['Forest', 'Island']), 1);
    const pending = g.state.pending;
    expect(pending?.kind).toBe('arrangeCards');
    if (pending?.kind !== 'arrangeCards') return;
    expect(pending.cards).toHaveLength(2);
    g.act(0).arrange({ top: ['t1', 't0'] });
    g.act(0).decline();
    expect(names(g, 1, 'library')).toEqual(['Island', 'Forest']);
    g.expect.hasLost(1, false);
  });

  test('a single card is still shown to the caster before the offer of the shuffle', () => {
    const g = cast(table(['Forest']), 1);
    expect(g.view(0).pendingCards?.map((c) => c.name)).toEqual(['Forest']);
    g.act(0).arrange({ top: ['t0'] });
    g.expect.pending('confirmOptional', 0);
  });

  test('an empty library: nothing to look at, the shuffle is still offered and the target does not lose', () => {
    const g = cast(table([]), 1);
    g.expect.pending('confirmOptional', 0);
    g.act(0).decline();
    g.expect.hasLost(1, false);
    expect(g.state.pending?.kind).toBe('priority');
  });

  test('the draw is at the upkeep of the next turn, another player’s, and the caster draws (CR 603.7)', () => {
    const g = cast(table(), 1);
    g.act(0).arrange({ top: ['t0', 't1', 't2'] });
    g.act(0).decline();
    // Nothing is drawn as the spell resolves.
    g.expect.handSize(0, 0);
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1, turn: 5 });
    g.passAll();
    g.expect.handSize(0, 1);
    expect(names(g, 0, 'hand')).toEqual(['Plains']);
    expect(g.state.delayedTriggers).toEqual([]);
    // It does not come again at the upkeep after that.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 2, turn: 6 });
    expect(g.state.stack).toEqual([]);
    g.expect.handSize(0, 1);
  });
});

describe('Telling Time (CR 401.2, 608.2c)', () => {
  const game = (library: readonly string[] = ['Island', 'Forest', 'Plains', 'Swamp']) => {
    let b = scenario().define(TELLING_TIME).seat(0).hand(TELLING_TIME.name).pool('UC');
    library.forEach((name, i) => {
      b = b.library(name, { label: `c${i}` });
    });
    return b.seat(1).library('Llanowar Elves').build();
  };
  const cast = (g: ScenarioGame): ScenarioGame => {
    g.act(0).cast(TELLING_TIME.name, { pay: true });
    return g.passAll();
  };

  test('one card to the hand, one on top, one on the bottom, each chosen by the player', () => {
    const g = cast(game());
    let pending = g.state.pending;
    expect(pending).toMatchObject({ kind: 'chooseCards', purpose: 'lookSplit', to: 'hand' });
    if (pending?.kind !== 'chooseCards') return;
    expect(pending.legal).toEqual(['c0', 'c1', 'c2'].map((l) => g.id(l)));
    expect(pending.min).toBe(1);
    expect(pending.max).toBe(1);
    g.act(0).chooseCards('c1');
    pending = g.state.pending;
    expect(pending).toMatchObject({ kind: 'chooseCards', purpose: 'lookSplit', to: 'top' });
    if (pending?.kind !== 'chooseCards') return;
    expect(pending.legal).toEqual(['c0', 'c2'].map((l) => g.id(l)));
    g.act(0).chooseCards('c2');
    // The card left goes to the bottom with no question.
    expect(g.state.pending?.kind).toBe('priority');
    expect(names(g, 0, 'hand')).toEqual(['Forest']);
    expect(names(g, 0, 'library')).toEqual(['Plains', 'Swamp', 'Island']);
    g.expect.invariants();
  });

  test('the cards for the top and the bottom stay the objects they were (nothing changes zone in the library)', () => {
    const g = cast(game());
    const [top, bottom] = [g.id('c0'), g.id('c2')];
    g.act(0).chooseCards('c1');
    g.act(0).chooseCards('c0');
    expect(g.state.seats[0]?.library[0]).toBe(top);
    expect(g.state.seats[0]?.library.at(-1)).toBe(bottom);
  });

  test('the opponent sees no card, during the choice or afterwards (CR 401.2)', () => {
    const g = cast(game());
    const hidden = (): void => {
      const text = JSON.stringify(g.view(1));
      for (const name of ['Island', 'Forest', 'Plains', 'Swamp']) {
        expect(text, name).not.toContain(name);
      }
    };
    hidden();
    expect(g.view(1).pendingCards).toBeUndefined();
    expect(g.view(1).waitingOn).toMatchObject({ seat: 0, purpose: 'lookSplit' });
    g.act(0).chooseCards('c1');
    hidden();
    const mark = g.mark();
    g.act(0).chooseCards('c2');
    hidden();
    expect(g.eventsSince(mark).map((e) => e.kind)).not.toContain('cardsRevealed');
    expect(g.view(1).seats[0]?.hand).toBeNull();
  });

  test('two cards in the library: one to the hand, then the other on top (ruling 2005-10-01)', () => {
    const g = cast(game(['Island', 'Forest']));
    expect(g.state.pending).toMatchObject({ kind: 'chooseCards', to: 'hand' });
    g.act(0).chooseCards('c1');
    expect(g.state.pending?.kind).toBe('priority');
    expect(names(g, 0, 'hand')).toEqual(['Forest']);
    expect(names(g, 0, 'library')).toEqual(['Island']);
  });

  test('one card in the library: it goes to the hand, unasked', () => {
    const g = cast(game(['Island']));
    expect(g.state.pending?.kind).toBe('priority');
    expect(names(g, 0, 'hand')).toEqual(['Island']);
    expect(names(g, 0, 'library')).toEqual([]);
    g.expect.hasLost(0, false);
  });

  test('an empty library: nothing happens', () => {
    const g = cast(game([]));
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.handSize(0, 0);
    g.expect.hasLost(0, false);
  });

  test('an answer that is not exactly one of the cards still to place is refused', () => {
    const g = cast(game());
    expect(() => g.act(0).chooseCards('c0', 'c1')).toThrow();
    expect(() => g.act(0).chooseCards('c3')).toThrow();
    g.act(0).chooseCards('c0');
    // The card already put into the hand cannot be the one for the top.
    expect(() => g.act(0).chooseCards('c0')).toThrow();
    g.act(0).chooseCards('c1');
    expect(names(g, 0, 'library')).toEqual(['Forest', 'Swamp', 'Plains']);
  });
});

describe('Terminus (CR 401.4, 108.3, 111.7, 903.9b)', () => {
  const SOLDIERS = parsed(
    'SYNTHETIC Parsed Two Soldiers',
    'Instant',
    'Create two 1/1 white Soldier creature tokens.',
    { manaCost: '{W}', colors: ['W'] },
  );
  const cast = (g: ScenarioGame): ScenarioGame => {
    g.act(0).cast(TERMINUS.name, { pay: true });
    return g.passAll();
  };

  /** Three seats: seat 0 owns two creatures, seat 1 three (one of them controlled by seat 2), seat 2 one; each has a land that stays. */
  const table = () =>
    scenario({ seats: 3 })
      .define(TERMINUS)
      .seat(0)
      .hand(TERMINUS.name)
      .pool('WWWWWW')
      .library('Plains', 'Plains')
      .battlefield('Grizzly Bears', { label: 'a1' })
      .battlefield('Llanowar Elves', { label: 'a2' })
      .battlefield('Plains', { label: 'land0' })
      .seat(1)
      .library('Island', 'Island')
      .battlefield('Grizzly Bears', { label: 'b1' })
      .battlefield('Llanowar Elves', { label: 'b2' })
      .battlefield('Grizzly Bears', { label: 'stolen', controller: 2 })
      .battlefield('Island', { label: 'land1' })
      .seat(2)
      .library('Mountain', 'Mountain')
      .battlefield('Grizzly Bears', { label: 'c1' })
      .at('precombatMain', { active: 0, turn: 4 })
      .build();

  test('three owners: each one with two or more creatures orders theirs, in turn order; a single creature asks nothing', () => {
    const g = cast(table());
    // Every creature has left the battlefield before anybody is asked; the lands stay.
    expect(g.state.battlefield).toEqual([g.id('land0'), g.id('land1')]);
    let pending = g.state.pending;
    expect(pending).toMatchObject({ kind: 'arrangeCards', seat: 0, purpose: 'bottom' });
    if (pending?.kind !== 'arrangeCards') return;
    expect(pending.piles).toEqual(['bottom']);
    expect([...pending.cards].sort()).toEqual([g.id('a1'), g.id('a2')].sort());
    g.act(0).arrange({ top: [], other: ['a2', 'a1'] });
    // The stolen creature is among the cards of its owner (seat 1), not of the player who controlled it (CR 108.3).
    pending = g.state.pending;
    expect(pending).toMatchObject({ kind: 'arrangeCards', seat: 1, purpose: 'bottom' });
    if (pending?.kind !== 'arrangeCards') return;
    expect([...pending.cards].sort()).toEqual([g.id('b1'), g.id('b2'), g.id('stolen')].sort());
    g.act(1).arrange({ top: [], other: ['stolen', 'b2', 'b1'] });
    // Seat 2 owns one creature only: no order to choose.
    expect(g.state.pending?.kind).toBe('priority');
    expect(names(g, 0, 'library')).toEqual(['Plains', 'Plains', 'Llanowar Elves', 'Grizzly Bears']);
    expect(g.state.seats[1]?.library.slice(2)).toEqual(['stolen', 'b2', 'b1'].map((l) => g.id(l)));
    expect(names(g, 1, 'library').slice(0, 2)).toEqual(['Island', 'Island']);
    expect(names(g, 2, 'library')).toEqual(['Mountain', 'Mountain', 'Grizzly Bears']);
    g.expect.invariants();
  });

  test('the other order is the owner’s to choose too', () => {
    const g = cast(table());
    g.act(0).arrange({ top: [], other: ['a1', 'a2'] });
    g.act(1).arrange({ top: [], other: ['b1', 'stolen', 'b2'] });
    expect(names(g, 0, 'library')).toEqual(['Plains', 'Plains', 'Grizzly Bears', 'Llanowar Elves']);
    expect(g.state.seats[1]?.library.slice(2)).toEqual(['b1', 'stolen', 'b2'].map((l) => g.id(l)));
  });

  test('the order an owner chose is not told to anybody (CR 401.4): the event has only a count', () => {
    const g = cast(table());
    const mark = g.mark();
    g.act(0).arrange({ top: [], other: ['a2', 'a1'] });
    const events = g.eventsSince(mark);
    expect(events).toContainEqual({ kind: 'cardsBottomed', seat: 0, count: 2, ordered: true });
    const said = JSON.stringify(events);
    for (const label of ['a1', 'a2']) expect(said).not.toContain(`"${g.id(label)}"`);
    // While seat 1 chooses, the others are told only that an arrangement is going on.
    expect(g.view(0).pendingCards).toBeUndefined();
    expect(g.view(0).waitingOn).toMatchObject({ seat: 1, purpose: 'bottom' });
    expect(g.view(2).pendingCards).toBeUndefined();
    expect(g.view(1).pendingCards).toHaveLength(3);
  });

  test('an arrangement that leaves a card out, or names another player’s card, is refused', () => {
    const g = cast(table());
    expect(() => g.act(0).arrange({ top: [], other: ['a1'] })).toThrow();
    expect(() => g.act(0).arrange({ top: [], other: ['a1', 'b1'] })).toThrow();
    expect(() => g.act(0).arrange({ top: ['a1', 'a2'] })).toThrow();
    expect(() => g.act(1).arrange({ top: [], other: ['a2', 'a1'] })).toThrow();
    g.expect.pending('arrangeCards', 0);
  });

  test('tokens cease to exist and are in no library (CR 111.7)', () => {
    const g = scenario()
      .define(TERMINUS)
      .define(SOLDIERS)
      .seat(0)
      .hand(TERMINUS.name, SOLDIERS.name)
      .pool('WWWWWWW')
      .library('Plains')
      .battlefield('Grizzly Bears', { label: 'bears' })
      .seat(1)
      .library('Island')
      .build();
    g.act(0).cast(SOLDIERS.name, { pay: true });
    g.passAll();
    expect(g.state.battlefield).toHaveLength(3);
    cast(g);
    // One card only reached the library: nothing to order.
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.battlefield).toEqual([]);
    expect(names(g, 0, 'library')).toEqual(['Plains', 'Grizzly Bears']);
    expect(Object.values(g.state.objects).filter((o) => o.token !== null)).toEqual([]);
    g.expect.invariants();
  });

  const withCommander = () =>
    scenario()
      .define(TERMINUS)
      .seat(0)
      .hand(TERMINUS.name)
      .pool('WWWWWW')
      .library('Plains')
      .seat(1)
      .library('Island')
      .battlefield('Grizzly Bears', { label: 'cmd', commander: true })
      .battlefield('Llanowar Elves', { label: 'e1' })
      .battlefield('Llanowar Elves', { label: 'e2' })
      .build();

  test('a commander’s owner may put it into the command zone instead; it is then not among the cards ordered (CR 903.9b)', () => {
    const g = cast(withCommander());
    g.expect.pending('commanderZone', 1);
    g.act(1).sendToCommandZone();
    const pending = g.state.pending;
    expect(pending).toMatchObject({ kind: 'arrangeCards', seat: 1, purpose: 'bottom' });
    if (pending?.kind !== 'arrangeCards') return;
    expect([...pending.cards].sort()).toEqual([g.id('e1'), g.id('e2')].sort());
    g.act(1).arrange({ top: [], other: ['e2', 'e1'] });
    expect(g.state.seats[1]?.command).toHaveLength(1);
    expect(g.state.seats[1]?.library).toEqual([
      g.state.seats[1]?.library[0],
      g.id('e2'),
      g.id('e1'),
    ]);
  });

  test('a commander left to go to the library is ordered with the other cards', () => {
    const g = cast(withCommander());
    g.act(1).declineCommandZone();
    const pending = g.state.pending;
    expect(pending?.kind).toBe('arrangeCards');
    if (pending?.kind !== 'arrangeCards') return;
    expect(pending.cards).toHaveLength(3);
    g.act(1).arrange({ top: [], other: ['e1', 'cmd', 'e2'] });
    expect(g.state.seats[1]?.library.slice(1)).toEqual(['e1', 'cmd', 'e2'].map((l) => g.id(l)));
  });

  test('no creature on the battlefield: the spell resolves and nothing is asked', () => {
    const g = scenario()
      .define(TERMINUS)
      .seat(0)
      .hand(TERMINUS.name)
      .pool('WWWWWW')
      .library('Plains')
      .battlefield('Plains')
      .seat(1)
      .library('Island')
      .build();
    cast(g);
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.battlefield).toHaveLength(1);
  });
});
