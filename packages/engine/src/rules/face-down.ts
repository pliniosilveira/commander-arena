/**
 * Face-down permanents (CR 708, 701.40, D-308): what a face-down permanent is, and the one place that reads `GameObject.faceDown`.
 *
 * A face-down permanent is the same object as the card it represents, with different characteristics (CR 708.2, 400.7): a 2/2 creature with no name, no subtypes, no mana
 * cost, no text (CR 701.40a, 708.2a). They are its copiable values, applied as layer 1b, after the copy effects and before every later layer (CR 613.2b, 708.10), so
 * `copiableValues` (rules/copiable.ts) applies `FACE_DOWN_VALUES` and everything that reads characteristics (`derive`, `typeViewOf`, last-known information, the text of a
 * source) sees a nameless 2/2 and cannot name the card. The code that can name it is the code that reads the card behind the object (`state.cards`, `definitionOf`): the
 * view (`view.ts`), the log of the web, `determinize`. They ask `isFaceDown` and `faceDownLabel` here.
 *
 * The field is read nowhere else (`test/face-down-reads.test.ts` fails when another file reads or writes it): every reader asks a function below, as for pairing
 * (`rules/pairing.ts`). This module imports nothing that reads `derive`, so `rules/copiable.ts` can import it.
 */
import type { ObjectId } from '../ids';
import type { CopiableValues, FaceDownBy, GameObject, GameState } from '../state/types';

/** CR 708.2a, 701.40a: a 2/2 creature with no name, no subtypes, no mana cost and no text; it has no supertype, no color and no ability either (CR 708.2). */
export const FACE_DOWN_VALUES: CopiableValues = {
  characteristics: {
    name: '',
    manaCost: null,
    supertypes: [],
    types: ['creature'],
    subtypes: [],
    colors: [],
    power: 2,
    toughness: 2,
    loyalty: null,
    defense: null,
    oracleText: '',
  },
  abilities: [],
};

/** True for a face-down permanent (on the battlefield or phased out). */
export function isFaceDown(obj: GameObject): boolean {
  return obj.faceDown !== undefined;
}

/** What made the permanent face down, or null for a face-up one. */
export function faceDownBy(obj: GameObject): FaceDownBy | null {
  return obj.faceDown?.by ?? null;
}

/** The label of a face-down permanent, "Face-down creature 2" (CR 708.6): the one thing every player may call it. Null for a face-up object. */
export function faceDownLabel(obj: GameObject): string | null {
  return obj.faceDown === undefined ? null : `Face-down creature ${obj.faceDown.n}`;
}

/**
 * The label number a permanent that becomes face down now gets (CR 708.6): the smallest positive integer that no other face-down permanent, on the battlefield or
 * phased out, has. The labels in play are unique, and a permanent keeps its own for as long as it is face down.
 */
export function nextFaceDownNumber(state: GameState): number {
  const used = new Set<number>();
  for (const id of [...state.battlefield, ...(state.phased ?? [])]) {
    const n = state.objects[id]?.faceDown?.n;
    if (n !== undefined) used.add(n);
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return n;
}

/** The fields a permanent that enters face down by `by` has (`{}` for a face-up entry), for the object `moveObject` creates. */
export function faceDownEntry(
  state: GameState,
  by: FaceDownBy | undefined,
): { readonly faceDown?: { readonly by: FaceDownBy; readonly n: number } } {
  return by === undefined ? {} : { faceDown: { by, n: nextFaceDownNumber(state) } };
}

/** The object as it is when turned face up (CR 708.8): the same object, with the face-down status gone. Everything else about it is unchanged. */
export function withoutFaceDown(obj: GameObject): GameObject {
  const { faceDown: _gone, ...rest } = obj;
  return rest;
}

/** The face-down permanents on the battlefield or phased out, in battlefield order. */
export function faceDownPermanents(state: GameState): readonly ObjectId[] {
  return [...state.battlefield, ...(state.phased ?? [])].filter(
    (id) => state.objects[id]?.faceDown !== undefined,
  );
}
