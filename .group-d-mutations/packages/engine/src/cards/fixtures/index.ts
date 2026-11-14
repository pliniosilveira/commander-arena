/**
 * Hand-written card fixtures for engine tests (SPEC 17.6 A27, D-027): real cards in
 * FIXTURE_CARDS, invented ones in SYNTHETIC_CARDS. All fixtures are written from Oracle text
 * and are UNVERIFIED against Scryfall until the M4 import or the A20 spike matches them;
 * every oracleId is null.
 */
import type { CardDefinition } from '../definition';
import { BASIC_LAND_FIXTURES } from './basic-lands';
import { CREATURE_FIXTURES } from './creatures';
import { MANA_SOURCE_FIXTURES } from './mana-sources';
import { SPELL_FIXTURES } from './spells';
import { SYNTHETIC_PREFIX, syntheticCard } from './synthetic';

export { SYNTHETIC_CARDS, syntheticCard } from './synthetic';

export const FIXTURE_CARDS: Readonly<Record<string, CardDefinition>> = Object.fromEntries(
  [...BASIC_LAND_FIXTURES, ...CREATURE_FIXTURES, ...MANA_SOURCE_FIXTURES, ...SPELL_FIXTURES].map(
    (card) => [card.name, card],
  ),
);

/** Looks up a real-card fixture by exact name; throws on an unknown name. */
export function fixtureCard(name: string): CardDefinition {
  const card = Object.hasOwn(FIXTURE_CARDS, name) ? FIXTURE_CARDS[name] : undefined;
  if (card === undefined) throw new Error(`Unknown fixture card: ${name}`);
  return card;
}

/**
 * Builds a test deck: each [name, count] entry contributes `count` copies of the card, in
 * order. Names starting with "SYNTHETIC " resolve in SYNTHETIC_CARDS, all others in
 * FIXTURE_CARDS. Unknown names and non-integer or negative counts throw. Singleton and
 * color-identity rules are not checked here.
 */
export function deckOf(entries: readonly [name: string, count: number][]): CardDefinition[] {
  const deck: CardDefinition[] = [];
  for (const [name, count] of entries) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Invalid count ${count} for ${name}`);
    }
    const card = name.startsWith(SYNTHETIC_PREFIX) ? syntheticCard(name) : fixtureCard(name);
    for (let i = 0; i < count; i++) deck.push(card);
  }
  return deck;
}
