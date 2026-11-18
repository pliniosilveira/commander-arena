// "At the beginning of your upkeep, you and target opponent each reveal the top card of your library. You each lose life equal to the mana value of the card revealed by the other
// player. You each put the card you revealed into your hand." (CR 701.20a, 119.3, 202.3). The first block is the real Oracle text of Keen Duelist (the golden corpus holds it); the others
// are near misses the grammar must not read. The engine runs what is lowered in convert-grammar-engine-reveal-top-duel.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read, withoutFeature } from './parser-p5-helpers';

const REAL =
  'At the beginning of your upkeep, you and target opponent each reveal the top card of your library. You each lose life equal to the mana value of the card revealed by the other player. You each put the card you revealed into your hand.';

describe('Keen Duelist (CR 701.20a, 119.3)', () => {
  test('the real text: one upkeep trigger with a target opponent and a revealTopDuel of you and that opponent', () => {
    const parsed = read(REAL);
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
        effect: {
          kind: 'revealTopDuel',
          players: { kind: 'all', of: [{ kind: 'you' }, { kind: 'target', id: 't1' }] },
        },
      },
    ]);
  });

  test('without the engine feature the line is flagged, not half run', () => {
    const first = withoutFeature('effect:revealTopDuel', REAL);
    expect(first.reason).toBe('notRunnable');
    expect(first.needs).toContain('effect:revealTopDuel');
  });

  test.each([
    ['target player', REAL.replace('target opponent', 'target player')],
    ['two cards', REAL.replace('top card', 'top two cards')],
    ['own card', REAL.replace('revealed by the other player', 'you revealed')],
    ['graveyard', REAL.replace('into your hand', 'into your graveyard')],
    ['one sentence missing', REAL.replace(/ You each lose life[^.]*\./u, '')],
    ['extra instruction', REAL.replace('into your hand.', 'into your hand and draw a card.')],
  ])('not read: %s', (_name, text) => {
    const parsed = read(text);
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });
});
