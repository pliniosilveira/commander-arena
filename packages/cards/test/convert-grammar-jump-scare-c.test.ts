// Jump Scare! deck (issue 108), group C: what the grammar makes of the conditional statics, and what it leaves unsupported.
// Pins: CR 613.1d and 205.1a (layer 4), CR 122.1 (counters), CR 601.3b (cast as though it had flash), CR 401.5 (the top card of the library), CR 208.1 (power), CR 508.1a (attacking).
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const abilitiesOf = (def: ReturnType<typeof parsed>) => def.faces[0]?.abilities ?? [];

describe('lowering', () => {
  test('"As long as ~ has a slumber counter on it, it\'s a land." sets the card types under a counter test', () => {
    const def = parsed(
      'SYNTHETIC Slumbering Isle',
      'Legendary Creature — Kraken',
      "As long as ~ has a slumber counter on it, it's a land.",
      { power: '12', toughness: '12' },
    );
    expect(abilitiesOf(def)).toEqual([
      {
        kind: 'static',
        static: { kind: 'setTypes', subject: { kind: 'this' }, types: ['land'] },
        condition: { kind: 'thisMatches', filter: { hasCounter: 'slumber' } },
      },
    ]);
  });

  test('Coven: three creatures with different powers condition the cast from the top of the library', () => {
    const def = parsed(
      'SYNTHETIC Autumn Augur',
      'Creature — Human Druid',
      'Coven — As long as you control three or more creatures with different powers, you may cast creature spells from the top of your library.',
      { power: '2', toughness: '3' },
    );
    expect(abilitiesOf(def)).toEqual([
      {
        kind: 'static',
        static: { kind: 'castFromTopOfLibrary', spells: { types: ['creature'] } },
        condition: {
          kind: 'controlsDifferentPowers',
          filter: { types: ['creature'] },
          count: 3,
        },
      },
    ]);
  });

  test('the parity of the power of ~ conditions the permission to cast as though it had flash', () => {
    const def = parsed(
      'SYNTHETIC Odd Memory',
      'Legendary Creature — Illusion',
      `As long as ~'s power is even, you may cast noncreature spells as though they had flash.
As long as ~'s power is odd, you may cast creature spells as though they had flash.`,
      { power: '2', toughness: '2' },
    );
    expect(abilitiesOf(def)).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'castAsThoughFlash',
          spells: { notTypes: ['creature'], controller: 'you' },
        },
        condition: { kind: 'thisPowerParity', parity: 'even' },
      },
      {
        kind: 'static',
        static: { kind: 'castAsThoughFlash', spells: { types: ['creature'], controller: 'you' } },
        condition: { kind: 'thisPowerParity', parity: 'odd' },
      },
    ]);
  });

  test('"unless you have seven or more cards in hand" lifts the restriction for the cards in your hand', () => {
    const def = parsed(
      'SYNTHETIC Mindful God',
      'Legendary Creature — God',
      "~ can't attack or block unless you have seven or more cards in hand.",
      { power: '5', toughness: '5' },
    );
    expect(abilitiesOf(def)).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'restrictionUnless',
          subject: { kind: 'this' },
          restrictions: ['cantAttack', 'cantBlock'],
          unless: {
            kind: 'amountIs',
            amount: {
              kind: 'countOf',
              filter: { zone: 'hand', controller: 'you' },
            },
            compare: { cmp: 'atLeast', value: 7 },
          },
        },
      },
    ]);
  });

  test('"Draw a card, then you may return a land you control to its owner\'s hand." draws, then offers the return', () => {
    const def = parsed(
      'SYNTHETIC Mindful God',
      'Legendary Creature — God',
      "{3}{U}: Draw a card, then you may return a land you control to its owner's hand.",
      { power: '5', toughness: '5' },
    );
    expect(abilitiesOf(def)).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['3', 'U'] }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'draw', player: { kind: 'you' }, count: 1 },
            {
              kind: 'may',
              effect: {
                kind: 'moveToZone',
                objects: { kind: 'choose', filter: { types: ['land'], controller: 'you' } },
                to: 'hand',
              },
            },
          ],
        },
      },
    ]);
  });
});

describe('what stays unsupported, with its reason', () => {
  const importText = (text: string) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Zed',
        typeLine: 'Creature — Elf',
        oracleText: text,
        power: '2',
        toughness: '2',
      }),
    );

  test.each([
    // A layer 7 result would depend on the powers it reads (CR 613.8).
    'As long as you control three or more creatures with different powers, ~ gets +1/+1.',
    "As long as ~'s power is even, ~ has flying.",
    // The type effect reads no characteristic: a type or a count of counters is another condition.
    "As long as ~ is a creature, it's a land.",
  ])('%s', (text) => {
    const imported = importText(text);
    expect(imported.support.status).toBe('unsupported');
  });

  test.each([
    // Different powers needs two or more permanents, and "different toughnesses" is another condition.
    'As long as you control one or more creatures with different powers, you may cast creature spells from the top of your library.',
    'As long as you control three or more creatures with different toughnesses, you may cast creature spells from the top of your library.',
    // Only the controller may cast as though it had flash here.
    "As long as ~'s power is even, any player may cast noncreature spells as though they had flash.",
    // "then you may return" names a permanent of the controller, not a target.
    "{3}{U}: Draw a card, then you may return target land to its owner's hand.",
  ])('%s', (text) => {
    expect(importText(text).support.unparsed.length).toBeGreaterThan(0);
  });
});
