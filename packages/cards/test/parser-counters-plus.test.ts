// "If one or more +1/+1 counters would be put on <a permanent you control>, that many plus one +1/+1 counters are put on it instead." (the Quandrix Unlimited deck, group A):
// the engine's `countersPlus` read by the grammar (replacement.counters-plus). The lines of `REAL` are the real Oracle wordings of Hardened Scales, Benevolent Hydra, Kami of
// Whispered Hopes and Ozolith, the Shattered Spire (names replaced by ~ where they said their own); every other line is SYNTHETIC: the same shape over other numbers and the
// near misses the grammar must not read. The engine runs what is lowered in packages/engine/test/scenario-xx-counters-plus.test.ts.
import { syntheticCard, validateCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, readAll } from './parser-p5-helpers';

const abilities = (text: string, type: FaceType = 'creature') => readAll(text, type).abilities;
const drop = (text: string, type: FaceType = 'creature') => dropped(text, type);

const replacement = (what: Record<string, unknown>, extra = 1) => [
  { kind: 'replacement', replacement: { kind: 'countersPlus', what, counter: '+1/+1', extra } },
];

const REAL: readonly [string, FaceType, string, Record<string, unknown>][] = [
  [
    'Hardened Scales',
    'enchantment',
    'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.',
    { types: ['creature'], controller: 'you' },
  ],
  [
    'Benevolent Hydra',
    'creature',
    'If one or more +1/+1 counters would be put on another creature you control, that many plus one +1/+1 counters are put on it instead.',
    { types: ['creature'], controller: 'you', other: true },
  ],
  [
    'Kami of Whispered Hopes',
    'creature',
    'If one or more +1/+1 counters would be put on a permanent you control, that many plus one +1/+1 counters are put on that permanent instead.',
    { controller: 'you' },
  ],
  [
    'Ozolith, the Shattered Spire',
    'artifact',
    'If one or more +1/+1 counters would be put on an artifact or creature you control, that many plus one +1/+1 counters are put on it instead.',
    { anyOf: [{ types: ['artifact'] }, { types: ['creature'] }], controller: 'you' },
  ],
];

describe('the real wordings', () => {
  test.each(REAL)('%s', (_name, type, text, what) => {
    expect(abilities(text, type)).toEqual(replacement(what));
  });

  test('what is lowered is a valid card for the engine', () => {
    const card = syntheticCard('SYNTHETIC Growth Scales');
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    for (const [, type, text] of REAL) {
      const [ability] = abilities(text, type);
      if (ability === undefined) throw new Error('not read');
      expect(
        validateCard({ ...card, faces: [{ ...face, abilities: [ability] }] } as never),
      ).toEqual([]);
    }
  });

  test('a number word or a digit for the extra counters', () => {
    const line = (n: string) =>
      `If one or more +1/+1 counters would be put on a creature you control, that many plus ${n} +1/+1 counters are put on it instead.`;
    for (const n of ['two', '2']) {
      expect(abilities(line(n))).toEqual(
        replacement({ types: ['creature'], controller: 'you' }, 2),
      );
    }
  });

  test('it reads between other abilities of the same card', () => {
    const [flying, scales] = abilities(`Flying\n${REAL[1]?.[2]}`, 'creature');
    expect(flying).toEqual({ kind: 'keyword', keyword: { kind: 'flying' } });
    expect(scales).toEqual(replacement(REAL[1]?.[3] ?? {})[0]);
  });
});

describe('what is not read', () => {
  test.each([
    'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead',
    'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it.',
    'If one or more charge counters would be put on a creature you control, that many plus one charge counters are put on it instead.',
    'If one or more +1/+1 counters would be put on a creature an opponent controls, that many plus one +1/+1 counters are put on it instead.',
    'If one or more +1/+1 counters would be put on a creature, that many plus one +1/+1 counters are put on it instead.',
    'If one or more +1/+1 counters would be put on creatures you control, that many plus one +1/+1 counters are put on them instead.',
    'If one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on it instead.',
    'If one or more +1/+1 counters would be put on a creature you control, that many plus X +1/+1 counters are put on it instead.',
    'If one or more +1/+1 counters would be put on a creature you control, that many plus 0 +1/+1 counters are put on it instead.',
    'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on target creature instead.',
    'If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead if you control a Dragon.',
  ])('%s', (text) => {
    expect(drop(text).ability).toBeDefined();
  });
});
