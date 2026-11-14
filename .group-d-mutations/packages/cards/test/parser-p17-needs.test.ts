// Stage P17 (M6): a line the grammar reads but whose engine feature is not listed is reported as
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

describe('the lowerings of stage P17 name the engine feature they need (D-110)', () => {
  test.each([
    ['keyword:changeling', 'Changeling', 'creature'],
    ['keyword:devoid', 'Devoid', 'creature'],
    ['keyword:partner', 'Partner', 'creature'],
    ['keyword:exalted', 'Exalted', 'creature'],
    ['keyword:annihilator', 'Annihilator 2', 'creature'],
    ['keyword:persist', 'Persist', 'creature'],
    ['keyword:undying', 'Undying', 'creature'],
    ['keyword:infect', 'Infect', 'creature'],
    ['keyword:wither', 'Wither', 'creature'],
    ['keyword:toxic', 'Toxic 1', 'creature'],
    ['keyword:splitSecond', 'Split second', 'instant'],
    ['keyword:typecycling', 'Basic landcycling {1}', 'creature'],
    ['keyword:typecycling', 'Islandcycling {2}', 'creature'],
    ['keyword:multikicker', 'Multikicker {2}', 'sorcery'],
    ['keyword:infect', 'Flying, infect', 'creature'],
    ['keyword:toxic', 'Trample, toxic 1', 'creature'],
    ['amount:timesKicked', 'Draw a card for each time ~ was kicked.', 'sorcery'],
    ['amount:timesKicked', '~ deals 1 damage to any target for each time ~ was kicked.', 'sorcery'],
    ['effect:grantKeyword', 'Target creature gains infect until end of turn.', 'instant'],
  ])('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type as FaceType);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });
});
