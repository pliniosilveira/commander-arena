// Shared by the stage P5 parser tests (parser-p5*.test.ts): a face read through the whole pipeline,
// and the engine nodes the tests compare with. Nothing here is real card data.
import {
  type Effect,
  syntheticCard as engineSynthetic,
  type ObjectSelector,
} from '@commander-arena/engine';
import { expect } from 'vitest';
import {
  ALL_RULES,
  buildRuleSet,
  DEFAULT_RULES,
  DEFAULT_SPELL_RULES,
  parseFaceText,
} from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';

export const OPTS = { name: 'SYNTHETIC Card', legendary: false };
export const SET = buildRuleSet(ALL_RULES);
export const END = 'untilEndOfTurn' as const;
export const T1 = { kind: 'target', id: 't1' } as const;
export const THIS = { kind: 'this' } as const;

export type FaceType = 'instant' | 'sorcery' | 'creature' | 'enchantment' | 'artifact' | 'land';

/** One face of the given type through the grammar, with the spell rules on an instant or sorcery. */
export function read(text: string, type: FaceType = 'instant', subtypes: readonly string[] = []) {
  const isSpell = type === 'instant' || type === 'sorcery';
  return parseFaceText(
    text,
    OPTS,
    0,
    DEFAULT_RULES,
    isSpell ? DEFAULT_SPELL_RULES : [],
    [type],
    subtypes,
  );
}

/** The face read completely: no ability left over. */
export function readAll(
  text: string,
  type: FaceType = 'instant',
  subtypes: readonly string[] = [],
) {
  const parsed = read(text, type, subtypes);
  expect(parsed.unparsed, `"${text}"`).toEqual([]);
  return parsed;
}

/** The first dropped ability of a face that did not read. */
export function dropped(
  text: string,
  type: FaceType = 'instant',
  subtypes: readonly string[] = [],
) {
  const parsed = read(text, type, subtypes);
  const [first] = parsed.unparsed;
  if (first === undefined) throw new Error(`"${text}" was read`);
  return first;
}

/** The effect of a spell line that read completely. */
export function spellEffect(text: string, type: 'instant' | 'sorcery' = 'instant'): Effect {
  const effect = readAll(text, type).spell?.effect;
  if (effect === undefined) throw new Error(`"${text}" has no spell effect`);
  return effect;
}

export const fixture = (name: string) => {
  const face = engineSynthetic(name).faces[0];
  if (face === undefined) throw new Error(`no fixture ${name}`);
  return face;
};

/** The target declaration of "target creature" (`t1`). */
export const CREATURE_TARGET = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
} as const;

export const grant = (keyword: string, objects: ObjectSelector = T1): Effect =>
  ({ kind: 'grantKeyword', objects, keyword: { kind: keyword }, duration: END }) as Effect;

export const pump = (power: number, toughness: number, objects: ObjectSelector = T1): Effect =>
  ({ kind: 'modifyPt', objects, power, toughness, duration: END }) as Effect;

/** Every creature you control, as the engine says it. */
export const MY_CREATURES = {
  kind: 'each',
  filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
} as const;

/**
 * The first dropped ability of a face once `ref` is missing from the engine's feature list. The
 * test file must mock the engine with `blockFeatures` (see blocked-features.ts).
 */
export function withoutFeature(
  ref: string,
  text: string,
  type: FaceType = 'creature',
  subtypes: readonly string[] = [],
) {
  BLOCKED.clear();
  BLOCKED.add(ref);
  try {
    return dropped(text, type, subtypes);
  } finally {
    BLOCKED.clear();
  }
}
