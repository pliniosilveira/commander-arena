// SYNTHETIC token effects; no network.
import { TOKEN_PRESETS } from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { tokenQueries } from './token-art.ts';

test('finds nested tokens, deduplicates presets and reports runtime-dependent definitions', () => {
  const clue = { kind: 'createToken', token: { kind: 'preset', preset: 'Clue' } };
  const nested = {
    kind: 'createToken',
    token: {
      kind: 'custom',
      definition: {
        ...TOKEN_PRESETS.Treasure,
        abilities: [{ kind: 'triggered', effect: clue }],
      },
    },
  };
  const result = tokenQueries([
    nested,
    clue,
    clue,
    { kind: 'createToken', token: { kind: 'copyOf', object: { kind: 'this' } } },
    { ...nested, token: { ...nested.token, ptAmount: 2 } },
  ]);
  expect(result.queries).toHaveLength(2);
  expect(result.queries.some((q) => q.startsWith('!"Clue"'))).toBe(true);
  expect(result.queries.some((q) => q.startsWith('!"Treasure"'))).toBe(true);
  expect(result.dynamic).toBe(2);
});
