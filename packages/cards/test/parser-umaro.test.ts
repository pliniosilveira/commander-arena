// Umaro, Raging Yeti: "choose one at random —" (CR 700.2) of a triggered ability, through the whole pipeline, the near misses the grammar must not read, and the feature the
// lowering needs. The engine runs the same node in packages/engine/test/scenario-random-mode.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read, readAll, withoutFeature } from './parser-p5-helpers';

const TEXT =
  'At the beginning of combat on your turn, choose one at random —\n• You gain 3 life.\n• Draw a card.\n• ~ deals 2 damage to any target.';

describe('choose one at random', () => {
  test('a modal trigger whose mode is drawn by the engine', () => {
    const [ability] = readAll(TEXT, 'creature', ['Yeti']).abilities;
    expect(ability?.kind).toBe('triggered');
    if (ability?.kind !== 'triggered') return;
    expect(ability.chooseModes).toEqual({ min: 1, max: 1, random: true });
    expect(ability.modes).toHaveLength(3);
  });

  test.each([
    TEXT.replace('choose one at random', 'choose two at random'),
    TEXT.replace('choose one at random —', 'choose one at random.'),
    TEXT.replace('choose one at random', 'choose one at random or both'),
    'Choose one at random —\n• You gain 3 life.\n• Draw a card.',
  ])('another wording, or a spell, is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(read(text, 'creature').unparsed.length).toBeGreaterThan(0);
  });

  test('without ability:modeRandom in the engine the ability is not read', () => {
    expect(withoutFeature('ability:modeRandom', TEXT, 'creature', ['Yeti']).reason).toBeDefined();
  });
});
