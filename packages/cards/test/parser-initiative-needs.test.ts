// The initiative (CR 726): a line of the grammar whose engine feature is not listed is reported as "recognised, not runnable" naming that feature, never built (D-068). The engine
// lists every feature below, so the support check is replaced here by one that lacks one feature at a time, and the lowering must name it. The line is the real Oracle
// sentence of From the Catacombs.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { read, withoutFeature } from './parser-p5-helpers';

const TAKE = 'You take the initiative.';

describe('the initiative names the feature the engine lacks (CR 726)', () => {
  test('without effect:takeInitiative', () => {
    const missing = withoutFeature('effect:takeInitiative', TAKE, 'sorcery');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('effect:takeInitiative');
  });

  test('a blocked line leaves the spell with nothing (never half-executed)', () => {
    BLOCKED.clear();
    BLOCKED.add('effect:takeInitiative');
    try {
      const parsed = read(TAKE, 'sorcery');
      expect(parsed.unparsed.length).toBeGreaterThan(0);
      expect(parsed.spell ?? null).toBeNull();
    } finally {
      BLOCKED.clear();
    }
  });

  test('with the feature the line is read as the engine’s takeInitiative of the controller', () => {
    const parsed = read(TAKE, 'sorcery');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.spell?.effect).toEqual({ kind: 'takeInitiative', player: { kind: 'you' } });
  });
});
