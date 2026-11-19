/**
 * The value phrase of group D of the Death Toll deck: "the total mana value of permanents destroyed this way" (Convert to Slime: "create an X/X green Ooze creature token, where X is the
 * total mana value of permanents destroyed this way"). An atom of the value family (`value.ts`), read after "where X is ".
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';

/**
 * "the total mana value of permanents destroyed this way" (CR 202.3, 608.2c, 608.2h: the mana values the permanents had as they were destroyed, added; the permanents an earlier destroy
 * of the same text really destroyed, whatever they are). The engine's `thisWay` `destroyedValue`. Read only where the lowering finds a `destroy` of the same text before it. Not read:
 * another verb ("exiled this way"), a type ("of creatures"), the greatest value, a player's permanents.
 */
export const DESTROYED_VALUE_AMOUNT = (
  ctx: Parameters<ReturnType<typeof pattern>>[0],
  pos: number,
) => {
  const r = pattern(/the total mana value of permanents destroyed this way(?![\p{L}\p{N}'’])/iu)(
    ctx,
    pos,
  );
  if (!r.ok) return r;
  const value: IrAmount = {
    kind: 'thisWay',
    what: 'destroyedValue',
    words: [],
    span: { start: pos, end: r.pos },
  };
  return { ok: true as const, value, pos: r.pos };
};
