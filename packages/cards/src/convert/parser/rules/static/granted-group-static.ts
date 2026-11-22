/**
 * A quoted static ability that gives a group "+N/+N" or keywords (Dancer's Chakrams, CR 604.1, 613.1f): `has "Other commanders you control get +2/+2 and have lifelink,"`. The quoted line is
 * read by the phrase rules of a card's own static abilities (`static.permanents`), so it is a statement about a group of permanents; only a statement whose effects are all a "+N/+N" or a
 * keyword is taken here (any other quoted static ability stays text that is not read: `grantQuoted`, or the cost increase of `QUOTED_COST_INCREASE`).
 */
import { fail, type Parser } from '../../combinators';
import type { IrStaticEffect } from '../../ir/types';
import { readQuotedAbility } from './quoted';

export const QUOTED_GROUP_STATIC: Parser<readonly IrStaticEffect[]> = (ctx, pos) => {
  const read = readQuotedAbility(ctx, pos, { mana: false, statics: true });
  if (!read.ok) return read;
  const { ability } = read.value;
  if (
    ability.kind !== 'static' ||
    ability.statement.subject.det !== 'each' ||
    ability.statement.condition !== undefined ||
    ability.statement.also !== undefined ||
    ability.statement.functionsIn !== undefined ||
    ability.statement.effects.length === 0 ||
    !ability.statement.effects.every((e) => e.kind === 'pt' || e.kind === 'grantKeyword')
  ) {
    return fail(ctx, pos);
  }
  return { ok: true, value: [{ kind: 'grantAbility', ability: read.value }], pos: read.pos };
};
