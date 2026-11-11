import { type CardDefinition, FIXTURE_CARDS } from '@commander-arena/engine';
import { expect } from 'vitest';
import {
  createFixtureRegistry,
  type ImportedCard,
  importCard,
  type StoredCard,
  type StoredFace,
} from '../src/index';
import { syntheticCard } from './convert-helpers';

/** A registry with no overrides, so the parser decides even for a card named like a fixture. */
export const NO_OVERRIDES = createFixtureRegistry({});

export const fixtureNamed = (name: string): CardDefinition => {
  const def = FIXTURE_CARDS[name];
  if (def === undefined) throw new Error(`no fixture named ${name}`);
  return def;
};

/** A SYNTHETIC instant or sorcery with the given Oracle text. */
export function spellCard(
  name: string,
  oracleText: string,
  options: { type?: 'Instant' | 'Sorcery'; manaCost?: string } = {},
): StoredCard {
  return syntheticCard({
    name,
    manaCost: options.manaCost ?? '{1}{R}',
    typeLine: options.type ?? 'Instant',
    oracleText,
  });
}

/** Imports a card through the grammar only (no fixture override). */
export function parseOnly(card: StoredCard): ImportedCard {
  return importCard(card, undefined, NO_OVERRIDES);
}

/** The card fields `parsed` lets a test set besides name, type line and text. */
export type ParsedExtra = Partial<Pick<StoredFace, 'manaCost' | 'power' | 'toughness' | 'colors'>>;

/**
 * Imports text through the grammar only, and requires that it is fully supported. The card's own
 * name written as `~` in `text` is what normalization turns into "~".
 */
export function parsed(
  name: string,
  typeLine: string,
  text: string,
  extra: ParsedExtra = {},
): CardDefinition {
  const oracleText = text.replaceAll('~', name);
  const imported = parseOnly(syntheticCard({ name, typeLine, oracleText, ...extra }));
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}
