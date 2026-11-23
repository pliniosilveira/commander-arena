/**
 * Effect rule of Mnemonic Deluge (issue 576): the exile of a card from a graveyard, several copies of it, and the copies cast without paying their mana costs.
 *
 * - `effect.exile-copy-card-times`: "Exile target instant or sorcery card from a graveyard. Copy that card three times. You may cast the copies without paying their mana costs."
 *   (CR 707.12, 608.2g, 118.9): the three sentences of one instruction, joined by `segment.ts`. The engine's `exile` of the target and `copyCardAndCast` with `times`.
 */
import { fail, literal, pattern, sequence } from '../../combinators';
import type { IrAmount, IrClause } from '../../ir/types';
import { positiveCount } from '../amount/index';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause } from './operands';

const BOUNDARY = '(?![\\p{L}\\p{N}])';

/**
 * `effect.exile-copy-card-times`: the card exiled from a graveyard is copied the number of times the text says, and the controller may cast the copies without paying their mana costs
 * (CR 707.12: an effect can have a player cast a copy of a card; CR 608.2g: during resolution, with no priority; CR 118.9: without paying the mana cost). Any "exile target ... card from a
 * graveyard" that the exile rule reads comes first. Not read: one copy, a copy that is not cast, a cost, "them" cast instead of the copies, the controller's graveyard only.
 */
export const EFFECT_EXILE_COPY_CARD_TIMES = defineRule<Clauses>({
  id: 'effect.exile-copy-card-times',
  family: 'effect',
  leading: ['exile'],
  cites: [
    'CR 707.12 (Copying Objects)',
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 707.2 (Copying Objects)',
  ],
  examples: [
    'exile target instant or sorcery card from a graveyard. copy that card three times. you may cast the copies without paying their mana costs',
    'Exile target instant or sorcery card from a graveyard. Copy that card twice. You may cast the copies without paying their mana costs',
    'exile target instant card from a graveyard. copy that card four times. you may cast the copies without paying their mana costs',
  ],
  rejects: [
    'exile target instant or sorcery card from a graveyard. copy that card three times',
    'exile target instant or sorcery card from a graveyard. copy that card three times. you may cast the copies',
    'exile target instant or sorcery card from a graveyard. copy that card three times. you may cast the copies by paying their mana costs',
    'exile target instant or sorcery card from a graveyard. copy that card three times. you may cast them without paying their mana costs',
    'exile target instant or sorcery card from a graveyard. copy that card once. you may cast the copies without paying their mana costs',
    'exile target instant or sorcery card from a graveyard. copy that card three times. you may cast the copies without paying their mana costs and draw a card',
    'exile target instant or sorcery card from your graveyard. copy that card three times. you may cast the copies without paying their mana costs',
    'exile target instant or sorcery card from a graveyard. copy that card. you may cast the copies without paying their mana costs',
  ],
  parse: (ctx, pos) => {
    const id = 'effect.exile-copy-card-times';
    if (!/\. copy that card /iu.test(ctx.text.slice(pos))) return fail(ctx, pos);
    const exiled = family<Clauses>('effect', { only: ['effect.exile'] })(ctx, pos);
    if (!exiled.ok) return exiled;
    const [only, ...more] = exiled.value;
    if (only === undefined || more.length > 0) return fail(ctx, pos);
    // "from a graveyard": any graveyard, not only the controller's.
    if (!/ from a graveyard$/iu.test(ctx.text.slice(pos, exiled.pos))) return fail(ctx, pos);
    const twice = pattern(new RegExp(`\\. copy that card twice${BOUNDARY}`, 'iu'))(ctx, exiled.pos);
    let times: IrAmount;
    let afterCopy: number;
    if (twice.ok) {
      times = { kind: 'number', value: 2, span: { start: exiled.pos, end: twice.pos } };
      afterCopy = twice.pos;
    } else {
      const counted = sequence(
        literal('. copy that card '),
        spanned(positiveCount),
        pattern(new RegExp(` times${BOUNDARY}`, 'iu')),
      )(ctx, exiled.pos);
      if (!counted.ok) return fail(ctx, pos);
      const [, count] = counted.value;
      // One copy is "copy that card": left to another rule.
      if (count.value < 2) return fail(ctx, pos);
      times = { kind: 'number', value: count.value, span: count.span };
      afterCopy = counted.pos;
    }
    const tail = pattern(
      new RegExp(`\\. you may cast the copies without paying their mana costs${BOUNDARY}`, 'iu'),
    )(ctx, afterCopy);
    if (!tail.ok) return fail(ctx, pos);
    const span = { start: pos, end: tail.pos };
    const copy: IrClause = makeClause(id, 'copyCardAndCast', { times }, span);
    return {
      ok: true,
      value: [
        { ...only, span, rule: id, connector: 'and' as const },
        { ...copy, optional: false },
      ],
      pos: tail.pos,
    };
  },
});

export const MNEMONIC_DELUGE_EFFECT_RULES = [EFFECT_EXILE_COPY_CARD_TIMES];
