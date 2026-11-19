// Ureni of the Unwritten: "Whenever Ureni enters or attacks, look at the top eight cards of your library. You may put a Dragon creature card from among them onto the battlefield. Put the
// rest on the bottom of your library in a random order." read through the whole pipeline (CR 401.2, 401.4).
import { describe, expect, test } from 'vitest';
import { normalizeOracleText } from '../src/index';
import { dropped, readAll } from './parser-p5-helpers';

const effect =
  'look at the top eight cards of your library. You may put a Dragon creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order.';

describe('Ureni of the Unwritten (CR 401.2)', () => {
  test('lowers to lookAtTop onto the battlefield, for both events', () => {
    const abilities = readAll(`Whenever ~ enters or attacks, ${effect}`, 'creature').abilities;
    expect(abilities).toHaveLength(2);
    for (const a of abilities) {
      expect(a).toMatchObject({
        kind: 'triggered',
        effect: {
          kind: 'lookAtTop',
          count: 8,
          take: {
            filter: { subtypes: ['Dragon'], types: ['creature'] },
            max: 1,
            to: 'battlefield',
          },
          rest: 'bottomRandom',
        },
      });
    }
  });

  test('a legendary creature "<Name> of the <Title>" calls itself by its first word; a planeswalker type does not', () => {
    expect(
      normalizeOracleText('When Ureni enters, draw a card.', {
        name: 'Ureni of the Unwritten',
        legendary: true,
        creature: true,
      }),
    ).toBe('When ~ enters, draw a card.');
    expect(
      normalizeOracleText('When Ureni enters, draw a card.', {
        name: 'Ureni of the Unwritten',
        legendary: true,
      }),
    ).toBe('When Ureni enters, draw a card.');
  });

  test.each([
    [effect.replace('in a random order', 'in any order')],
    [effect.replace('onto the battlefield', 'into your hand')],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(`Whenever ~ attacks, ${text}`, 'creature').stoppedAt).toBeDefined();
  });
});
