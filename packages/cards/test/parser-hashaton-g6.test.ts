// The Hashaton deck program (issue 31), group 6 (D-1170, D-1171, provisional): Serra's Emissary, "As this creature enters, choose a card type." and "You and
// creatures you control have protection from the chosen card type." The lines are the real Oracle text of the acceptance card of the golden corpus, read through
// the whole pipeline; the other lines are near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-hashaton-g6.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, read, readAll } from './parser-p5-helpers';

describe('"As this creature enters, choose a card type." (CR 614.12a, 205.2a)', () => {
  test('the real line: the engine asks the card type question', () => {
    for (const text of [
      'As ~ enters, choose a card type.',
      'As ~ enters the battlefield, choose a card type.',
    ]) {
      const parsed = readAll(text, 'creature');
      expect(parsed.abilities).toEqual([
        { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'cardType' } },
      ]);
    }
  });

  test.each([
    'As ~ enters, choose a card type',
    'As ~ enters, choose a card type other than creature.',
    'As ~ enters, choose two card types.',
    'As ~ enters, you may choose a card type.',
    'As ~ enters, choose a supertype.',
  ])('is not read: %s', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"You and creatures you control have protection from the chosen card type." (CR 702.16)', () => {
  test('the real line: protection for the player and for the creatures, two static abilities', () => {
    const parsed = readAll(
      'You and creatures you control have protection from the chosen card type.',
      'creature',
    );
    expect(parsed.abilities).toEqual([
      { kind: 'static', static: { kind: 'playerProtection', from: 'chosenCardType' } },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'filter', filter: { types: ['creature'], controller: 'you' } },
          keyword: { kind: 'protection', from: 'chosenCardType' },
        },
      },
    ]);
  });

  test('the whole card reads: flying, the question and both protections', () => {
    const parsed = readAll(
      'Flying\nAs ~ enters, choose a card type.\nYou and creatures you control have protection from the chosen card type.',
      'creature',
    );
    expect(parsed.abilities).toHaveLength(4);
    expect(parsed.abilities[1]).toEqual({
      kind: 'replacement',
      replacement: { kind: 'asEntersChoose', what: 'cardType' },
    });
  });

  test.each([
    'You and creatures you control have protection from the chosen card type',
    'You have protection from the chosen card type.',
    'Creatures you control have protection from the chosen card type.',
    'You and other creatures you control have protection from the chosen card type.',
    'You and creatures your opponents control have protection from the chosen card type.',
    'You and creatures you control have protection from the chosen type.',
    'You and creatures you control have protection from the chosen color.',
    'You and creatures you control have protection from artifacts.',
    'You and creatures you control have protection from the chosen card type until end of turn.',
    'You and creatures you control have protection from the chosen card type as long as you control a Dragon.',
  ])('is not read: %s', (text) => {
    // none of the line is run: no ability, and the line is reported as dropped
    expect(read(text, 'creature').abilities).toEqual([]);
  });
});
