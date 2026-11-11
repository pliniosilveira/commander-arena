// Stage P14 (M6): a line the grammar reads but whose engine feature is not listed is reported as
// "recognised, not runnable" naming that feature, never built and never read as something else. The
// engine lists every feature the stage needs, so the support check is replaced here by one that lacks
// them, one at a time, and the lowering must name exactly what it needs of the engine (D-068).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { withoutFeature } from './parser-p5-helpers';

describe('the lowerings of stage P14 name the engine feature they need', () => {
  test.each([
    [
      'manaProduction:couldProduce',
      '{T}: Add one mana of any color that a land an opponent controls could produce.',
    ],
    ['manaProduction:combination', '{R/W}, {T}: Add {R}{R}, {R}{W}, or {W}{W}.'],
    ['manaCost:payLife', '{T}, Pay 1 life: Add one mana of any color.'],
    ['manaCost:mana', '{R/W}, {T}: Add {R}{R}, {R}{W}, or {W}{W}.'],
    ['ability:activateOnlyIf', '{T}: Add {C}{C}. Activate only if you control five or more lands.'],
    ['condition:controlsAtLeast', '{T}: Add {B} or {G}. Activate only if you control a Swamp.'],
    ['static:grantAbility', 'Lands you control have "{T}: Add one mana of any color."'],
    ['ability:mana', '{T}, Pay 1 life: Add {U} or {R}.'],
  ])('without %s: %s', (ref, text) => {
    const missing = withoutFeature(ref, text, 'land');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('without ability:activateOnlyIf an ordinary activation with a condition is named too', () => {
    const missing = withoutFeature(
      'ability:activateOnlyIf',
      '{3}, {T}: Draw a card. Activate only if you control a commander.',
      'artifact',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable', needs: ['ability:activateOnlyIf'] });
  });

  test('without static:grantAbility the equipment grant is named, not run', () => {
    const missing = withoutFeature(
      'static:grantAbility',
      'Equipped creature has "{T}: Add {G}."',
      'artifact',
      ['Equipment'],
    );
    expect(missing).toMatchObject({ reason: 'notRunnable', needs: ['static:grantAbility'] });
  });
});
