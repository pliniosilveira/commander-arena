// The Jump Scare! deck (issue 108), group D: Body of Knowledge, Skaab Ruinator and Disorienting Choice, the REAL cards of the golden corpus read through the grammar only (no override), defined in an
// engine scenario and played through applyAction. Pins: CR 120.3 and 603.2g (a trigger of damage dealt, "that many" is the damage), CR 604.3 and 208.2 (a characteristic-defining power and toughness
// works in every zone), CR 402.2 (no maximum hand size), CR 118.8 and 601.2b/h (an additional cost of exiling cards of a kind from the graveyard, never the spell itself), CR 115.1 and 601.2c (one target
// slot with at most one target for each opponent), CR 608.2d and 101.4 (each controller decides, in turn order, whether to exile the permanents chosen), CR 400.7 (an exiled permanent is a new object, so it
// is no longer "still on the battlefield") and CR 701.23 (search, up to that many, then shuffle).
import { readFileSync } from 'node:fs';
import {
  type CardDefinition,
  checkInvariants,
  getLegalActions,
  validateCard,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const BODY = real('Body of Knowledge');
const RUINATOR = real('Skaab Ruinator');
const CHOICE = real('Disorienting Choice');

const BOLT = 'Lightning Bolt';
const SOL = 'Sol Ring';
const BEARS = 'Grizzly Bears';
const FILLER_CREATURES = ['Giant Spider', 'Typhoid Rats', 'Youthful Knight', 'Fencing Ace'];

describe('every card is valid', () => {
  test.each([
    ['Body of Knowledge', BODY],
    ['Skaab Ruinator', RUINATOR],
    ['Disorienting Choice', CHOICE],
  ] as const)('%s', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Body of Knowledge: "Whenever this creature is dealt damage, draw that many cards."', () => {
  const board = (hand: number) =>
    scenario()
      .define(BODY)
      .seat(0)
      .hand(...Array.from({ length: hand }, () => BEARS))
      .library(...Array.from({ length: 10 }, () => 'Forest'))
      .battlefield('Body of Knowledge')
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .library(...Array.from({ length: 10 }, () => 'Forest'))
      .at('precombatMain', { active: 1 })
      .build();

  test('its power and toughness are the cards in its controller’s hand', () => {
    const g = board(4);
    g.expect.pt('Body of Knowledge', 4, 4);
  });

  test('a Lightning Bolt it survives draws three cards (CR 120.3), which make it bigger', () => {
    const g = board(4);
    g.act(1).cast(BOLT, { targets: ['Body of Knowledge'], pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone('Body of Knowledge', 'battlefield', { seat: 0 });
    g.expect.handSize(0, 7);
    g.expect.pt('Body of Knowledge', 7, 7);
    g.expect.invariants();
  });

  test('damage that kills it still draws the cards: it dies before they are drawn', () => {
    const g = board(2);
    g.act(1).cast(BOLT, { targets: ['Body of Knowledge'], pay: true });
    g.passAll();
    g.expect.zone('Body of Knowledge', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.handSize(0, 5);
  });

  test('it has no maximum hand size (CR 402.2): a nine-card hand is not discarded down at the cleanup step', () => {
    const g = scenario()
      .define(BODY)
      .seat(0)
      .hand(...Array.from({ length: 9 }, () => BEARS))
      .library(...Array.from({ length: 10 }, () => 'Forest'))
      .battlefield('Body of Knowledge')
      .seat(1)
      .library(...Array.from({ length: 10 }, () => 'Forest'))
      .at('end', { active: 0 })
      .build();
    g.passAll();
    g.expect.handSize(0, 9);
    g.expect.step('upkeep', { active: 1 });
  });
});

describe('Skaab Ruinator: "As an additional cost to cast this spell, exile three creature cards from your graveyard."', () => {
  const board = (creatures: number, extra: readonly string[] = [], from: 'hand' | 'graveyard') => {
    const b = scenario().define(RUINATOR).seat(0);
    if (from === 'hand') b.hand('Skaab Ruinator');
    else b.graveyard('Skaab Ruinator');
    b.graveyard(...FILLER_CREATURES.slice(0, creatures), ...extra);
    return b
      .library(...Array.from({ length: 5 }, () => 'Island'))
      .battlefield('Island', 'Island', 'Island')
      .seat(1)
      .library(...Array.from({ length: 5 }, () => 'Island'))
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('with exactly three creature cards they are exiled, the spell is cast and resolves', () => {
    const g = board(3, [BOLT], 'hand');
    g.act(0).cast('Skaab Ruinator', { pay: true });
    for (const name of FILLER_CREATURES.slice(0, 3)) g.expect.zone(name, 'exile', { seat: 0 });
    // A noncreature card is not a creature card: it stays.
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone('Skaab Ruinator', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('with two creature cards (and noncreature cards) it cannot be cast', () => {
    const g = board(2, [BOLT, 'Mountain'], 'hand');
    g.expect.illegal(0, { cast: 'Skaab Ruinator' });
  });

  test('with four the caster chooses three, the fourth stays; cancel rewinds the cast', () => {
    const g = board(4, [], 'hand');
    g.act(0).cast('Skaab Ruinator', { pay: true });
    g.expect.pending('chooseCards', 0);
    g.act(0).cancel();
    g.expect.zone('Skaab Ruinator', 'hand', { seat: 0 });
    for (const name of FILLER_CREATURES) g.expect.zone(name, 'graveyard', { seat: 0 });
    g.act(0).cast('Skaab Ruinator', { pay: true });
    g.act(0).chooseCards('Giant Spider', 'Typhoid Rats', 'Fencing Ace');
    g.expect.zone('Youthful Knight', 'graveyard', { seat: 0 });
    g.expect.zone('Giant Spider', 'exile', { seat: 0 });
    g.expect.zone('Fencing Ace', 'exile', { seat: 0 });
    g.passAll();
    g.expect.zone('Skaab Ruinator', 'battlefield', { seat: 0 });
  });

  test('it may be cast from the graveyard, and the cost is the same: it is not one of the cards exiled', () => {
    const g = board(3, [], 'graveyard');
    g.expect.legal(0, { cast: 'Skaab Ruinator' });
    g.act(0).cast('Skaab Ruinator', { pay: true });
    for (const name of FILLER_CREATURES.slice(0, 3)) g.expect.zone(name, 'exile', { seat: 0 });
    g.passAll();
    g.expect.zone('Skaab Ruinator', 'battlefield', { seat: 0 });
  });

  test('from the graveyard with only the card itself and two others it cannot be cast', () => {
    const g = board(2, [], 'graveyard');
    g.expect.illegal(0, { cast: 'Skaab Ruinator' });
  });
});

describe('Disorienting Choice', () => {
  const lands = Array.from({ length: 6 }, () => 'Forest');
  /** Seat 0 casts it with {3}{G}; `perSeat` gives the permanents each other seat controls. */
  const board = (seats: number, perSeat: Record<number, readonly string[]>): ScenarioGame => {
    let b = scenario({ seats })
      .define(CHOICE)
      .seat(0)
      .hand('Disorienting Choice')
      .library('Forest', 'Forest', 'Forest', BEARS, 'Mountain')
      .battlefield('Forest', 'Forest', 'Forest', 'Forest');
    for (let seat = 1; seat < seats; seat += 1) {
      b = b
        .seat(seat)
        .library(...lands)
        .battlefield(...(perSeat[seat] ?? []));
    }
    return b.at('precombatMain', { active: 0 }).build();
  };
  const ring = (seat: number) => ({ name: SOL, seat, zone: 'battlefield' as const });

  test('the slot takes at most one artifact or enchantment of each opponent', () => {
    const face = CHOICE.faces[0];
    expect(face?.spell?.targets).toMatchObject([
      { onePerOpponent: true, what: { kind: 'object', filter: { controller: 'opponent' } } },
    ]);
  });

  test('declining to exile the permanent chosen: the caster searches for one land, onto the battlefield tapped, and shuffles', () => {
    const g = board(2, { 1: [SOL] });
    g.act(0).cast('Disorienting Choice', { targets: [ring(1)], pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 1);
    g.act(1).choosePermanents();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Forest[0]');
    g.expect.zone(SOL, 'battlefield', { seat: 1 });
    g.expect.tapped({ name: 'Forest', zone: 'battlefield', seat: 0, nth: 4 }, true);
    g.expect.eventLog([{ kind: 'librarySearched' } as never]);
    g.expect.invariants();
  });

  test('the controller exiles it: it is no longer on the battlefield, so there is no search and no shuffle', () => {
    const g = board(2, { 1: [SOL] });
    g.act(0).cast('Disorienting Choice', { targets: [ring(1)], pay: true });
    g.passAll();
    g.act(1).choosePermanents(SOL);
    g.expect.zone(SOL, 'exile', { seat: 1 });
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'librarySearched' } as never, { since: 0 });
    g.expect.noEvent({ kind: 'shuffled' } as never, { since: 0 });
  });

  test('no target at all: nobody is asked and nothing is searched for', () => {
    const g = board(2, { 1: [SOL] });
    g.act(0).cast('Disorienting Choice', { targets: [], pay: true });
    g.passAll();
    g.expect.zone(SOL, 'battlefield', { seat: 1 });
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'librarySearched' } as never, { since: 0 });
  });

  test('three players: each opponent is asked in turn order and the search is for as many lands as stayed', () => {
    const g = board(3, { 1: [SOL], 2: [SOL] });
    g.act(0).cast('Disorienting Choice', { targets: [ring(1), ring(2)], pay: true });
    g.passAll();
    // The next opponent in turn order decides first, then the one after.
    g.expect.pending('choosePermanent', 1);
    g.act(1).choosePermanents(SOL);
    g.expect.pending('choosePermanent', 2);
    g.act(2).choosePermanents();
    // One was exiled, one stayed: up to one land.
    g.expect.zone(SOL, 'exile', { seat: 1 });
    g.expect.zone(SOL, 'battlefield', { seat: 2 });
    g.expect.pending('chooseCards', 0);
    const search = g.state.pending;
    expect(search?.kind === 'chooseCards' ? search.max : -1).toBe(1);
    g.act(0).chooseCards('Forest[0]');
    g.expect.invariants();
  });

  test('four players, all three opponents chosen and none exiles: up to three lands', () => {
    const g = board(4, { 1: [SOL], 2: [SOL], 3: [SOL] });
    g.act(0).cast('Disorienting Choice', { targets: [ring(1), ring(2), ring(3)], pay: true });
    g.passAll();
    for (const seat of [1, 2, 3]) {
      g.expect.pending('choosePermanent', seat);
      g.act(seat).choosePermanents();
    }
    g.expect.pending('chooseCards', 0);
    const search = g.state.pending;
    expect(search?.kind === 'chooseCards' ? search.max : -1).toBe(3);
    g.act(0).chooseCards('Forest[0]', 'Forest[1]');
    g.expect.zone(BEARS, 'library', { seat: 0 });
    expect(getLegalActions(g.state, 0).filter((a) => a.kind === 'pass').length).toBeGreaterThan(0);
    expect(checkInvariants(g.state)).toEqual([]);
  });

  test('four players, every opponent exiles: nothing stayed, nothing is searched for', () => {
    const g = board(4, { 1: [SOL], 2: [SOL], 3: [SOL] });
    g.act(0).cast('Disorienting Choice', { targets: [ring(1), ring(2), ring(3)], pay: true });
    g.passAll();
    for (const seat of [1, 2, 3]) g.act(seat).choosePermanents(SOL);
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'librarySearched' } as never, { since: 0 });
  });
});
