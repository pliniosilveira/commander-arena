// Shared by the stage P3 parser tests: a face of a given kind (Aura, Equipment, anything else) read
// through the whole pipeline, and the engine nodes the tests compare with. Nothing here is real
// card data.
import {
  type Ability,
  type CardType,
  syntheticCard as engineSynthetic,
  type ObjectFilter,
  type StaticEffect,
  type StaticSubject,
} from '@commander-arena/engine';
import { expect } from 'vitest';
import { DEFAULT_RULES, parseFaceText } from '../src/convert/parser/index';

export const OPTS = { name: 'SYNTHETIC Card', legendary: false };

export type Kind = 'Aura' | 'Equipment' | 'Other';
const TYPES: Record<Kind, readonly string[]> = {
  Aura: ['enchantment'],
  Equipment: ['artifact'],
  Other: ['enchantment'],
};
const SUBTYPES: Record<Kind, readonly string[]> = {
  Aura: ['Aura'],
  Equipment: ['Equipment'],
  Other: [],
};

/** The abilities of a face of the given kind; every line must have parsed. */
export function abilitiesOf(text: string, kind: Kind = 'Other'): readonly Ability[] {
  const parsed = parseFaceText(text, OPTS, 0, DEFAULT_RULES, [], TYPES[kind], SUBTYPES[kind]);
  if (parsed.unparsed.length > 0) throw new Error(`"${text}": ${JSON.stringify(parsed.unparsed)}`);
  return parsed.abilities;
}

/** The first diagnostic of a face whose line did not become an ability. */
export function diagnosticOf(text: string, kind: Kind = 'Other') {
  const parsed = parseFaceText(text, OPTS, 0, DEFAULT_RULES, [], TYPES[kind], SUBTYPES[kind]);
  expect(parsed.abilities, `"${text}" should not lower`).toEqual([]);
  const [first] = parsed.unparsed;
  if (first === undefined) throw new Error(`"${text}" was read`);
  return first;
}

export const fixtureAbilities = (name: string) => engineSynthetic(name).faces[0]?.abilities;

export const mana = (...symbols: string[]) => ({ kind: 'mana', symbols }) as const;
/** Any host: what "Enchanted permanent" says. */
export const ATTACHED = { kind: 'attached' } as const;
/** "Enchanted creature" and "Equipped creature" name the type the host must have (stage P4). */
export const HOST_CREATURE = { kind: 'attached', types: ['creature'] } as const;
export const stat = (effect: StaticEffect): Ability => ({ kind: 'static', static: effect });
export const pt = (
  power: number,
  toughness: number,
  subject: StaticSubject = HOST_CREATURE,
): Ability => stat({ kind: 'modifyPt', subject, power, toughness });
export const grant = (
  kind: 'flying' | 'hexproof' | 'vigilance' | 'trample' | 'haste' | 'shroud',
  subject: StaticSubject = HOST_CREATURE,
): Ability => stat({ kind: 'grantKeyword', subject, keyword: { kind } });

/**
 * The same abilities with every untyped `attached` subject given the host type the text names: the
 * engine's S4a fixtures were written before the subject carried one ("Enchanted creature" is
 * `types: ['creature']`, which the parser now produces).
 */
export function hosted(abilities: readonly Ability[] | undefined, type: CardType): Ability[] {
  return (abilities ?? []).map((a) =>
    a.kind === 'static' && 'subject' in a.static && a.static.subject.kind === 'attached'
      ? ({
          ...a,
          static: { ...a.static, subject: { kind: 'attached', types: [type] } },
        } as Ability)
      : a,
  );
}
export const enchant = (filter: ObjectFilter): Ability => ({
  kind: 'keyword',
  keyword: { kind: 'enchant', filter },
});
