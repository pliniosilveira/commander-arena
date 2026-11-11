/**
 * Copiable values (CR 707.2) and copy effects (CR 613.2a, layer 1).
 *
 * The copiable values of an object are the characteristics and abilities derived from the text
 * printed on it (a card's face, or the definition a token was created with), as modified by copy
 * effects. Everything else is not copied: counters, damage, tapped status, attachments, and the
 * effects of other layers ("becomes a Frog", "+1/+1 until end of turn", "loses all abilities",
 * CR 707.2 and its Chimeric Staff example). `derive` starts from these values, so a copy effect is
 * the first thing applied to an object and everything else applies on top of it (CR 613.1).
 *
 * A `copy` effect on an object replaces all of its copiable values with the ones it carries; the
 * last by timestamp wins (CR 613.7). The values it carries were read when the effect began, so a
 * later change to the original does not reach the copy (CR 707.2b).
 */
import type { Ability } from '../ast/types';
import type { CardDefinition, CardFace } from '../cards/definition';
import { definitionOf, printedCard } from '../state/ops';
import type { CopiableValues, GameObject, GameState } from '../state/types';
import { effectsOn } from './derive-layers';
import { combinedValues, hasCombinedFaces } from './layouts';

const NOTHING: CopiableValues = {
  characteristics: {
    name: '',
    manaCost: null,
    supertypes: [],
    types: [],
    subtypes: [],
    colors: [],
    power: null,
    toughness: null,
    loyalty: null,
    defense: null,
    oracleText: '',
  },
  abilities: [],
};

const combined = new WeakMap<object, CopiableValues>();

/** CR 709.4: both halves of a split card together, made once per card definition. */
function combinedOf(def: CardDefinition): CopiableValues {
  let values = combined.get(def);
  if (values === undefined) {
    values = combinedValues(def);
    combined.set(def, values);
  }
  return values;
}

const faceValues = new WeakMap<object, CopiableValues>();

/** The values a card face prints, made once per face: card definitions are never changed (the cache holds nothing the face does not determine). */
function valuesOfFace(face: CardFace): CopiableValues {
  let values = faceValues.get(face);
  if (values === undefined) {
    const { abilities, spell: _spell, ...characteristics } = face;
    values = { characteristics, abilities };
    faceValues.set(face, values);
  }
  return values;
}

const tokenValues = new WeakMap<object, CopiableValues>();

/** The values a token's definition gives it, made once per token definition (a token's definition is never changed). */
function valuesOfToken(token: NonNullable<GameObject['token']>): CopiableValues {
  let values = tokenValues.get(token);
  if (values === undefined) {
    values = { characteristics: token.characteristics, abilities: token.abilities };
    tokenValues.set(token, values);
  }
  return values;
}

/**
 * What the object has printed on it: a card's face up, or a token's definition. A split card
 * outside the stack has both halves combined (CR 709.4); a double-faced card has the face that is
 * up, which is its front face anywhere but the stack and the battlefield (CR 712.8a, 712.8f), and
 * an Adventure card its normal face unless it is on the stack as an Adventure (CR 715.4).
 */
function printedValues(state: GameState, obj: GameObject): CopiableValues {
  if (obj.token) return valuesOfToken(obj.token);
  // A copy of a spell has the printed values of the face it copies (CR 707.10, 707.2; D-129).
  const card = printedCard(obj);
  if (card === null) return NOTHING;
  const def = definitionOf(state, card);
  if (hasCombinedFaces(def, obj)) return combinedOf(def);
  const face = def.faces[obj.face];
  if (!face) throw new Error(`Object ${obj.id} has no face ${obj.face}`);
  return valuesOfFace(face);
}

/**
 * The copiable values of `obj` now (CR 707.2): printed, then copy effects in timestamp order. A
 * copy of a double-faced permanent uses the values of the face that is up (CR 707.8).
 */
export function copiableValues(state: GameState, obj: GameObject): CopiableValues {
  let values = printedValues(state, obj);
  for (const effect of effectsOn(state, obj.id)) {
    if (effect.change.kind === 'copy') values = effect.change.values;
  }
  return atLevel(values, obj.level ?? 1);
}

const levelled = new WeakMap<readonly Ability[], Map<number, readonly Ability[]>>();

/**
 * CR 716.2a, 716.2b (D-235): the abilities of a Class that its level gives it. The abilities of a class level bar are there from its level on; the level is the permanent's own
 * (not a copiable value), so a copy of a Class has the abilities of its own level. The list is made once for each list of abilities and level.
 */
function atLevel(values: CopiableValues, level: number): CopiableValues {
  const { abilities } = values;
  if (!abilities.some((a) => a.kind === 'level')) return values;
  let byLevel = levelled.get(abilities);
  if (byLevel === undefined) {
    byLevel = new Map();
    levelled.set(abilities, byLevel);
  }
  let list = byLevel.get(level);
  if (list === undefined) {
    list = abilities.flatMap((a) =>
      a.kind === 'level' ? (level >= a.level ? a.abilities : []) : [a],
    );
    byLevel.set(level, list);
  }
  return { ...values, abilities: list };
}

/** Whether a copy effect currently gives `obj` the values of another object (layer 1). */
export function isCopying(state: GameState, obj: GameObject): boolean {
  return effectsOn(state, obj.id).some((effect) => effect.change.kind === 'copy');
}
