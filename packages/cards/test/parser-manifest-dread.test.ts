// "Manifest dread" (CR 701.62a, Duskmourn): "Look at the top two cards of your library. Manifest one of them, then put the cards you looked at that were not manifested this way into
// your graveyard." Read by `effect.manifest-dread` and lowered to the engine's `lookAtTop` with `take.to` `manifest` (and, said "twice", two of them one after the other, CR 701.40e).
import { describe, expect, test } from 'vitest';
import { read, readAll, spellEffect } from './parser-p5-helpers';

const DREAD = {
  kind: 'lookAtTop',
  count: 2,
  take: { filter: {}, max: 1, min: 1, hidden: true, to: 'manifest' },
  rest: 'graveyard',
};

describe('what the lowering builds', () => {
  test('"Manifest dread." is a look at the top two cards, one manifested, the rest in the graveyard', () => {
    expect(spellEffect('Manifest dread.', 'sorcery')).toEqual(DREAD);
  });

  test('as the effect of an enters trigger (Growing Dread shape)', () => {
    const face = readAll('When ~ enters, manifest dread.', 'enchantment');
    expect(face.abilities).toMatchObject([{ kind: 'triggered', effect: DREAD }]);
    expect(face.unparsed).toEqual([]);
  });

  test('"manifest dread twice" repeats it two times (They Came from the Pipes shape)', () => {
    const face = readAll('When ~ enters, manifest dread twice.', 'enchantment');
    expect(face.abilities).toMatchObject([
      { kind: 'triggered', effect: { kind: 'repeat', times: 2, effect: DREAD } },
    ]);
  });

  test('after another instruction of the same ability (Glitch Interpreter shape)', () => {
    const face = readAll('When ~ enters, draw a card, then manifest dread.', 'creature');
    expect(face.abilities).toMatchObject([
      { kind: 'triggered', effect: { kind: 'sequence', effects: [{ kind: 'draw' }, DREAD] } },
    ]);
  });
});

describe('what stays unread', () => {
  test.each([
    'When ~ enters, manifest dreads.',
    'When ~ enters, manifest dread three times.',
    'When ~ enters, target player manifests dread.',
  ])('%s', (text) => {
    expect(read(text, 'creature').unparsed).not.toEqual([]);
  });

  test('the older manifest is still the top card', () => {
    expect(read('manifest the top card of your library')).toBeDefined();
  });
});
