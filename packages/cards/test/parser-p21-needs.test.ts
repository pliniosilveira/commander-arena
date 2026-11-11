// Stage P21 (M6): a text of keyword batch 2 that the grammar reads but whose engine feature is not listed is
// reported as "recognised, not runnable" naming that feature, never built (D-068, D-120). The engine lists every
// feature below, so the support check is replaced here by one that lacks one feature at a time, and the lowering
// must name it.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { BLOCKED } from './blocked-features';
import { dropped, withoutFeature } from './parser-p5-helpers';

const EXTORT_WORDS =
  'Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain life equal to the total life lost this way.';

describe('the keywords name `keyword:<kind>` (D-120)', () => {
  test.each([
    ['keyword:skulk', 'Skulk'],
    ['keyword:battleCry', 'Battle cry'],
    ['keyword:mentor', 'Mentor'],
    ['keyword:evolve', 'Evolve'],
    ['keyword:bushido', 'Bushido 1'],
    ['keyword:extort', 'Extort'],
    ['keyword:affinity', 'Affinity for artifacts'],
    ['keyword:convoke', 'Convoke'],
    ['keyword:improvise', 'Improvise'],
    ['keyword:delve', 'Delve'],
    ['keyword:cascade', 'Cascade'],
    ['ability:keyword', 'Skulk'],
    ['ability:keyword', 'Affinity for artifacts'],
  ] as const)('without %s: %s', (ref, text) => {
    const missing = withoutFeature(ref, text, 'creature');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a granted skulk needs the grant (the engine lists skulk among the keywords that can be granted)', () => {
    const missing = withoutFeature(
      'effect:grantKeyword',
      'Target creature gains skulk until end of turn.',
      'instant',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('effect:grantKeyword');
  });
});

describe('the other lowerings of stage P21 name the engine feature they need', () => {
  test.each([
    ['effect:regenerate', '{1}{B}: Regenerate ~.', 'creature'],
    ['duration:untilEndOfTurn', '{1}{B}: Regenerate ~.', 'creature'],
    ['effect:regenerate', 'Regenerate target creature.', 'instant'],
    ['selector:target', 'Regenerate target creature.', 'instant'],
    ['effect:destroy', "Destroy target creature. It can't be regenerated.", 'sorcery'],
    ['trigger:blocks', 'Whenever ~ blocks, draw a card.', 'creature'],
    ['trigger:becomesBlocked', 'Whenever ~ becomes blocked, draw a card.', 'creature'],
    ['trigger:blocks', 'Whenever ~ blocks or becomes blocked, draw a card.', 'creature'],
    ['trigger:becomesBlocked', 'Whenever ~ blocks or becomes blocked, draw a card.', 'creature'],
    ['trigger:alone', 'Whenever ~ attacks alone, draw a card.', 'creature'],
    ['trigger:attacks', 'Whenever ~ attacks alone, draw a card.', 'creature'],
    [
      'effect:mayPay',
      'At the beginning of your upkeep, you may pay {4}. If you do, untap ~.',
      'creature',
    ],
    [
      'cost:mana',
      'At the beginning of your upkeep, you may pay {4}. If you do, untap ~.',
      'creature',
    ],
    [
      'cost:payLife',
      'At the beginning of your upkeep, you may pay 2 life. If you do, draw a card.',
      'creature',
    ],
    ['effect:loseLife', EXTORT_WORDS, 'creature'],
    ['amount:lifeLostThisWay', EXTORT_WORDS, 'creature'],
    ['effect:mayPay', EXTORT_WORDS, 'creature'],
    [
      'amount:lifeLostThisWay',
      'Each opponent loses X life. You gain life equal to the life lost this way.',
      'sorcery',
    ],
  ] as const)('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('"equipped creature blocks" needs the attached subject as well', () => {
    BLOCKED.clear();
    BLOCKED.add('selector:attached');
    try {
      const missing = dropped('Whenever equipped creature blocks, draw a card.', 'artifact', [
        'Equipment',
      ]);
      expect(missing).toMatchObject({ reason: 'notRunnable' });
      expect(missing.needs).toContain('selector:attached');
    } finally {
      BLOCKED.clear();
    }
  });
});
