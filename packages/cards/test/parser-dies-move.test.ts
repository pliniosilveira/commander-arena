// "When ~ dies, put it on the bottom of its owner's library" and "When ~ dies, return it to its owner's hand at the beginning of the next end step":
// the lowering of a move of the card a creature became (CR 400.7, 603.10a, 401.3) and of its delayed return (CR 603.7, 603.7c). The wording is that of the
// real Oracle text with the name replaced by ~ (issue #104 cards); the cards that use them are checked by the engine in
// convert-grammar-engine-dies-move.test.ts. A line the lowering must refuse (a return that is not about a card of a dying creature) is dropped, never half run.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const THIS = { kind: 'this' } as const;
const dies = { kind: 'dies', what: THIS } as const;

describe('a dying creature moves itself to a library', () => {
  test.each([
    ['bottom', "When ~ dies, put it on the bottom of its owner's library."],
    ['top', "When ~ dies, put it on top of its owner's library."],
  ] as const)('%s', (position, text) => {
    expect(readAll(text, 'creature').abilities).toEqual([
      {
        kind: 'triggered',
        trigger: dies,
        effect: { kind: 'moveToZone', objects: { kind: 'thisCard' }, to: 'library', position },
      },
    ]);
  });
});

describe('a dying creature returns itself to its owner’s hand at the next end step', () => {
  test('the delayed trigger moves the card the creature became (triggerCard)', () => {
    expect(
      readAll(
        "When ~ dies, return it to its owner's hand at the beginning of the next end step.",
        'creature',
      ).abilities,
    ).toEqual([
      {
        kind: 'triggered',
        trigger: dies,
        effect: {
          kind: 'delayedTrigger',
          at: { step: 'endStep', whose: 'each' },
          effect: { kind: 'moveToZone', objects: { kind: 'triggerCard' }, to: 'hand' },
        },
      },
    ]);
  });

  test('outside a dies trigger "it" is not the dying card: dropped', () => {
    expect(
      dropped(
        "When ~ enters, return it to its owner's hand at the beginning of the next end step.",
        'creature',
      ).text,
    ).toContain('return it');
  });
});
