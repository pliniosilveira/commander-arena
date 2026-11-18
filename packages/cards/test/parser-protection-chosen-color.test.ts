// Issue 89 (Silverquill Influence), "Enchanted creature has protection from the chosen color. This effect doesn't remove this Aura." (D-652; Flickering Ward) read
// through the whole pipeline: the real lines of the card, the nodes they lower to and the near misses the grammar must not read.
// The engine runs what is lowered in packages/engine/test/scenario-xx-protection-chosen-color.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const lines = [
  'Enchant creature',
  'As this Aura enters, choose a color.',
  "Enchanted creature has protection from the chosen color. This effect doesn't remove this Aura.",
];
const aura = (text: string) => readAll(text, 'enchantment', ['Aura']).abilities;

describe('"Enchanted creature has protection from the chosen color. This effect doesn\'t remove this Aura." (CR 702.16a, 702.16d)', () => {
  test('the real lines of Flickering Ward', () => {
    const abilities = aura(lines.join('\n'));
    expect(abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'color' } },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'attached', types: ['creature'] },
          keyword: { kind: 'protection', from: 'chosenColor', exceptSource: true },
        },
      },
    ]);
  });

  test('without the second sentence: protection from the chosen color alone (SYNTHETIC)', () => {
    const abilities = aura(
      [lines[0], lines[1], 'Enchanted creature has protection from the chosen color.'].join('\n'),
    );
    expect(abilities[2]).toEqual({
      kind: 'static',
      static: {
        kind: 'grantKeyword',
        subject: { kind: 'attached', types: ['creature'] },
        keyword: { kind: 'protection', from: 'chosenColor' },
      },
    });
  });

  test.each([
    ["Enchanted creature has protection from the chosen color. This effect doesn't remove Auras."],
    [
      "Enchanted creature has protection from the chosen colors. This effect doesn't remove this Aura.",
    ],
    ['Enchanted creature has protection from the chosen player.'],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(
      dropped([lines[0], lines[1], text].join('\n'), 'enchantment', ['Aura']).stoppedAt,
    ).toBeDefined();
  });
});
