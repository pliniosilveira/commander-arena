/**
 * `effect.add-mana`: what a mana ability or an "Add ..." effect produces (CR 106.1, 605.1).
 */
import {
  choice,
  fail,
  literal,
  many,
  map,
  optional,
  type Parser,
  pattern,
  quiet,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrAmount, IrManaSpec } from '../../ir/types';
import { FOR_EACH_TAIL } from '../amount/scaled';
import { defineRule, spanned } from '../registry';
import { type Clauses, single } from './operands';

/**
 * " for each tapped land your opponents control" when it ends the instruction (stage P34, D-152): the count is read only as the whole of what follows
 * the mana, so a count that is followed by more words ("for each card in target opponent's hand") leaves the diagnostic where it always was.
 */
const FOR_EACH_TAIL_ENDING: Parser<IrAmount> = (ctx, pos) => {
  const r = FOR_EACH_TAIL(ctx, pos);
  if (!r.ok) return r;
  return /^(?:$|\.|,| and | then )/i.test(ctx.text.slice(r.pos)) ? r : fail(ctx, pos);
};

/** Mana symbols written in a row, as the letters they name ({G}{G} is two G). */
const MANA_SYMBOLS = map(pattern(/(?:\{[WUBRGC]\})+/i), (m): string[] =>
  [...m[0].matchAll(/\{([WUBRGC])\}/gi)].map((s) => (s[1] ?? '').toUpperCase()),
);

/** One mana symbol: the letter it names. */
const ONE_SYMBOL = map(pattern(/\{([WUBRGC])\}/i), (m) => (m[1] ?? '').toUpperCase());

/**
 * "{U} or {B}", "{R}, {G}, or {W}": two or more different single symbols joined by commas and a
 * last "or" (CR 106.1b: one mana of a type chosen from a list). Needs at least two items, so
 * "{G}" alone stays a fixed production.
 */
const MANA_CHOICE = satisfy(
  map(
    sequence(
      ONE_SYMBOL,
      many(
        map(
          sequence(choice(literal(', or '), literal(', '), literal(' or ')), ONE_SYMBOL),
          ([, c]) => c,
        ),
      ),
    ),
    ([first, rest]) => [first, ...rest],
  ),
  (colors) => colors.length >= 2 && new Set(colors).size === colors.length,
);

/** The symbols of a combination as a multiset, for telling two combinations apart. */
const multiset = (symbols: readonly string[]): string => [...symbols].sort().join('');

/**
 * "{R}{R}, {R}{W}, or {W}{W}": two or more runs of at least two symbols joined by commas and a last
 * "or" (CR 106.1, 605.3b: exactly one of the combinations is added, chosen as the ability
 * resolves). The runs must differ as multisets: "{R}{W}, {W}{R}" says one combination twice.
 */
const MANA_COMBINATION = satisfy(
  map(
    sequence(
      MANA_SYMBOLS,
      many(map(sequence(literal(', '), MANA_SYMBOLS), ([, symbols]) => symbols)),
      choice(literal(', or '), literal(' or ')),
      MANA_SYMBOLS,
    ),
    ([first, middle, , last]) => [first, ...middle, last],
  ),
  (options) =>
    options.every((o) => o.length >= 2) && new Set(options.map(multiset)).size === options.length,
);

/**
 * "one mana of any color that a land an opponent controls could produce", "one mana of any type
 * that a land you control could produce" (CR 106.7). "Any color" leaves colorless out and "any type"
 * keeps it (CR 106.1a, 106.1b).
 */
const COULD_PRODUCE = map(
  pattern(
    /one mana of any (color|type) that a land (you control|an opponent controls) could produce(?![\p{L}\p{N}])/iu,
  ),
  (m): IrManaSpec['what'] => ({
    kind: 'couldProduce',
    whose: (m[2] ?? '').toLowerCase() === 'you control' ? 'you' : 'opponent',
    anyType: (m[1] ?? '').toLowerCase() === 'type',
  }),
);

/**
 * `effect.add-mana`: "Add {R}{R}{R}", "Add {U} or {B}", "Add {R}, {G}, or {W}", "Add one mana of
 * any color", "Add one mana of any color in your commander's color identity" (CR 106.1 mana,
 * 903.4 color identity, 605.1 mana abilities). Several symbols in a row are all added; a list with
 * "or" is one mana of a chosen type. Since stage P14 also "Add {R}{R}, {R}{W}, or {W}{W}" (a choice
 * among combinations, CR 605.3b) and "one mana of any color that a land an opponent controls could
 * produce" (CR 106.7). A rider ("When that mana is spent ...") and a spend restriction are not read.
 */
export const EFFECT_ADD_MANA = defineRule<Clauses>({
  id: 'effect.add-mana',
  family: 'effect',
  leading: ['add'],
  cites: [
    'CR 106.1 (Mana)',
    'CR 605.1a (Mana Abilities)',
    'CR 700.5 (General)',
    'CR 903.4 (Commander)',
  ],
  examples: [
    'add {G}',
    'add {C}{C}',
    'add {W}{U}{B}{R}{G}',
    'add {U} or {B}',
    'add {R}, {G}, or {W}',
    'add one mana of any color',
    'add two mana of any one color',
    'add three mana of any one color',
    "add one mana of any color in your commander's color identity",
    'add {r}{r}, {r}{w}, or {w}{w}',
    'add {g}{g} or {w}{w}',
    'add one mana of any color that a land an opponent controls could produce',
    'add one mana of any type that a land you control could produce',
    // Stage P33 (D-150, CR 106.1b, 607.2d): the color the permanent chose as it entered.
    'add one mana of the chosen color',
    // Stage P34 (D-152, CR 106.1b, 605.3b): two mana each of a color chosen on its own; the fixed mana once for each of a count (CR 106.1).
    'add two mana in any combination of colors',
    'add three mana in any combination of colors',
    'add {R} for each tapped land your opponents control',
    'add {G}{G} for each creature you control',
    // CR 605.3b, 700.5: the color of the sentence "Choose a color." before it; the lowering reads it only there.
    'add an amount of mana of that color equal to your devotion to that color',
  ],
  rejects: [
    'add two mana of the chosen color',
    'add one mana of the chosen type',
    'add one mana of the chosen colors',
    'add {G} or {G}',
    'add two mana of any color',
    'add four mana of any one color',
    'add two mana of one color',
    'add {R}{W}, {W}{R}, or {R}{R}',
    'add {R}{R}, {R}{W}',
    'add {R}{R}, {W}, or {R}{W}',
    'add {R}{R} or {R}{R}',
    'add {X}',
    'add {2}',
    'add one mana of any type that a land an opponent controls could produce, then draw a card',
    'add one mana of any color that lands you control could produce',
    'add one mana of any color that a creature you control could produce',
    'add one mana of any color that a land you could produce',
    'add one mana in any combination of colors',
    'add two mana in any combination of color',
    'add two mana of any combination of colors',
    'add {R} or {G} for each creature you control',
    'add one mana of any color for each creature you control',
    'add {R} for each',
    'add an amount of mana of that color',
    'add an amount of mana of that color equal to your devotion to white',
    'add an amount of mana of that color equal to your devotion to that colors',
    'add an amount of mana of any color equal to your devotion to that color',
    'add an amount of mana of that color equal to your devotion to that color for each creature you control',
  ],
  parse: single(
    'effect.add-mana',
    satisfy(
      sequence(
        literal('add '),
        spanned(
          choice<IrManaSpec['what']>(
            // The choice first: "{U} or {B}" starts like the fixed symbols "{U}".
            map(MANA_CHOICE, (colors) => ({ kind: 'oneOf' as const, colors })),
            // Before the symbols: "{R}{R}, {R}{W}, or {W}{W}" starts like "{R}{R}".
            map(MANA_COMBINATION, (options) => ({ kind: 'combination' as const, options })),
            map(MANA_SYMBOLS, (symbols) => ({ kind: 'symbols' as const, symbols })),
            map(literal("one mana of any color in your commander's color identity"), () => ({
              kind: 'commanderIdentity' as const,
            })),
            // Before "any color": the same words start it.
            COULD_PRODUCE,
            // Stage P32 (D-147, CR 106.1b): "two mana of any one color" is two mana of one color the player chooses.
            map(pattern(/(two|three) mana of any one color(?![\p{L}\p{N}])/iu), (m) => ({
              kind: 'anyColor' as const,
              count: (m[1] ?? '').toLowerCase() === 'two' ? 2 : 3,
            })),
            // Stage P33 (D-150): one mana of the color the permanent chose (the engine's `chosenColor`).
            map(pattern(/one mana of the chosen color(?![\p{L}\p{N}])/iu), () => ({
              kind: 'chosenColor' as const,
            })),
            map(literal('one mana of any color'), () => ({ kind: 'anyColor' as const })),
            // Nykthos, Shrine to Nyx (CR 605.3b, 700.5): after "Choose a color.", as many mana of it as the devotion to it. Read here, lowered only after that sentence.
            map(
              pattern(
                /an amount of mana of that color equal to your devotion to that color(?![\p{L}\p{N}])/iu,
              ),
              () => ({ kind: 'devotionToChosenColor' as const }),
            ),
            // Stage P34 (D-152, CR 106.1b, 605.3b): "two mana in any combination of colors", each of a color chosen on its own.
            map(
              pattern(/(two|three) mana in any combination of colors(?![\p{L}\p{N}])/iu),
              (m) => ({
                kind: 'anyCombination' as const,
                count: (m[1] ?? '').toLowerCase() === 'two' ? 2 : 3,
              }),
            ),
          ),
        ),
        // "Add {R} for each tapped land your opponents control" (stage P34, D-152): fixed mana, once for each of a count.
        optional(quiet(FOR_EACH_TAIL_ENDING), null),
      ),
      // Only fixed mana is added once for each: a choice of colors would be chosen once or for each, which the words do not say.
      ([, what, each]) => each === null || what.value.kind === 'symbols',
    ),
    ([, what, each]) => ({
      verb: 'addMana',
      args: {
        mana: { kind: 'manaSpec', what: what.value, span: what.span, rule: 'effect.add-mana' },
        ...(each === null ? {} : { times: each }),
      },
    }),
  ),
});

/**
 * `effect.add-additional-mana`: "add an additional {C}", "add an additional {G}" (stage P31, D-140, CR 106.12, 605.1b): the mana a
 * triggered mana ability adds when a permanent is tapped for mana, on top of what that permanent made. One mana symbol; the lowering
 * reads it only as the effect of such a trigger.
 */
export const EFFECT_ADD_ADDITIONAL_MANA = defineRule<Clauses>({
  id: 'effect.add-additional-mana',
  family: 'effect',
  leading: ['add'],
  cites: ['CR 106.12 (Mana)', 'CR 605.1b (Mana Abilities)'],
  examples: ['add an additional {C}', 'add an additional {G}'],
  rejects: ['add an additional {X}', 'add an additional one mana of any color', 'add {C}'],
  parse: single(
    'effect.add-additional-mana',
    sequence(literal('add an additional '), spanned(ONE_SYMBOL)),
    ([, symbol]) => ({
      verb: 'addMana',
      args: {
        mana: {
          kind: 'manaSpec',
          what: { kind: 'symbols', symbols: [symbol.value] },
          span: symbol.span,
          rule: 'effect.add-additional-mana',
        },
        additional: {
          kind: 'flag',
          value: true,
          span: symbol.span,
          rule: 'effect.add-additional-mana',
        },
      },
    }),
  ),
});

/**
 * `effect.choose-color`: "choose a color" (CR 105.1, 700.5, 605.3b), the sentence of Nykthos, Shrine to Nyx that names the color the sentence after reads as "that color". The
 * color is chosen as the mana ability resolves, so the lowering reads it only together with `effect.add-mana`'s devotion wording (`lowerChosenColorDevotion`); on its own it
 * is reported as a choice of color the engine cannot make while an instruction resolves. Not read: another kind of choice, a restriction on the color, a number of colors.
 */
export const EFFECT_CHOOSE_COLOR = defineRule<Clauses>({
  id: 'effect.choose-color',
  family: 'effect',
  leading: ['choose'],
  cites: ['CR 105.1 (Colors)', 'CR 605.3b (Mana Abilities)', 'CR 700.5 (General)'],
  examples: ['choose a color'],
  rejects: [
    'choose',
    'choose color',
    'choose a colored creature',
    'choose a color other than white',
    'choose two colors',
    'choose a creature type',
    'choose a card',
    'choose any color',
    'choose a color and draw a card',
  ],
  parse: single('effect.choose-color', pattern(/choose a color(?![\p{L}\p{N}])/iu), () => ({
    verb: 'chooseColor',
    args: {},
  })),
});
