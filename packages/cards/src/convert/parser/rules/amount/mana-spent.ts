/**
 * The mana spent to cast a spell (stage P39, D-184, the engine's `Amount` `manaSpent`, CR 601.2h): "the amount of mana spent to cast it" (a value phrase:
 * "..., where X is the amount of mana spent to cast it") and "for each mana spent to cast it", "for each mana from an artifact source spent to cast it" (a
 * count after a quantity). "It" is the spell (`who: 'it'`, which the lowering reads as the object the ability is about or as the permanent that
 * enters) and `~` is the card itself (`who: 'self'`); "an artifact source" is a card type of the source of the mana. D-256 (the Bruna deck): "for each {S} spent to
 * cast ~" counts the mana of snow sources (CR 107.4h, 106.3: "mana of any type produced by a snow source").
 */
import { pattern } from '../../combinators';
import type { IrAmount } from '../../ir/types';
import { defineRule } from '../registry';

/** The card types a source of mana may be named by ("from an artifact source", "from a creature source"). */
const TYPE_WORDS = 'artifact|creature|enchantment|land|planeswalker';

const THE_AMOUNT = /the amount of mana spent to cast (it|~)(?![\p{L}\p{N}])/iu;
const FOR_EACH = new RegExp(
  `for each (?:mana(?: from an? (${TYPE_WORDS}) source)?|(\\{S\\})) spent to cast (it|~)(?![\\p{L}\\p{N}])`,
  'iu',
);

/** The value phrase "the amount of mana spent to cast it", as an atom of the value family (`where X is ...`, `equal to ...`). */
export const MANA_SPENT_AMOUNT = (ctx: Parameters<ReturnType<typeof pattern>>[0], pos: number) => {
  const r = pattern(THE_AMOUNT)(ctx, pos);
  if (!r.ok) return r;
  const value: IrAmount = {
    kind: 'manaSpent',
    who: r.value[1] === '~' ? 'self' : 'it',
    span: { start: pos, end: r.pos },
  };
  return { ok: true as const, value, pos: r.pos };
};

/**
 * `amount.for-each-mana-spent`: "for each mana spent to cast it", "for each mana from an artifact source spent to cast ~" (CR 601.2h: the mana that
 * paid the cost of the spell, each counted once; the mana that paid for a mana ability, the life paid for Phyrexian mana and what Convoke or Delve paid are
 * not mana spent). After a quantity ("... enters with an additional +1/+1 counter on it for each ..."): the quantity is the count, as for
 * `amount.for-each`. "Each mana of a color" and "for each mana spent" with no spell are not read.
 */
export const AMOUNT_FOR_EACH_MANA_SPENT = defineRule<IrAmount>({
  id: 'amount.for-each-mana-spent',
  family: 'amount',
  leading: ['for'],
  cites: [
    'CR 601.2h (Casting Spells)',
    'CR 601.2i (Casting Spells)',
    'CR 614.12 (Replacement Effects)',
    'CR 122.6 (Counters)',
    'CR 107.4h (Numbers and Symbols)',
  ],
  examples: [
    'for each mana spent to cast it',
    'for each mana from an artifact source spent to cast it',
    'for each mana from a creature source spent to cast it',
    'for each {S} spent to cast it',
  ],
  rejects: [
    'for each mana',
    'for each mana spent',
    'for each mana spent to cast',
    'for each mana spent to cast that spell',
    'for each mana from an artifact spent to cast it',
    'for each mana from an artifact source',
    'for each mana from an artifact source spent to cast',
    'for each mana from a Treasure source spent to cast it',
    'for each mana from artifact sources spent to cast it',
    'for each mana from an artifact source spent to cast it.',
    'each mana spent to cast it',
    'for each mana spent to cast its',
    'for each {S}',
    'for each {S} spent',
    'for each {S} spent to cast',
    'for each {S} spent to cast that spell',
    'for each {W} spent to cast ~',
    'for each {S} from an artifact source spent to cast ~',
    'for each {S}{S} spent to cast ~',
    'for each snow mana spent to cast ~',
  ],
  parse: (ctx, pos) => {
    const r = pattern(FOR_EACH)(ctx, pos);
    if (!r.ok) return r;
    const fromType = r.value[1]?.toLowerCase();
    return {
      ok: true,
      value: {
        kind: 'manaSpent',
        ...(fromType === undefined ? {} : { fromType }),
        // D-256: "for each {S} spent to cast ~" (CR 107.4h): the mana that a snow source made.
        ...(r.value[2] === undefined ? {} : { snow: true as const }),
        who: r.value[3] === '~' ? 'self' : 'it',
        span: { start: pos, end: r.pos },
      },
      pos: r.pos,
    };
  },
});
