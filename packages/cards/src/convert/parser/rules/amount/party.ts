/**
 * The number of creatures in your party (CR 700.8: up to one Cleric, one Rogue, one Warrior and one Wizard among the creatures a player controls; CR 700.8a: the game counts it):
 * "the number of creatures in your party" (after "where X is" and "equal to", `amount/value.ts`) and "for each creature in your party" (Squad Commander, Thwart the Grave).
 * The engine's `partySize`. Only your own party is read.
 */
import { type Parser, pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule, spanned } from '../registry';

/** "the number of creatures in your party": read after "where X is" and "equal to" (`amount/value.ts`). */
export const PARTY_SIZE_VALUE: Parser<IrAmount> = (ctx, pos) => {
  const r = spanned(pattern(/the number of creatures in your party(?![\p{L}\p{N}'’])/iu))(ctx, pos);
  if (!r.ok) return r;
  return { ok: true, value: { kind: 'partySize', span: r.value.span }, pos: r.pos };
};

/**
 * `amount.for-each-party-creature`: "for each creature in your party" (CR 700.8, 608.2c): the count after "create a token", "costs {1} less to cast", the engine's `partySize`. Not
 * read: another player's party, "for each creature you control", "for each Cleric in your party", a missing "in".
 */
export const AMOUNT_FOR_EACH_PARTY_CREATURE = defineRule<IrAmount>({
  id: 'amount.for-each-party-creature',
  family: 'amount',
  leading: ['for'],
  cites: [
    'CR 700.8 (General)',
    'CR 700.8a (General)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: ['for each creature in your party', 'For each creature in your party'],
  rejects: [
    'for each creature in their party',
    "for each creature in target player's party",
    'for each creature you control',
    'for each Cleric in your party',
    'for each creature your party',
    'for each creatures in your party',
    'for each creature in your parties',
  ],
  parse: (ctx, pos) => {
    const r = spanned(pattern(/for each creature in your party(?![\p{L}\p{N}'’])/iu))(ctx, pos);
    if (!r.ok) return r;
    return { ok: true, value: { kind: 'partySize', span: r.value.span }, pos: r.pos };
  },
});

export const PARTY_AMOUNT_RULES = [AMOUNT_FOR_EACH_PARTY_CREATURE];
