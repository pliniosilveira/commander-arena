import {
  type CardDefinition,
  type CardFace,
  FIXTURE_CARDS,
  type Supertype,
} from '@commander-arena/engine';
import type { StoredCard } from '../types';
import { convertCharacteristics } from './face';
import { normalizeOracleText } from './parser/normalize';

/** What an override registry says about a stored card. */
export type OverrideLookup =
  /** A hand-written definition to use instead of the parser, already carrying the oracle id. */
  | {
      readonly kind: 'match';
      readonly source: 'fixture';
      readonly definition: CardDefinition;
    }
  /** An entry exists but does not agree with the real card, so it must not be used. */
  | { readonly kind: 'mismatch'; readonly reasons: readonly string[] };

/**
 * Hand-written definitions that take precedence over the parser: the engine's real-card fixtures
 * (`createFixtureRegistry`), matched by name. `lookup` returns null when the registry has nothing
 * for the card. Tests pass an empty registry to see what the parser alone does with a card.
 */
export interface OverrideRegistry {
  lookup(stored: StoredCard): OverrideLookup | null;
}

/** Exact-name key: curly quotes straightened, whitespace collapsed (Scryfall uses straight quotes). */
export function overrideNameKey(name: string): string {
  return name.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function normalizedText(text: string, name: string, supertypes: readonly Supertype[]): string {
  return normalizeOracleText(text, { name, legendary: supertypes.includes('legendary') });
}

/**
 * The fields in which a fixture differs from the real card, empty when it agrees. The Oracle text
 * is compared after the same normalization the parser uses (reminder text and self references),
 * the printed characteristics field by field.
 */
export function fixtureDifferences(fixture: CardDefinition, stored: StoredCard): string[] {
  const diffs: string[] = [];
  if (fixture.faces.length !== stored.faces.length) return ['face count'];
  if (!sameSet(fixture.colorIdentity, stored.colorIdentity)) diffs.push('color identity');
  for (const [i, storedFace] of stored.faces.entries()) {
    const fixtureFace = fixture.faces[i] as CardFace;
    const printed = convertCharacteristics(storedFace).characteristics;
    const prefix = stored.faces.length > 1 ? `face ${i} ` : '';
    const text = (f: { oracleText: string; name: string; supertypes: readonly Supertype[] }) =>
      normalizedText(f.oracleText, f.name, f.supertypes);
    if (text(fixtureFace) !== text(printed)) diffs.push(`${prefix}oracle text`);
    if (overrideNameKey(fixtureFace.name) !== overrideNameKey(printed.name))
      diffs.push(`${prefix}name`);
    if (
      !(fixtureFace.manaCost === null
        ? printed.manaCost === null
        : printed.manaCost !== null && sameList(fixtureFace.manaCost, printed.manaCost))
    ) {
      diffs.push(`${prefix}mana cost`);
    }
    if (
      !sameSet(fixtureFace.supertypes, printed.supertypes) ||
      !sameSet(fixtureFace.types, printed.types) ||
      !sameList(fixtureFace.subtypes, printed.subtypes)
    ) {
      diffs.push(`${prefix}type line`);
    }
    if (!sameSet(fixtureFace.colors, printed.colors)) diffs.push(`${prefix}colors`);
    if (
      fixtureFace.power !== printed.power ||
      fixtureFace.toughness !== printed.toughness ||
      fixtureFace.loyalty !== printed.loyalty ||
      fixtureFace.defense !== printed.defense
    ) {
      diffs.push(`${prefix}power, toughness, loyalty or defense`);
    }
  }
  return diffs;
}

/**
 * A registry over hand-written fixtures (the engine's FIXTURE_CARDS by default), matched by exact
 * normalized name. A fixture is used only when it agrees with the real card (see
 * fixtureDifferences); otherwise lookup reports a mismatch and the parser decides. A used
 * fixture gets the Scryfall `oracle_id`, the Scryfall color identity and Scryfall's Oracle text.
 */
export function createFixtureRegistry(
  fixtures: Readonly<Record<string, CardDefinition>> = FIXTURE_CARDS,
): OverrideRegistry {
  const byName = new Map<string, CardDefinition>();
  for (const fixture of Object.values(fixtures)) {
    byName.set(overrideNameKey(fixture.name), fixture);
  }
  return {
    lookup(stored) {
      const fixture = byName.get(overrideNameKey(stored.name));
      if (fixture === undefined) return null;
      const diffs = fixtureDifferences(fixture, stored);
      if (diffs.length > 0) {
        return {
          kind: 'mismatch',
          reasons: [
            `fixture mismatch: ${fixture.name}`,
            `fixture differs from Scryfall in: ${diffs.join(', ')}`,
          ],
        };
      }
      const definition: CardDefinition = {
        ...fixture,
        oracleId: stored.oracleId,
        colorIdentity: [...stored.colorIdentity],
        faces: fixture.faces.map((face, i) => ({
          ...face,
          oracleText: stored.faces[i]?.oracleText ?? face.oracleText,
        })),
        support: 'supported',
      };
      return { kind: 'match', source: 'fixture', definition };
    },
  };
}

/** The registry `importCard` uses unless it is given another one. */
export const DEFAULT_OVERRIDES: OverrideRegistry = createFixtureRegistry();
