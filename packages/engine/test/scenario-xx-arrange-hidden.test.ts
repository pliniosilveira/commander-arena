// Hidden information and invalid answers of the arrangeCards decision (D-091).
// Pins: CR 401.2 (nobody may know the order of a library), CR 701.22a and 701.25a (the player who
// looks sees the cards), and the engine's check that every card looked at is placed exactly once.
// All cards are SYNTHETIC (src/cards/fixtures/synthetic-library.ts) or basic lands.
import { describe, expect, test } from 'vitest';
import { type Action, applyAction, getView } from '../src/index';
import { arrangeDecision, castAndResolve, libraryGame, libraryNames } from './scry-helpers';

describe('who sees the cards looked at (CR 401.2)', () => {
  test('the player who scries sees them, in the decision and as card views', () => {
    const g = libraryGame('SYNTHETIC Scry Two');
    castAndResolve(g, 'SYNTHETIC Scry Two');
    const view = g.view(0);
    expect(view.pending?.kind).toBe('arrangeCards');
    expect(view.pendingCards?.map((c) => c.name)).toEqual(['Island', 'Forest']);
    expect(view.pendingCards?.map((c) => c.id)).toEqual([g.id('a'), g.id('b')]);
    expect(view.waitingOn).toBeUndefined();
  });

  test('the other seat sees neither the card ids nor the names, only that a scry is going on', () => {
    const g = libraryGame('SYNTHETIC Scry Two');
    castAndResolve(g, 'SYNTHETIC Scry Two');
    const view = g.view(1);
    expect(view.pending).toBeNull();
    expect(view.pendingCards).toBeUndefined();
    expect(view.decidingSeat).toBe(0);
    expect(view.waitingOn).toEqual({
      seat: 0,
      purpose: 'scry',
      sourceName: 'SYNTHETIC Scry Two',
    });
    const text = JSON.stringify(view);
    // The two cards looked at, and the next three of the library, are in nobody else's view.
    for (const label of ['a', 'b', 'c', 'd', 'e']) {
      expect(text, label).not.toContain(`"${g.id(label)}"`);
    }
    for (const name of ['Island', 'Forest', 'Plains', 'Swamp', 'Mountain']) {
      expect(text, name).not.toContain(name);
    }
    // They know only how many cards the library holds.
    expect(view.seats[0]?.libraryCount).toBe(5);
    expect(view.seats[0]?.hand).toBeNull();
    expect(g.legalActions(1)).toEqual([]);
  });

  test('a surveil is hidden the same way: the purpose is told, the cards are not', () => {
    const g = libraryGame('SYNTHETIC Surveil Two', 5, 'B');
    castAndResolve(g, 'SYNTHETIC Surveil Two');
    expect(g.view(1).waitingOn?.purpose).toBe('surveil');
    expect(g.view(1).pendingCards).toBeUndefined();
    expect(JSON.stringify(g.view(1))).not.toContain('Island');
  });

  test('a reordering is hidden the same way', () => {
    const g = libraryGame('SYNTHETIC Reorder Three');
    castAndResolve(g, 'SYNTHETIC Reorder Three');
    expect(g.view(1).waitingOn?.purpose).toBe('reorder');
    expect(g.view(1).pendingCards).toBeUndefined();
  });

  test('the scried event carries counts only, so the log never names the cards', () => {
    const g = libraryGame('SYNTHETIC Scry Two');
    castAndResolve(g, 'SYNTHETIC Scry Two');
    const mark = g.mark();
    g.act(0).arrange({ top: ['b'], other: ['a'] });
    const scried = g.eventsSince(mark).find((e) => e.kind === 'scried');
    expect(scried).toEqual({ kind: 'scried', seat: 0, top: 1, bottom: 1 });
    const text = JSON.stringify(scried);
    expect(text).not.toContain(g.id('a'));
    // The other seat's view after the answer shows no card of that library either.
    const after = JSON.stringify(getView(g.state, 1));
    for (const name of ['Island', 'Forest', 'Plains', 'Swamp', 'Mountain']) {
      expect(after, name).not.toContain(name);
    }
  });

  test('a surveiled card is public once it is in the graveyard', () => {
    const g = libraryGame('SYNTHETIC Surveil Two', 5, 'B');
    castAndResolve(g, 'SYNTHETIC Surveil Two');
    g.act(0).arrange({ top: ['b'], other: ['a'] });
    expect(g.view(1).seats[0]?.graveyard.map((c) => c.name)).toContain('Island');
    expect(JSON.stringify(g.view(1))).not.toContain('Forest');
  });
});

describe('answers that do not place every card exactly once are refused', () => {
  const refused = (g: ReturnType<typeof libraryGame>, action: Action) => {
    const before = g.hash();
    const r = applyAction(g.state, 0, action);
    expect(r.ok, JSON.stringify(action)).toBe(false);
    // Nothing changed: the decision is still pending.
    expect(g.hash()).toBe(before);
    g.expect.pending('arrangeCards', 0);
  };

  test('a card twice, in one pile or in both', () => {
    const g = libraryGame('SYNTHETIC Scry Two');
    castAndResolve(g, 'SYNTHETIC Scry Two');
    const [a, b] = [g.id('a'), g.id('b')];
    refused(g, { kind: 'arrangeCards', top: [a, a], other: [] });
    refused(g, { kind: 'arrangeCards', top: [a, b], other: [a] });
    refused(g, { kind: 'arrangeCards', top: [a], other: [a, b] });
  });

  test('a card missing', () => {
    const g = libraryGame('SYNTHETIC Scry Two');
    castAndResolve(g, 'SYNTHETIC Scry Two');
    const [a] = [g.id('a')];
    refused(g, { kind: 'arrangeCards', top: [a], other: [] });
    refused(g, { kind: 'arrangeCards', top: [], other: [] });
  });

  test('a card that was not among those looked at (the third of the library, or a hand card)', () => {
    const g = libraryGame('SYNTHETIC Scry Two');
    castAndResolve(g, 'SYNTHETIC Scry Two');
    const [a, b, c] = [g.id('a'), g.id('b'), g.id('c')];
    refused(g, { kind: 'arrangeCards', top: [a, c], other: [] });
    refused(g, { kind: 'arrangeCards', top: [a, b, c], other: [] });
    refused(g, { kind: 'arrangeCards', top: [a], other: [c] });
    refused(g, { kind: 'arrangeCards', top: [a, b], other: [g.id('e')] });
  });

  test('a surveil answer is checked the same way', () => {
    const g = libraryGame('SYNTHETIC Surveil Two', 5, 'B');
    castAndResolve(g, 'SYNTHETIC Surveil Two');
    const [a, b, c] = [g.id('a'), g.id('b'), g.id('c')];
    refused(g, { kind: 'arrangeCards', top: [a], other: [a] });
    refused(g, { kind: 'arrangeCards', top: [a], other: [c] });
    refused(g, { kind: 'arrangeCards', top: [b], other: [] });
  });

  test('a reordering has no second pile, and an answer of the wrong kind is refused', () => {
    const g = libraryGame('SYNTHETIC Reorder Three');
    castAndResolve(g, 'SYNTHETIC Reorder Three');
    const [a, b, c] = [g.id('a'), g.id('b'), g.id('c')];
    refused(g, { kind: 'arrangeCards', top: [a, b], other: [c] });
    refused(g, { kind: 'chooseCards', objects: [a, b, c] });
    refused(g, { kind: 'pass' });
  });

  test('only the seat that looks may answer', () => {
    const g = libraryGame('SYNTHETIC Scry Two');
    castAndResolve(g, 'SYNTHETIC Scry Two');
    const d = arrangeDecision(g);
    const r = applyAction(g.state, 1, { kind: 'arrangeCards', top: d.cards, other: [] });
    expect(r.ok).toBe(false);
    expect(libraryNames(g)).toEqual(['Island', 'Forest', 'Plains', 'Swamp', 'Mountain']);
  });

  test('a valid answer after refusals still works', () => {
    const g = libraryGame('SYNTHETIC Scry Two');
    castAndResolve(g, 'SYNTHETIC Scry Two');
    expect(g.act(0).try.action({ kind: 'arrangeCards', top: [], other: [] }).ok).toBe(false);
    g.act(0).arrange({ top: ['a'], other: ['b'] });
    expect(libraryNames(g)).toEqual(['Island', 'Plains', 'Swamp', 'Mountain', 'Forest']);
  });
});
