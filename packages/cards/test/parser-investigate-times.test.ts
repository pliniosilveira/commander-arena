// "Investigate twice / N times / X times" (issue 128, Deep Clue Sea). The lines are the real wordings of
// Wavesifter, Confirm Suspicions and Ethereal Investigator (the card data of issue 128); the rest are near misses.
// CR 701.16a (Investigate): investigating creates a Clue token, so N times creates N Clues (CR 608.2c).
import { describe, expect, test } from 'vitest';
import { dropped, readAll, spellEffect } from './parser-p5-helpers';

const CLUE = { kind: 'preset', preset: 'Clue' };

describe('investigate N times', () => {
  test('"When ~ enters, investigate twice." creates two Clues', () => {
    const read = readAll('When ~ enters, investigate twice.', 'creature', []);
    expect(read.abilities).toHaveLength(1);
    expect(read.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: { kind: 'createToken', token: CLUE, count: 2 },
    });
  });

  test('"Investigate three times." as a spell', () => {
    expect(spellEffect('Investigate three times.')).toMatchObject({
      kind: 'createToken',
      token: CLUE,
      count: 3,
    });
  });

  test('"investigate X times, where X is the number of opponents you have" counts the opponents', () => {
    const read = readAll(
      'When ~ enters, investigate X times, where X is the number of opponents you have.',
      'creature',
      [],
    );
    expect(read.abilities).toHaveLength(1);
    expect(read.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: { kind: 'createToken', token: CLUE, count: { kind: 'opponentCount' } },
    });
  });

  test('near misses stay unread', () => {
    for (const text of [
      'Investigate times.',
      'Investigate that many times.',
      'Investigate a Clue.',
    ]) {
      expect(dropped(text, 'instant', []), text).toBeTruthy();
    }
  });
});
