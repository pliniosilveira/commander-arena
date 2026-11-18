// Issue 89 (Silverquill Influence): Shadrix Silverquill's modal triggered ability, "you may choose two. Each mode must target a different player." (CR 700.2, 700.2b, 700.2d),
// through the whole pipeline, the near misses the grammar must not read, and the features the lowering needs. The engine runs the same node in
// packages/engine/test/scenario-xx-shadrix-modes.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read, readAll, withoutFeature } from './parser-p5-helpers';

const TEXT =
  'At the beginning of combat on your turn, you may choose two. Each mode must target a different player.\n• Target player creates a 2/1 white and black Inkling creature token with flying.\n• Target player draws a card and loses 1 life.\n• Target player puts a +1/+1 counter on each creature they control.';

describe('Shadrix Silverquill modes', () => {
  test('the real text: a modal trigger that chooses none or two modes with different targets', () => {
    const [ability] = readAll(TEXT, 'creature', ['Elder', 'Dragon']).abilities;
    expect(ability?.kind).toBe('triggered');
    if (ability?.kind !== 'triggered') return;
    expect(ability.chooseModes).toEqual({
      min: 0,
      max: 2,
      allOrNone: true,
      differentTargets: true,
    });
    expect(ability.modes).toHaveLength(3);
    expect(ability.modes?.every((m) => m.targets?.length === 1)).toBe(true);
  });

  test.each([
    TEXT.replace('you may choose two', 'you may choose three'),
    TEXT.replace('you may choose two. ', ''),
    TEXT.replace('different player', 'different creature'),
    TEXT.replace('you may choose two', 'choose two'),
    TEXT.replace('At the beginning of combat on your turn, ', 'Choose two. '),
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(read(text, 'creature').unparsed.length).toBeGreaterThan(0);
  });

  test.each(['ability:modeAllOrNone', 'ability:modeDifferentTargets'] as const)(
    'without %s in the engine the ability is not read',
    (feature) => {
      expect(withoutFeature(feature, TEXT, 'creature', ['Elder', 'Dragon']).reason).toBeDefined();
    },
  );
});
