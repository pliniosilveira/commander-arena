/**
 * "Create a token that's a copy of target creature" (CR 707.2, 111.4): `createToken` with the
 * engine's `copyOf` source. The permanent copied is `this` (a copy of "~", or of "it" in an ability
 * about `~` alone), a declared target, or `triggerSubject`, the permanent whose event triggered the
 * ability ("it" after "Whenever another creature you control enters"). The parser writes what the
 * text says; the engine's `validateCard` refuses a source that could be an Aura or a land (CR
 * 303.4f, 614.12) and a trigger subject it cannot type, and that reason reaches the player.
 */
import {
  type Ability,
  CARD_TYPES,
  type CardType,
  type Color,
  type ObjectRef,
  type PlayerSelector,
} from '@commander-arena/engine';
import type { IrClause, IrNoun, IrToken } from '../ir/types';
import { isGrantable, keywordKind, plainKeyword } from '../rules/keyword/vocabulary';
import { lowerAmount } from './amounts';
import type { Effects } from './clauses';
import { missingFeatures } from './features';
import { colorLetter, objectRefOf } from './nouns';
import type { LowerContext, LowerResult } from './types';

/** What a copy is made from; the same readings as any pronoun, plus the triggering permanent. */
function copySourceOf(noun: IrNoun, ctx: LowerContext): LowerResult<ObjectRef> {
  if (noun.det === 'triggerSubject') {
    const missing = missingFeatures(['selector:triggerSubject']);
    if (missing.length > 0) return { ok: false, needs: missing, at: noun.span, rule: noun.rule };
    return { ok: true, value: { kind: 'triggerSubject' }, rule: noun.rule };
  }
  // Issue 104 (CR 707.2, 400.7j): "you may exile a creature card from your graveyard. If you do, create a token that's a copy of that card": the card the exile before it moved.
  if (noun.det === 'anaphor' && noun.ref === 'moved' && ctx.chosenExiled) {
    const missing = missingFeatures(['selector:moved']);
    if (missing.length > 0) return { ok: false, needs: missing, at: noun.span, rule: noun.rule };
    return { ok: true, value: { kind: 'moved' }, rule: noun.rule };
  }
  return objectRefOf(noun, ctx);
}

/** Lowers the `copyOf` token of a `createToken` clause. */
export function lowerCopyToken(
  token: IrToken,
  copyOf: IrNoun,
  clause: IrClause,
  ctx: LowerContext,
  /** "Its controller creates a token that's a copy of it" (issue 145, CR 111.2): the player who creates the token, when it is not the controller of the ability. */
  by: { controller?: PlayerSelector } = {},
): LowerResult<Effects> {
  const at = { at: token.span, rule: token.rule };
  const blocked = missingFeatures(['token:copyOf']);
  if (blocked.length > 0) return { ok: false, needs: blocked, ...at };
  const count = lowerAmount(token.count, ctx, clause.rule);
  if (!count.ok) return count;
  const object = copySourceOf(copyOf, ctx);
  if (!object.ok) return object;
  // "..., except it's a 4/4 black Zombie" (D-382, CR 707.9b): the characteristics the copy has instead of the ones it copies.
  let exceptions: Record<string, unknown> = {};
  if (token.copyExcept !== undefined) {
    const missing = missingFeatures(['token:copyExceptions']);
    if (missing.length > 0) return { ok: false, needs: missing, ...at };
    const colors: Color[] = [];
    for (const word of token.copyExcept.colors) {
      const letter = colorLetter(word);
      if (letter === undefined) return { ok: false, needs: [], ...at };
      colors.push(letter);
    }
    // Sauron, the Necromancer (CR 707.9a, 707.9b): "with menace": the keywords the copy has besides the abilities it copies.
    const keywordAbilities: Ability[] = [];
    for (const word of token.copyExcept.keywords ?? []) {
      const kind = keywordKind(word);
      if (kind === undefined || !isGrantable(kind)) return { ok: false, needs: [], ...at };
      keywordAbilities.push({ kind: 'keyword', keyword: plainKeyword(kind) });
    }
    exceptions = {
      setPt: { power: token.copyExcept.power, toughness: token.copyExcept.toughness },
      setColors: colors,
      setCreatureTypes: [...token.copyExcept.subtypes],
      ...(keywordAbilities.length === 0 ? {} : { abilities: keywordAbilities }),
    };
  }
  // "..., except it's a 4/4 Dragon creature with flying in addition to its other types" (Will of the Temur, issue 103, CR 707.9b): the values the copy has besides the ones it copies.
  if (token.copyExceptAdditive !== undefined) {
    const missing = missingFeatures(['token:copyExceptions']);
    if (missing.length > 0) return { ok: false, needs: missing, ...at };
    const extra = token.copyExceptAdditive;
    const abilities: Ability[] = [];
    for (const word of extra.keywords) {
      const kind = keywordKind(word);
      if (kind === undefined || !isGrantable(kind)) return { ok: false, needs: [], ...at };
      abilities.push({ kind: 'keyword', keyword: plainKeyword(kind) });
    }
    const types = extra.cardTypes.filter((t): t is CardType => CARD_TYPES.includes(t as CardType));
    if (types.length !== extra.cardTypes.length) return { ok: false, needs: [], ...at };
    exceptions = {
      ...exceptions,
      setPt: { power: extra.power, toughness: extra.toughness },
      addSubtypes: [...extra.subtypes],
      addTypes: types,
      ...(abilities.length === 0 ? {} : { abilities }),
    };
  }
  // "..., except it's not legendary and its starting loyalty is 1" (Galadriel deck group 3, CR 707.9b, 205.4a, 306.5b): the supertype and the loyalty of the copy.
  if (token.copyNotLegendary === true || token.copyStartingLoyalty !== undefined) {
    const missing = missingFeatures(['token:copyExceptions']);
    if (missing.length > 0) return { ok: false, needs: missing, ...at };
    exceptions = {
      ...exceptions,
      ...(token.copyNotLegendary === true ? { notLegendary: true } : {}),
      ...(token.copyStartingLoyalty === undefined
        ? {}
        : { startingLoyalty: token.copyStartingLoyalty }),
    };
  }
  // "..., except it isn't legendary, it's an Illusion artifact in addition to its other types, and it has haste" (Reg Barclay, CR 707.9b, 205.4a): types and keywords besides the copied ones.
  if (token.copyAddsTypes !== undefined) {
    const missing = missingFeatures(['token:copyExceptions']);
    if (missing.length > 0) return { ok: false, needs: missing, ...at };
    const extra = token.copyAddsTypes;
    const abilities: Ability[] = [];
    for (const word of extra.keywords) {
      const kind = keywordKind(word);
      if (kind === undefined || !isGrantable(kind)) return { ok: false, needs: [], ...at };
      abilities.push({ kind: 'keyword', keyword: plainKeyword(kind) });
    }
    const types = extra.cardTypes.filter((t): t is CardType => CARD_TYPES.includes(t as CardType));
    if (types.length !== extra.cardTypes.length) return { ok: false, needs: [], ...at };
    exceptions = {
      ...exceptions,
      addSubtypes: [...extra.subtypes],
      addTypes: types,
      ...(abilities.length === 0 ? {} : { abilities }),
    };
  }
  // "..., except their power is half that creature's power and their toughness is half ... Round up each time" (Saw in Half, CR 707.9b, 107.1a).
  if (token.copyHalfPt === true) {
    const missing = missingFeatures(['token:copyExceptions']);
    if (missing.length > 0) return { ok: false, needs: missing, ...at };
    exceptions = { ...exceptions, halfPt: true };
  }
  // "Create a tapped token that's a copy of ...": the token enters tapped (CR 110.5b).
  if (token.tapped === true) {
    const missing = missingFeatures(['token:tapped']);
    if (missing.length > 0) return { ok: false, needs: missing, ...at };
  }
  return {
    ok: true,
    value: [
      {
        kind: 'createToken',
        token: { kind: 'copyOf', object: object.value, ...exceptions },
        count: count.value,
        ...(token.tapped === true ? { tapped: true as const } : {}),
        ...by,
      },
    ],
    rule: clause.rule,
  };
}
