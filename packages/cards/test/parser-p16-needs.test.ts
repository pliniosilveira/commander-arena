// Stage P16 (M6): a line the grammar reads but whose engine feature is not listed is reported as
// "recognised, not runnable" naming that feature, never built and never read as something else. The
// engine lists every feature the stage needs, so the support check is replaced here by one that lacks
// them, one at a time, and the lowering must name what it needs of the engine (D-068).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { type FaceType, withoutFeature } from './parser-p5-helpers';

describe('the lowerings of stage P16 name the engine feature they need (D-103)', () => {
  test.each([
    ['amount:x', 'Draw X cards.', 'sorcery'],
    ['amount:x', '~ deals X damage to any target.', 'instant'],
    ['amount:x', 'Put X +1/+1 counters on target creature.', 'sorcery'],
    ['amount:x', 'Create X Treasure tokens.', 'sorcery'],
    ['amount:x', 'Create X 1/1 white Soldier creature tokens.', 'sorcery'],
    ['amount:x', 'Scry X.', 'sorcery'],
    ['amount:x', '{X}, {T}: ~ deals X damage to target creature.', 'artifact'],
    ['ability:xCost', '{X}, {T}: ~ deals X damage to target creature.', 'artifact'],
    ['ability:xCost', '{X}{X}, {T}, Sacrifice ~: Create X Treasure tokens.', 'artifact'],
    ['ability:xCost', 'Pay X life: ~ deals X damage to any target.', 'creature'],
    ['cost:payXLife', 'Pay X life: ~ deals X damage to any target.', 'creature'],
    ['ability:xCost', 'As an additional cost to cast ~, pay X life.', 'sorcery'],
    ['cost:payXLife', 'As an additional cost to cast ~, pay X life.', 'sorcery'],
    ['amount:x', '~ enters with X +1/+1 counters on it.', 'creature'],
    ['replacement:entersWithCounters', '~ enters with X charge counters on it.', 'artifact'],
  ])('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type as FaceType);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });
});
