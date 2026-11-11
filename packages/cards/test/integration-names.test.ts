import { expect, test } from 'vitest';
import { frontFaceName, normalizeCardName, normalizeNameKey, parseDecklist } from '../src/index';

const NAMES = [
  'Sol Ring',
  "Atraxa, Praetors' Voice",
  'Atraxa, Praetors’ Voice',
  'Fire // Ice',
  'Fire/Ice',
  'Fire///Ice',
  '  Delver  of   Secrets // Insectile Aberration ',
  'Jace, Vryn’s Prodigy // Jace, Telepath Unbound',
  'Lim-Dûl’s Vault',
];

test('the Scryfall lookup key is the decklist parser name, lower-cased', () => {
  for (const name of NAMES) {
    expect(normalizeNameKey(name), name).toBe(normalizeCardName(name).toLowerCase());
  }
});

test('a name parsed from a decklist maps to the key used for its lookup', () => {
  const parsed = parseDecklist(NAMES.map((n) => `1 ${n}`).join('\n'));
  expect(parsed.errors).toEqual([]);
  const entries = parsed.sections.main;
  expect(entries).toHaveLength(NAMES.length);
  entries.forEach((entry, i) => {
    expect(normalizeNameKey(entry.name)).toBe(normalizeNameKey(NAMES[i] ?? ''));
  });
});

test('the front-face name is what goes to the collection endpoint (D-048)', () => {
  expect(frontFaceName('Fire // Ice')).toBe('Fire');
  expect(frontFaceName('Fire/Ice')).toBe('Fire');
  expect(frontFaceName('Sol Ring')).toBe('Sol Ring');
});
