// Scry (CR 701.22) and surveil (CR 701.25) and the arrangeCards decision (D-091).
// Pins: CR 701.22a (look at the top N, any number on the bottom in any order, the rest on top in
// any order; the cards do not change zones), CR 701.22b and 701.25c (scry 0 and surveil 0 are no
// event), CR 701.22d and 701.25d (the event happens even when nothing could be done), CR 701.25a
// (surveil puts cards into the graveyard, a zone change), CR 400.7 (a card that changes zone is a
// new object), CR 401.2 (nobody knows the order of a library: the cards looked at are shown to the
// player who looks alone), CR 603.3 (a "when enters" scry goes on the stack first).
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-library.ts) or basic lands.
import { describe, expect, test } from 'vitest';
import { type Action, applyAction, type ObjectId } from '../src/index';
import { scenario } from '../src/testing/index';
import {
  arrangeDecision,
  castAndResolve,
  graveyardNames,
  libraryGame,
  libraryNames,
} from './scry-helpers';

describe('scry 2 (CR 701.22a)', () => {
  test('asks the controller, with the top two cards and the top and bottom piles', () => {
    const g = libraryGame('SYNTHETIC Scry Two');
    castAndResolve(g, 'SYNTHETIC Scry Two');
    g.expect.pending('arrangeCards', 0);
    const d = arrangeDecision(g);
    expect(d.purpose).toBe('scry');
    expect(d.cards).toEqual([g.id('a'), g.id('b')]);
    expect(d.piles).toEqual(['top', 'bottom']);
    // The spell is still on the stack, waiting for the answer (CR 608.2).
    expect(d.source).toBe(g.state.stack[0]);
    expect(g.state.stack).toHaveLength(1);
    g.expect.librarySize(0, 5);
  });

  test('one card on top and one at the bottom; the cards keep their objects (no zone change)', () => {
    const g = libraryGame('SYNTHETIC Scry Two');
    castAndResolve(g, 'SYNTHETIC Scry Two');
    const mark = g.mark();
    g.act(0).arrange({ top: ['b'], other: ['a'] });
    // Forest on top, then Plains, Swamp, Mountain, and Island at the bottom.
    expect(libraryNames(g)).toEqual(['Forest', 'Plains', 'Swamp', 'Mountain', 'Island']);
    expect(g.state.seats[0]?.library).toEqual([
      g.id('b'),
      g.id('c'),
      g.id('d'),
      g.id('e'),
      g.id('a'),
    ]);
    const events = g.eventsSince(mark);
    expect(events.find((e) => e.kind === 'scried')).toEqual({
      kind: 'scried',
      seat: 0,
      top: 1,
      bottom: 1,
    });
    // A scry moves no card between zones (CR 701.22a): only the order of the library changes.
    expect(events.filter((e) => e.kind === 'zoneChanged' && e.fromZone === 'library')).toEqual([]);
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('both on top in the order chosen: the first is the new top card', () => {
    const g = libraryGame('SYNTHETIC Scry Two');
    castAndResolve(g, 'SYNTHETIC Scry Two');
    g.act(0).arrange({ top: ['b', 'a'] });
    expect(libraryNames(g)).toEqual(['Forest', 'Island', 'Plains', 'Swamp', 'Mountain']);
    expect(g.eventsSince(0).find((e) => e.kind === 'scried')).toEqual({
      kind: 'scried',
      seat: 0,
      top: 2,
      bottom: 0,
    });
  });

  test('all to the bottom, in the order chosen: the last one is the bottom card', () => {
    const g = libraryGame('SYNTHETIC Scry Two');
    castAndResolve(g, 'SYNTHETIC Scry Two');
    g.act(0).arrange({ top: [], other: ['b', 'a'] });
    expect(libraryNames(g)).toEqual(['Plains', 'Swamp', 'Mountain', 'Forest', 'Island']);
    expect(g.eventsSince(0).find((e) => e.kind === 'scried')).toEqual({
      kind: 'scried',
      seat: 0,
      top: 0,
      bottom: 2,
    });
  });

  test('scry 3: the order inside the bottom pile and inside the top pile both count', () => {
    const g = libraryGame('SYNTHETIC Scry Three');
    castAndResolve(g, 'SYNTHETIC Scry Three');
    expect(arrangeDecision(g).cards).toEqual([g.id('a'), g.id('b'), g.id('c')]);
    g.act(0).arrange({ top: ['c', 'a'], other: ['b'] });
    expect(libraryNames(g)).toEqual(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);
  });

  test('scry 3 with three to the bottom in a chosen order', () => {
    const g = libraryGame('SYNTHETIC Scry Three');
    castAndResolve(g, 'SYNTHETIC Scry Three');
    g.act(0).arrange({ top: [], other: ['c', 'a', 'b'] });
    expect(libraryNames(g)).toEqual(['Swamp', 'Mountain', 'Plains', 'Island', 'Forest']);
  });

  test('with "player: you" written out it is the same scry', () => {
    const g = libraryGame('SYNTHETIC Scry One You');
    castAndResolve(g, 'SYNTHETIC Scry One You');
    expect(arrangeDecision(g).cards).toEqual([g.id('a')]);
    g.act(0).arrange({ top: [], other: ['a'] });
    expect(libraryNames(g)).toEqual(['Forest', 'Plains', 'Swamp', 'Mountain', 'Island']);
  });
});

describe('scry with few cards or none (CR 701.22b, 701.22d)', () => {
  test('a one-card library: the one card is offered, and can go to the bottom (it is the bottom)', () => {
    const g = libraryGame('SYNTHETIC Scry Two', 1);
    castAndResolve(g, 'SYNTHETIC Scry Two');
    expect(arrangeDecision(g).cards).toEqual([g.id('a')]);
    g.act(0).arrange({ top: [], other: ['a'] });
    expect(libraryNames(g)).toEqual(['Island']);
    expect(g.eventsSince(0).find((e) => e.kind === 'scried')).toEqual({
      kind: 'scried',
      seat: 0,
      top: 0,
      bottom: 1,
    });
    g.expect.pending('priority', 0);
  });

  test('scry 0 asks nothing and emits no scried event (CR 701.22b)', () => {
    const g = libraryGame('SYNTHETIC Scry Zero');
    castAndResolve(g, 'SYNTHETIC Scry Zero');
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'scried' });
    expect(libraryNames(g)).toEqual(['Island', 'Forest', 'Plains', 'Swamp', 'Mountain']);
    g.expect.zone('SYNTHETIC Scry Zero', 'graveyard', { seat: 0 });
  });

  test('an empty library: no question, but the scry still happened (CR 701.22d)', () => {
    const g = libraryGame('SYNTHETIC Scry Two', 0);
    castAndResolve(g, 'SYNTHETIC Scry Two');
    g.expect.pending('priority', 0);
    expect(g.eventsSince(0).find((e) => e.kind === 'scried')).toEqual({
      kind: 'scried',
      seat: 0,
      top: 0,
      bottom: 0,
    });
    g.expect.zone('SYNTHETIC Scry Two', 'graveyard', { seat: 0 });
  });
});

describe('surveil (CR 701.25a)', () => {
  test('asks with the top and graveyard piles', () => {
    const g = libraryGame('SYNTHETIC Surveil Two', 5, 'B');
    castAndResolve(g, 'SYNTHETIC Surveil Two');
    g.expect.pending('arrangeCards', 0);
    const d = arrangeDecision(g);
    expect(d.purpose).toBe('surveil');
    expect(d.cards).toEqual([g.id('a'), g.id('b')]);
    expect(d.piles).toEqual(['top', 'graveyard']);
  });

  test('one card on top, one into the graveyard: a zone change, so a new object (CR 400.7)', () => {
    const g = libraryGame('SYNTHETIC Surveil Two', 5, 'B');
    castAndResolve(g, 'SYNTHETIC Surveil Two');
    const mark = g.mark();
    const islandBefore = g.id('a');
    g.act(0).arrange({ top: ['b'], other: ['a'] });
    expect(libraryNames(g)).toEqual(['Forest', 'Plains', 'Swamp', 'Mountain']);
    expect(graveyardNames(g)).toContain('Island');
    g.expect.zone('Island', 'graveyard', { seat: 0 });
    expect(g.state.objects[islandBefore]).toBeUndefined();
    const events = g.eventsSince(mark);
    // The surveil event first, then the zone change it caused (CR 701.25a).
    const relevant = events.filter((e) => e.kind === 'surveiled' || e.kind === 'zoneChanged');
    expect(relevant[0]).toEqual({ kind: 'surveiled', seat: 0, top: 1, toGraveyard: 1 });
    expect(relevant[1]).toMatchObject({
      kind: 'zoneChanged',
      from: islandBefore,
      fromZone: 'library',
      toZone: 'graveyard',
    });
    g.expect.pending('priority', 0);
    g.expect.invariants();
  });

  test('surveil 3: the order of the cards kept on top, and the cards for the graveyard', () => {
    const g = libraryGame('SYNTHETIC Surveil Three', 5, 'BC');
    castAndResolve(g, 'SYNTHETIC Surveil Three');
    g.act(0).arrange({ top: ['c', 'a'], other: ['b'] });
    expect(libraryNames(g)).toEqual(['Plains', 'Island', 'Swamp', 'Mountain']);
    expect(graveyardNames(g)).toContain('Forest');
    expect(g.eventsSince(0).find((e) => e.kind === 'surveiled')).toEqual({
      kind: 'surveiled',
      seat: 0,
      top: 2,
      toGraveyard: 1,
    });
  });

  test('every card into the graveyard, in the order chosen (their zone changes follow it)', () => {
    const g = libraryGame('SYNTHETIC Surveil Three', 5, 'BC');
    castAndResolve(g, 'SYNTHETIC Surveil Three');
    const mark = g.mark();
    const [a, b, c] = [g.id('a'), g.id('b'), g.id('c')];
    g.act(0).arrange({ top: [], other: ['c', 'a', 'b'] });
    expect(libraryNames(g)).toEqual(['Swamp', 'Mountain']);
    const moved = g
      .eventsSince(mark)
      .flatMap((e) => (e.kind === 'zoneChanged' && e.toZone === 'graveyard' ? [e.from] : []));
    // The spell itself goes to the graveyard last; the three cards before it in the order given.
    expect(moved.slice(0, 3)).toEqual([c, a, b]);
  });

  test('a creature card surveilled into the graveyard is a card in the graveyard, not a death', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Surveil Two')
      .pool('B')
      .library('Grizzly Bears', { label: 'bears' })
      .library('Island', { label: 'island' })
      .library('Forest')
      .seat(1)
      .library('Llanowar Elves')
      .build();
    castAndResolve(g, 'SYNTHETIC Surveil Two');
    const bearsBefore = g.id('bears');
    g.act(0).arrange({ top: ['island'], other: ['bears'] });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0, count: 1 });
    g.expect.noEvent({ kind: 'died' });
    const change = g.events.find((e) => e.kind === 'zoneChanged' && e.fromZone === 'library');
    expect(change).toMatchObject({ toZone: 'graveyard', from: bearsBefore });
    expect(libraryNames(g)).toEqual(['Island', 'Forest']);
  });

  test('surveil 0 asks nothing and emits no surveiled event (CR 701.25c)', () => {
    const g = libraryGame('SYNTHETIC Surveil Zero', 5, 'B');
    castAndResolve(g, 'SYNTHETIC Surveil Zero');
    g.expect.pending('priority', 0);
    g.expect.noEvent({ kind: 'surveiled' });
    expect(libraryNames(g)).toHaveLength(5);
  });

  test('an empty library: no question, the surveil event still happens (CR 701.25d)', () => {
    const g = libraryGame('SYNTHETIC Surveil Two', 0, 'B');
    castAndResolve(g, 'SYNTHETIC Surveil Two');
    g.expect.pending('priority', 0);
    expect(g.eventsSince(0).find((e) => e.kind === 'surveiled')).toEqual({
      kind: 'surveiled',
      seat: 0,
      top: 0,
      toGraveyard: 0,
    });
  });

  test('a one-card library: surveil 2 offers the one card', () => {
    const g = libraryGame('SYNTHETIC Surveil Two', 1, 'B');
    castAndResolve(g, 'SYNTHETIC Surveil Two');
    expect(arrangeDecision(g).cards).toEqual([g.id('a')]);
    g.act(0).arrange({ top: [], other: ['a'] });
    expect(libraryNames(g)).toEqual([]);
    g.expect.zone('Island', 'graveyard', { seat: 0 });
  });
});

describe('as a triggered ability (CR 603.3)', () => {
  test('"When this creature enters, scry 2" goes on the stack, then its controller arranges', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Seer Of The Door')
      .pool('UC')
      .library('Island', { label: 'a' })
      .library('Forest', { label: 'b' })
      .library('Plains', { label: 'c' })
      .seat(1)
      .library('Llanowar Elves')
      .build();
    g.act(0).cast('SYNTHETIC Seer Of The Door', { pay: true });
    g.pass();
    g.pass();
    // The creature resolved; its trigger is on the stack with priority back to its controller.
    g.expect.pending('priority', 0);
    g.expect.stack(['SYNTHETIC Seer Of The Door (ability)']);
    g.pass();
    g.pass();
    g.expect.pending('arrangeCards', 0);
    g.act(0).arrange({ top: ['b'], other: ['a'] });
    expect(libraryNames(g)).toEqual(['Forest', 'Plains', 'Island']);
    g.expect.pending('priority', 0);
  });

  test('"When this creature enters, surveil 2": the surveil decision comes after the trigger resolves', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Grave Watcher')
      .pool('BC')
      .library('Island', { label: 'a' })
      .library('Forest', { label: 'b' })
      .library('Plains', { label: 'c' })
      .seat(1)
      .library('Llanowar Elves')
      .build();
    g.act(0).cast('SYNTHETIC Grave Watcher', { pay: true });
    g.pass();
    g.pass();
    g.pass();
    g.pass();
    g.expect.pending('arrangeCards', 0);
    expect(arrangeDecision(g).purpose).toBe('surveil');
    g.act(0).arrange({ top: ['a', 'b'] });
    expect(libraryNames(g)).toEqual(['Island', 'Forest', 'Plains']);
  });
});

describe('legal actions agree with applyAction', () => {
  const arrangements = (actions: Action[]) => actions.filter((a) => a.kind === 'arrangeCards');

  test('scry 3 lists every arrangement, each accepted, the identity and all-bottom first', () => {
    const g = libraryGame('SYNTHETIC Scry Three');
    castAndResolve(g, 'SYNTHETIC Scry Three');
    const listed = arrangements(g.legalActions(0));
    const [a, b, c] = [g.id('a'), g.id('b'), g.id('c')];
    expect(listed[0]).toEqual({ kind: 'arrangeCards', top: [a, b, c], other: [] });
    expect(listed[1]).toEqual({ kind: 'arrangeCards', top: [], other: [a, b, c] });
    // Per number of cards on top k: C(3,k) * k! * (3-k)! = 6 arrangements, for k = 0 to 3.
    expect(listed).toHaveLength(24);
    expect(new Set(listed.map((x) => JSON.stringify(x))).size).toBe(24);
    for (const action of listed) {
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    }
    expect(g.legalActions(0).at(-1)).toEqual({ kind: 'concede' });
    expect(g.legalActions(1)).toEqual([]);
  });

  test('surveil 2 lists the identity and the all-graveyard answer, each accepted', () => {
    const g = libraryGame('SYNTHETIC Surveil Two', 5, 'B');
    castAndResolve(g, 'SYNTHETIC Surveil Two');
    const listed = arrangements(g.legalActions(0));
    const [a, b] = [g.id('a'), g.id('b')];
    expect(listed[0]).toEqual({ kind: 'arrangeCards', top: [a, b], other: [] });
    expect(listed[1]).toEqual({ kind: 'arrangeCards', top: [], other: [a, b] });
    for (const action of listed) {
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    }
  });

  test('scry 5 lists a few representative arrangements, each accepted', () => {
    const g = libraryGame('SYNTHETIC Scry Five', 6, 'UCC');
    castAndResolve(g, 'SYNTHETIC Scry Five');
    const listed = arrangements(g.legalActions(0));
    expect(listed.length).toBeGreaterThanOrEqual(2);
    const ids: ObjectId[] = ['a', 'b', 'c', 'd', 'e'].map((l) => g.id(l));
    expect(listed[0]).toEqual({ kind: 'arrangeCards', top: ids, other: [] });
    expect(listed[1]).toEqual({ kind: 'arrangeCards', top: [], other: ids });
    for (const action of listed) {
      expect(applyAction(g.state, 0, action).ok, JSON.stringify(action)).toBe(true);
    }
  });
});

describe('determinism', () => {
  const play = (answer: 'keep' | 'bottom') => {
    const g = libraryGame('SYNTHETIC Scry Two');
    castAndResolve(g, 'SYNTHETIC Scry Two');
    if (answer === 'keep') g.act(0).arrange({ top: ['a', 'b'] });
    else g.act(0).arrange({ top: [], other: ['a', 'b'] });
    return g;
  };

  test('the same answers give the same state hash; a different arrangement gives another', () => {
    expect(play('keep').hash()).toBe(play('keep').hash());
    expect(play('bottom').hash()).toBe(play('bottom').hash());
    expect(play('keep').hash()).not.toBe(play('bottom').hash());
  });

  test('replaying the action log on a fresh scenario reproduces the state', () => {
    const first = play('bottom');
    const again = libraryGame('SYNTHETIC Scry Two');
    for (const { seat, action } of first.log) {
      again.choose(seat, action);
    }
    expect(again.hash()).toBe(first.hash());
  });
});
