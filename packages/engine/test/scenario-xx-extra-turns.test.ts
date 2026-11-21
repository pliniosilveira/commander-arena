// Extra turns (CR 500.7): an effect adds a turn directly after the current one; the most recently created turn is taken first; afterwards the turn order goes on from the
// player whose turn the extra turns followed. Also the cost "put this creature on the bottom of its owner's library" and "activate only if you have the city's blessing".
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-extra-turns.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { getView } from '../src/index';
import { twoSeatGame } from './two-seat-helpers';

const LESSON = 'SYNTHETIC Time Lesson'; // instant: take an extra turn after this one
const HOUR = 'SYNTHETIC Borrowed Hour'; // instant: target player takes an extra turn after this one
const PILOT = 'SYNTHETIC Time Pilot';
const ISLAND = 'Island';

const turn = (g: ReturnType<typeof twoSeatGame>) => ({
  seat: g.state.turn.activeSeat,
  number: g.state.turn.number,
  extra: g.state.turn.extra === true,
});

/** Walks to the upkeep of the next turn, whoever takes it. */
const nextTurn = (g: ReturnType<typeof twoSeatGame>) => g.advanceTo('upkeep', { turn: 'next' });

describe('"take an extra turn after this one" (CR 500.7)', () => {
  test('the player takes the turn directly after the current one, then the order goes on', () => {
    const g = twoSeatGame((b) => b.hand(LESSON).battlefield(ISLAND));
    const first = g.state.turn.number;
    g.act(0).cast(LESSON, { pay: true });
    g.passAll();
    expect(g.state.extraTurns).toEqual([0]);
    nextTurn(g);
    expect(turn(g)).toEqual({ seat: 0, number: first + 1, extra: true });
    expect(g.state.extraTurns ?? []).toEqual([]);
    expect(getView(g.state, 1).extraTurn).toBe(true);
    nextTurn(g);
    expect(turn(g)).toEqual({ seat: 1, number: first + 2, extra: false });
    expect(getView(g.state, 1).extraTurn).toBeUndefined();
    nextTurn(g);
    expect(turn(g)).toEqual({ seat: 0, number: first + 3, extra: false });
    g.expect.invariants();
  });

  test('the extra turn is a whole turn: its player untaps and draws, and may play a land again', () => {
    const g = twoSeatGame((b) => b.hand(LESSON, ISLAND, ISLAND).battlefield(ISLAND));
    g.act(0).playLand(`${ISLAND}[1]`);
    g.act(0).cast(LESSON, { pay: true });
    g.passAll();
    const hand = g.state.seats[0]?.hand.length ?? 0;
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(turn(g).seat).toBe(0);
    expect(g.state.seats[0]?.hand.length).toBe(hand + 1);
    expect(g.state.battlefield.every((id) => g.state.objects[id]?.tapped !== true)).toBe(true);
    expect(g.act(0).try.playLand(ISLAND).ok).toBe(true);
  });

  test('two extra turns of one player are both taken before the other player’s turn', () => {
    const g = twoSeatGame((b) => b.hand(LESSON, LESSON).battlefield(ISLAND, ISLAND));
    g.act(0).cast(`${LESSON}[1]`, { pay: true });
    g.passAll();
    g.act(0).cast(LESSON, { pay: true });
    g.passAll();
    expect(g.state.extraTurns).toEqual([0, 0]);
    nextTurn(g);
    expect(turn(g)).toMatchObject({ seat: 0, extra: true });
    nextTurn(g);
    expect(turn(g)).toMatchObject({ seat: 0, extra: true });
    nextTurn(g);
    expect(turn(g)).toMatchObject({ seat: 1, extra: false });
  });

  test('the most recently created turn is taken first, and the order then goes on from the player whose turn they followed', () => {
    const g = twoSeatGame((b) => b.hand(LESSON, HOUR).battlefield(ISLAND, ISLAND));
    g.act(0).cast(LESSON, { pay: true });
    g.passAll();
    g.act(0).cast(HOUR, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    expect(g.state.extraTurns).toEqual([0, 1]);
    nextTurn(g);
    expect(turn(g)).toMatchObject({ seat: 1, extra: true }); // created last
    nextTurn(g);
    expect(turn(g)).toMatchObject({ seat: 0, extra: true });
    nextTurn(g);
    expect(turn(g)).toMatchObject({ seat: 1, extra: false }); // the turn order goes on after seat 0's own turn
    nextTurn(g);
    expect(turn(g)).toMatchObject({ seat: 0, extra: false });
  });

  test('an extra turn given to the next player does not take that player’s own turn away', () => {
    const g = twoSeatGame((b) => b.hand(HOUR).battlefield(ISLAND));
    g.act(0).cast(HOUR, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    nextTurn(g);
    expect(turn(g)).toMatchObject({ seat: 1, extra: true });
    nextTurn(g);
    expect(turn(g)).toMatchObject({ seat: 1, extra: false });
    nextTurn(g);
    expect(turn(g)).toMatchObject({ seat: 0, extra: false });
  });

  test('an extra turn made during an extra turn follows it, and the chain ends', () => {
    const g = twoSeatGame((b) => b.hand(LESSON, LESSON).battlefield(ISLAND));
    g.act(0).cast(`${LESSON}[1]`, { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).cast(LESSON, { pay: true });
    g.passAll();
    nextTurn(g);
    expect(turn(g)).toMatchObject({ seat: 0, extra: true });
    nextTurn(g);
    expect(turn(g)).toMatchObject({ seat: 1, extra: false });
  });

  test('the extra turn is announced as it is made', () => {
    const g = twoSeatGame((b) => b.hand(LESSON).battlefield(ISLAND));
    g.act(0).cast(LESSON, { pay: true });
    g.passAll();
    g.expect.eventLog([{ kind: 'extraTurnAdded', seat: 0 }]);
  });
});

describe('"put this creature on the bottom of its owner’s library" as a cost, only with the city’s blessing', () => {
  test('without the city’s blessing the ability cannot be activated', () => {
    const g = twoSeatGame((b) => b.battlefield(PILOT));
    expect(g.act(0).try.activate(PILOT).ok).toBe(false);
  });

  test('with it, the creature goes to the bottom of its owner’s library as the cost is paid and the extra turn follows', () => {
    const g = twoSeatGame((b) => b.battlefield(PILOT).citysBlessing());
    g.act(0).activate(PILOT);
    g.expect.zone(PILOT, 'battlefield', { count: 0 });
    g.expect.zone(PILOT, 'library', { seat: 0, count: 1 });
    const library = g.state.seats[0]?.library ?? [];
    const bottom = library[library.length - 1];
    const card = bottom === undefined ? undefined : g.state.objects[bottom]?.card;
    const stored = card === null || card === undefined ? undefined : g.state.cards[card];
    expect(
      stored === undefined ? undefined : g.state.definitions[stored.definition]?.faces[0]?.name,
    ).toBe(PILOT);
    expect(g.state.extraTurns ?? []).toEqual([]); // the ability is on the stack
    g.passAll();
    expect(g.state.extraTurns).toEqual([0]);
    nextTurn(g);
    expect(turn(g)).toMatchObject({ seat: 0, extra: true });
    g.expect.invariants();
  });
});
