/**
 * Card names in scenarios resolve through the engine's fixtures: real cards in FIXTURE_CARDS,
 * invented ones (names starting with "SYNTHETIC ") in SYNTHETIC_CARDS, plus any definition a
 * scenario registers itself with `define`.
 */
import type { CardDefinition } from '../cards/definition';
import { FIXTURE_CARDS, SYNTHETIC_CARDS } from '../cards/fixtures/index';
import { ScenarioError } from './types';

export function knownCardNames(custom: ReadonlyMap<string, CardDefinition>): string[] {
  return [...custom.keys(), ...Object.keys(FIXTURE_CARDS), ...Object.keys(SYNTHETIC_CARDS)];
}

/** Edit distance, enough to suggest the card a typo meant. */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(Math.min((row[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost));
    }
    prev = row;
  }
  return prev[b.length] ?? 0;
}

export function resolveCard(
  name: string,
  custom: ReadonlyMap<string, CardDefinition>,
): CardDefinition {
  const own = custom.get(name);
  if (own) return own;
  const fixture = Object.hasOwn(FIXTURE_CARDS, name) ? FIXTURE_CARDS[name] : undefined;
  if (fixture) return fixture;
  const synthetic = Object.hasOwn(SYNTHETIC_CARDS, name) ? SYNTHETIC_CARDS[name] : undefined;
  if (synthetic) return synthetic;
  const lower = name.toLowerCase();
  const near = knownCardNames(custom)
    .map((known) => ({ known, d: distance(lower, known.toLowerCase()) }))
    .sort((x, y) => x.d - y.d || (x.known < y.known ? -1 : 1))
    .slice(0, 3)
    .filter((c) => c.d <= Math.max(3, Math.floor(name.length / 3)))
    .map((c) => `"${c.known}"`);
  throw new ScenarioError(
    `Unknown card "${name}".${near.length > 0 ? ` Did you mean ${near.join(' or ')}?` : ''} ` +
      'Cards come from the engine fixtures (src/cards/fixtures) or scenario().define(card).',
  );
}
