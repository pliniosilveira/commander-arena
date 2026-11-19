// Inkshield: "Prevent all combat damage that would be dealt to you this turn. For each 1 damage prevented this way, create a 2/1 white and black Inkling creature token with flying."
// (CR 615.5, 615.6, 111.2). The first line is the real Oracle text read through the whole pipeline; the others are near misses the grammar must not read.
// The engine runs what is lowered in packages/engine/test/scenario-xx-prevention-tokens.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read, withoutFeature } from './parser-p5-helpers';

const REAL =
  'Prevent all combat damage that would be dealt to you this turn. For each 1 damage prevented this way, create a 2/1 white and black Inkling creature token with flying.';

const INKLING = {
  name: 'Inkling',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Inkling'],
  colors: ['W', 'B'],
  power: 2,
  toughness: 1,
  loyalty: null,
  defense: null,
  oracleText: '',
  abilities: [{ kind: 'keyword', keyword: { kind: 'flying' } }],
};

const NOT_READ = (text: string) => {
  const parsed = read(text, 'instant');
  expect(parsed.spell ?? null, text).toBeNull();
  expect(parsed.unparsed, text).toHaveLength(1);
};

describe('Inkshield: a token for each 1 damage the shield prevents (CR 615.5)', () => {
  test('the real line: one preventDamage with the token made for each 1 damage prevented', () => {
    const parsed = read(REAL, 'instant');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.spell).toEqual({
      effect: {
        kind: 'preventDamage',
        scope: 'combat',
        amount: 'all',
        to: { kind: 'you' },
        duration: 'untilEndOfTurn',
        perPrevented: { token: { kind: 'custom', definition: INKLING } },
      },
    });
  });

  test('"all damage" instead of combat damage is the same shield with another scope', () => {
    const parsed = read(REAL.replace('combat damage', 'damage'), 'instant');
    expect(parsed.unparsed).toEqual([]);
    expect(parsed.spell).toMatchObject({ effect: { kind: 'preventDamage', scope: 'all' } });
  });

  test('not read: another number, more than one token, a copy, other words', () => {
    NOT_READ(REAL.replace('For each 1 damage', 'For each 2 damage'));
    NOT_READ(REAL.replace('For each 1 damage', 'For each damage'));
    NOT_READ(
      REAL.replace(
        'create a 2/1 white and black Inkling creature token',
        'create two 2/1 white and black Inkling creature tokens',
      ),
    );
    NOT_READ(
      REAL.replace(
        'a 2/1 white and black Inkling creature token with flying',
        'a token that’s a copy of target creature',
      ),
    );
    NOT_READ(REAL.replace('prevented this way', 'that would be prevented this way'));
    NOT_READ(REAL.replace('Prevent all combat damage', 'Prevent the next 3 damage'));
  });

  test('the shield without the second sentence is still the plain Fog shield', () => {
    const parsed = read(
      'Prevent all combat damage that would be dealt to you this turn.',
      'instant',
    );
    expect(JSON.stringify(parsed.spell)).not.toContain('perPrevented');
  });

  test('without the engine feature the card is named as not runnable, not guessed (D-068, D-115)', () => {
    const missing = withoutFeature('selector:tokensPerPrevented', REAL, 'instant');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('selector:tokensPerPrevented');
  });
});
