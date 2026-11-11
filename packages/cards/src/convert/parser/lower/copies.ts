/**
 * "Create a token that's a copy of target creature" (CR 707.2, 111.4): `createToken` with the
 * engine's `copyOf` source. The permanent copied is `this` (a copy of "~", or of "it" in an ability
 * about `~` alone), a declared target, or `triggerSubject`, the permanent whose event triggered the
 * ability ("it" after "Whenever another creature you control enters"). The parser writes what the
 * text says; the engine's `validateCard` refuses a source that could be an Aura or a land (CR
 * 303.4f, 614.12) and a trigger subject it cannot type, and that reason reaches the player.
 */
import type { ObjectRef } from '@commander-arena/engine';
import type { IrClause, IrNoun, IrToken } from '../ir/types';
import { lowerAmount } from './amounts';
import type { Effects } from './clauses';
import { missingFeatures } from './features';
import { objectRefOf } from './nouns';
import type { LowerContext, LowerResult } from './types';

/** What a copy is made from; the same readings as any pronoun, plus the triggering permanent. */
function copySourceOf(noun: IrNoun, ctx: LowerContext): LowerResult<ObjectRef> {
  if (noun.det === 'triggerSubject') {
    const missing = missingFeatures(['selector:triggerSubject']);
    if (missing.length > 0) return { ok: false, needs: missing, at: noun.span, rule: noun.rule };
    return { ok: true, value: { kind: 'triggerSubject' }, rule: noun.rule };
  }
  return objectRefOf(noun, ctx);
}

/** Lowers the `copyOf` token of a `createToken` clause. */
export function lowerCopyToken(
  token: IrToken,
  copyOf: IrNoun,
  clause: IrClause,
  ctx: LowerContext,
): LowerResult<Effects> {
  const at = { at: token.span, rule: token.rule };
  const blocked = missingFeatures(['token:copyOf']);
  if (blocked.length > 0) return { ok: false, needs: blocked, ...at };
  const count = lowerAmount(token.count, ctx, clause.rule);
  if (!count.ok) return count;
  const object = copySourceOf(copyOf, ctx);
  if (!object.ok) return object;
  return {
    ok: true,
    value: [
      { kind: 'createToken', token: { kind: 'copyOf', object: object.value }, count: count.value },
    ],
    rule: clause.rule,
  };
}
