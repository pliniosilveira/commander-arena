/**
 * The amount of the Hatsune Miku deck (issue 145, Aetherflux Reservoir): "for each spell you've cast this turn" (CR 601.2i: a spell is cast once the cost is paid and
 * the spell is on the stack). The engine's `spellsCastThisTurn`, which the text "the number of spells you've cast this turn" already gave.
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

/**
 * `amount.for-each-spell-cast`: "for each spell you've cast this turn" and "for each spell you have cast this turn" (CR 601.2i, 608.2h: counted as the effect resolves,
 * so the spell that triggered the ability counts). Not read: another player's spells, the whole game, a plural "spells", a kind of spell, the past tense "cast" with no
 * "this turn".
 */
export const AMOUNT_FOR_EACH_SPELL_CAST = defineRule<IrAmount>({
  id: 'amount.for-each-spell-cast',
  family: 'amount',
  leading: ['for'],
  cites: ['CR 601.2i (Casting Spells)', 'CR 608.2h (Resolving Spells and Abilities)'],
  examples: [
    "for each spell you've cast this turn",
    'for each spell you have cast this turn',
    'for each spell you’ve cast this turn',
    "For each spell you've cast this turn",
  ],
  rejects: [
    "for each spell you've cast",
    "for each spell you've cast this game",
    'for each spell an opponent has cast this turn',
    "for each spells you've cast this turn",
    "for each creature spell you've cast this turn",
    "for each spell you've cast this turn.",
    "each spell you've cast this turn",
    'for each spell cast this turn',
    'for each spell',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/for each spell you(?:['’]ve| have) cast this turn(?![\p{L}\p{N}])/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: { kind: 'spellsCastThisTurn', span: { start: pos, end: r.pos } },
      pos: r.pos,
    };
  },
});

export const SPELLS_CAST_EACH_AMOUNT_RULES = [AMOUNT_FOR_EACH_SPELL_CAST];
