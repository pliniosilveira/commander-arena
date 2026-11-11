// Name and face lookups shared by the game tests (`*-games.test.ts`): they read a state by object
// id, falling back on last-known information for an object that is gone.
import type { GameState, ObjectId } from '@commander-arena/engine';

/** The name of the card behind an object (its definition's name), or '?'. */
export const cardNameOf = (state: GameState, id: ObjectId): string => {
  const obj = state.objects[id] ?? state.lki[id]?.object;
  if (!obj || obj.card === null) return '?';
  const card = state.cards[obj.card];
  return card === undefined ? '?' : (state.definitions[card.definition]?.name ?? '?');
};

/** The name of an object, a token's own name, or what its card (or the card it copies) says. */
export const tokenOrCopyNameOf = (state: GameState, id: ObjectId): string => {
  const obj = state.objects[id] ?? state.lki[id]?.object;
  if (obj === undefined) return '?';
  if (obj.token !== null) return obj.token.characteristics.name;
  const card = obj.card ?? obj.copyOf;
  if (card === null || card === undefined) return '?';
  const instance = state.cards[card];
  return instance === undefined ? '?' : (state.definitions[instance.definition]?.name ?? '?');
};

/** The source's name of an ability or the name of a spell on the stack. */
export const stackNameOf = (state: GameState, id: ObjectId): string => {
  const obj = state.objects[id];
  const source = obj?.stack?.source;
  return source != null && obj?.stack?.kind === 'ability'
    ? tokenOrCopyNameOf(state, source)
    : tokenOrCopyNameOf(state, id);
};

/** The printed face of an object's card. */
export const faceOf = (state: GameState, id: ObjectId) => {
  const obj = state.objects[id] ?? state.lki[id]?.object;
  const card = obj?.card == null ? undefined : state.cards[obj.card];
  return card === undefined ? undefined : state.definitions[card.definition]?.faces[obj?.face ?? 0];
};

/** The name of an object, a token's own name, or what its card's face says. */
export const tokenOrFaceNameOf = (state: GameState, id: ObjectId): string => {
  const obj = state.objects[id] ?? state.lki[id]?.object;
  if (obj === undefined) return '?';
  if (obj.token !== null) return obj.token.characteristics.name;
  return faceOf(state, id)?.name ?? '?';
};

/** The mana value of a card as printed (CR 202.3): generic numbers and one for each colored symbol; X counts as 0 off the stack. */
export const manaValueOf = (state: GameState, id: ObjectId): number =>
  (faceOf(state, id)?.manaCost ?? []).reduce((sum, symbol) => {
    if (/^[0-9]+$/.test(symbol)) return sum + Number(symbol);
    return symbol === 'X' ? sum : sum + 1;
  }, 0);
