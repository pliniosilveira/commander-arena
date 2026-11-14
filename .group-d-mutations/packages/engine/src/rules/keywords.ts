/**
 * Keyword abilities on an object (CR 702). Keywords are static abilities in the AST; whether an
 * object has one is read from its derived abilities, so granted and removed abilities (layer 6) apply here automatically.
 */
import type { Ability, Keyword } from '../ast/types';
import type { GameObject, GameState } from '../state/types';
import { derive } from './derive';

export type KeywordKind = Keyword['kind'];

export function abilitiesHaveKeyword(abilities: readonly Ability[], kind: KeywordKind): boolean {
  return abilities.some((a) => a.kind === 'keyword' && a.keyword.kind === kind);
}

export function hasKeyword(state: GameState, obj: GameObject, kind: KeywordKind): boolean {
  return abilitiesHaveKeyword(derive(state, obj).abilities, kind);
}

/** Keyword kinds an object currently has, for views. */
export function keywordsOf(state: GameState, obj: GameObject): KeywordKind[] {
  const out: KeywordKind[] = [];
  for (const a of derive(state, obj).abilities) {
    if (a.kind === 'keyword' && !out.includes(a.keyword.kind)) out.push(a.keyword.kind);
  }
  return out;
}
