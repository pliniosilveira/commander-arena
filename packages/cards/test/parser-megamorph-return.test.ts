// Deathmist Raptor's two lines (CR 702.37b, 603.2, 113.6b, 708.2a, 708.3): "Whenever a permanent you control is turned face up, you may return this card from your graveyard to the
// battlefield face up or face down." lowers to a graveyard-only turned-face-up trigger whose effect is the controller's choice between the two returns (`chooseOne`; face down is the
// engine's `faceDownAs` `morph`), and "Megamorph {4}{G}" to the morph cost with the megamorph flag. The real text is Deathmist Raptor's; the engine runs the same ASTs in
// packages/engine/test/scenario-xx-megamorph.test.ts.
import { describe, expect, test } from 'vitest';
import { read, readAll } from './parser-p5-helpers';

const TRIGGER =
  'Whenever a permanent you control is turned face up, you may return this card from your graveyard to the battlefield face up or face down.';
const THIS = { kind: 'this' };
const RETURN = { kind: 'moveToZone', objects: THIS, to: 'battlefield', controller: 'owner' };

describe('"return this card from your graveyard to the battlefield face up or face down"', () => {
  test('the trigger works from the graveyard and the controller chooses the face', () => {
    const face = readAll(TRIGGER, 'creature');
    expect(face.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'turnedFaceUp', what: { controller: 'you' } },
        optional: true,
        functionsIn: 'graveyard',
        effect: {
          kind: 'chooseOne',
          options: [
            { label: 'face up', effect: RETURN },
            { label: 'face down', effect: { ...RETURN, faceDownAs: 'morph' } },
          ],
        },
      },
    ]);
  });

  test('the whole text of Deathmist Raptor is read', () => {
    const face = readAll(
      `Deathtouch\n${TRIGGER}\nMegamorph {4}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)`,
      'creature',
    );
    expect(face.abilities).toHaveLength(2);
    expect(face.alternativeCosts).toEqual([
      { kind: 'morph', megamorph: true, cost: [{ kind: 'mana', symbols: ['4', 'G'] }] },
    ]);
  });

  test.each([
    'Whenever a permanent you control is turned face up, you may return this card from your graveyard to the battlefield tapped face up or face down.',
    'Whenever a permanent you control is turned face up, you may return this card from your graveyard to your hand face up or face down.',
    'Whenever a permanent you control is turned face up, you may return this card from your graveyard to the battlefield face up.',
    'Whenever a permanent you control is turned face up, you may return this card from your graveyard to the battlefield face up or face down with a +1/+1 counter on it.',
  ])('a near miss is not read: %s', (text) => {
    expect(read(text, 'creature').abilities).toEqual([]);
  });
});
