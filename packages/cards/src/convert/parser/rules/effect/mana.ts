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
import type { IrAmount, IrManaSpec, Span } from '../../ir/types';
import { counted } from '../amount/count';
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

/** The number words "in any combination of colors" takes. */
const COMBINATION_COUNT: Readonly<Record<string, number>> = { two: 2, three: 3, four: 4 };

/**
 * "two mana in any combination of {U}, {B}, and/or {R}" (CR 106.1b, 605.3b): each mana one of two to four different listed colors.
 * The list is joined by commas and a last "and/or" (or "or"); a color twice is not read, nor are symbols written in a row.
 */
const LISTED_COMBINATION = satisfy(
  map(
    pattern(
      /(two|three|four) mana in any combination of (\{[WUBRG]\}(?:(?:, and\/or |, or |, | and\/or | or )\{[WUBRG]\})+)(?![\p{L}\p{N}{])/iu,
    ),
    (m) => ({
      count: COMBINATION_COUNT[(m[1] ?? '').toLowerCase()] ?? 2,
      colors: [...(m[2] ?? '').matchAll(/\{([WUBRG])\}/gi)].map(
        (s) => (s[1] ?? '').toUpperCase() as 'W' | 'U' | 'B' | 'R' | 'G',
      ),
    }),
  ),
  (r) => r.colors.length <= 4 && new Set(r.colors).size === r.colors.length,
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
    // Issue 184 (Thriving Isle): a fixed color, or the one the permanent chose.
    'add {U} or one mana of the chosen color',
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
    'add one mana of any color among legendary creature cards in your graveyard',
    'add one mana of any color among cards in your graveyard',
    'add one mana of any color among creature cards in your graveyard',
    'add one mana of any color that a land an opponent controls could produce',
    'add one mana of any type that a land you control could produce',
    'add three mana of that type',
    // Stage P33 (D-150, CR 106.1b, 607.2d): the color the permanent chose as it entered.
    'add one mana of the chosen color',
    // Stage P34 (D-152, CR 106.1b, 605.3b): two mana each of a color chosen on its own; the fixed mana once for each of a count (CR 106.1).
    'add two mana in any combination of colors',
    'add three mana in any combination of colors',
    'add four mana in any combination of colors',
    // Relic of Sauron (CR 106.1b, 605.3b): each mana one of the colors listed.
    'add two mana in any combination of {u}, {b}, and/or {r}',
    'add three mana in any combination of {w} or {g}',
    // Issue 25 (D-319, CR 106.1b): two mana of different colors, never colorless and never the same color twice.
    'add two mana of different colors',
    'add three mana of different colors',
    'add {R} for each tapped land your opponents control',
    'add {G}{G} for each creature you control',
    'add {B} or {G} for each permanent destroyed this way',
    'add {R} or {G} for each creature you control',
    // Issue 102 (Crypt of Agadeem, CR 105.2): a color word before the cards counted.
    'add {B} for each black creature card in your graveyard',
    // CR 605.3b, 700.5: the color of the sentence "Choose a color." before it; the lowering reads it only there.
    'add an amount of mana of that color equal to your devotion to that color',
    // Kami of Whispered Hopes, Astral Cornucopia: a mana ability's count of mana of one chosen color.
    'add x mana of any one color',
    'add x mana in any combination of colors',
    'add one mana of that color for each charge counter on ~',
    // Issue 144 (Throne of Eldraine): a count of mana of the chosen color.
    'add four mana of the chosen color',
    'add two mana of the chosen color',
  ],
  rejects: [
    'add five mana of the chosen color',
    'add one mana of the chosen type',
    'add one mana of the chosen colors',
    'add {G} or {G}',
    'add {U} or one mana of the chosen colors',
    'add {U} or two mana of the chosen color',
    'add {U}{B} or one mana of the chosen color',
    'add two mana of any color',
    'add one mana of any color among',
    'add one mana of any color among creatures you control and then draw a card',
    'add one mana of any color among creature card in your graveyard',
    'add one mana of any colors among creature cards in your graveyard',
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
    'add one mana of that type',
    'add five mana of that type',
    'add three mana of that types',
    'add one mana of any color that a creature you control could produce',
    'add one mana of any color that a land you could produce',
    'add one mana in any combination of colors',
    'add five mana in any combination of colors',
    'add two mana in any combination of color',
    'add two mana of any combination of colors',
    'add two mana in any combination of {u}',
    'add two mana in any combination of {u}{b}',
    'add two mana in any combination of {u}, {u}, and/or {r}',
    'add two mana in any combination of {u}, {b}, and/or',
    'add two mana in any combination of {u}, {b},',
    'add two mana in any combination of {u}, {b}, and/or {r}, then draw a card',
    'add two mana of different color',
    'add two mana of different types',
    'add one mana of different colors',
    'add four mana of different colors',
    'add two mana of the same color',
    'add two mana of different colors for each creature you control',
    'add one mana of any color for each creature you control',
    'add {R} for each',
    'add an amount of mana of that color',
    'add an amount of mana of that color equal to your devotion to white',
    'add an amount of mana of that color equal to your devotion to that colors',
    'add an amount of mana of any color equal to your devotion to that color',
    'add an amount of mana of that color equal to your devotion to that color for each creature you control',
    'add one mana of that color',
    'add x mana of any one color for each creature you control',
    'add x mana of any color',
    'add two mana of that color for each charge counter on ~',
  ],
  parse: single(
    'effect.add-mana',
    satisfy(
      sequence(
        literal('add '),
        spanned(
          choice<IrManaSpec['what']>(
            // Issue 184 (Thriving Isle, CR 106.1, 607.2d): "{U} or one mana of the chosen color", before "{U} or {B}" and the fixed symbols that start the same way.
            map(
              pattern(/\{([WUBRG])\} or one mana of the chosen color(?![\p{L}\p{N}])/iu),
              (m) => ({
                kind: 'chosenColor' as const,
                or: (m[1] ?? 'W').toUpperCase() as 'W' | 'U' | 'B' | 'R' | 'G',
              }),
            ),
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
            // Incubation Druid (CR 106.7, 605.3b): after that sentence, "three mana of that type instead": all of the one type chosen.
            map(pattern(/(two|three|four) mana of that type(?![\p{L}\p{N}])/iu), (m) => ({
              kind: 'couldProduceThatType' as const,
              count: COMBINATION_COUNT[(m[1] ?? '').toLowerCase()] ?? 2,
            })),
            // Stage P32 (D-147, CR 106.1b): "two mana of any one color" is two mana of one color the player chooses.
            map(pattern(/(two|three) mana of any one color(?![\p{L}\p{N}])/iu), (m) => ({
              kind: 'anyColor' as const,
              count: (m[1] ?? '').toLowerCase() === 'two' ? 2 : 3,
            })),
            // Stage P33 (D-150): one mana of the color the permanent chose (the engine's `chosenColor`).
            map(pattern(/one mana of the chosen color(?![\p{L}\p{N}])/iu), () => ({
              kind: 'chosenColor' as const,
            })),
            // Issue 144 (Throne of Eldraine, CR 106.1b, 607.2d): "four mana of the chosen color", all of the one color the permanent chose.
            map(pattern(/(two|three|four) mana of the chosen color(?![\p{L}\p{N}])/iu), (m) => ({
              kind: 'chosenColor' as const,
              count: COMBINATION_COUNT[(m[1] ?? '').toLowerCase()] ?? 2,
            })),
            // The Grey Havens (CR 106.1b, 105.2, 605.3b): one mana of a color the cards of a zone have between them.
            map(
              satisfy(
                sequence(literal('one mana of any color among '), counted('effect.add-mana', true)),
                ([, of]) => of.filter.card === true && !of.other,
              ),
              ([, of]) => ({ kind: 'colorsAmongCards' as const, of }),
            ),
            map(literal('one mana of any color'), () => ({ kind: 'anyColor' as const })),
            // Nykthos, Shrine to Nyx (CR 605.3b, 700.5): after "Choose a color.", as many mana of it as the devotion to it. Read here, lowered only after that sentence.
            map(
              pattern(
                /an amount of mana of that color equal to your devotion to that color(?![\p{L}\p{N}])/iu,
              ),
              () => ({ kind: 'devotionToChosenColor' as const }),
            ),
            // Kami of Whispered Hopes (CR 106.1b, 107.3c): "X mana of any one color", X what the sentence's ", where X is ..." says; lowered only by a mana ability that has it.
            map(pattern(/x mana of any one color(?![\p{L}\p{N}])/iu), () => ({
              kind: 'anyOneColorX' as const,
            })),
            // Selvala, Heart of the Wilds (CR 106.1b, 107.3c): "X mana in any combination of colors", X what the sentence's ", where X is ..." says; lowered only by a mana ability that has it.
            map(pattern(/x mana in any combination of colors(?![\p{L}\p{N}])/iu), () => ({
              kind: 'anyCombinationX' as const,
            })),
            // Astral Cornucopia (CR 605.3b, 106.1b): after "Choose a color.", one mana of that color for each of a count; lowered only after that sentence.
            map(pattern(/one mana of that color(?![\p{L}\p{N}])/iu), () => ({
              kind: 'thatColor' as const,
            })),
            // Stage P34 (D-152, CR 106.1b, 605.3b): "two mana in any combination of colors", each of a color chosen on its own.
            map(
              pattern(/(two|three|four) mana in any combination of colors(?![\p{L}\p{N}])/iu),
              (m) => ({
                kind: 'anyCombination' as const,
                count: COMBINATION_COUNT[(m[1] ?? '').toLowerCase()] ?? 2,
              }),
            ),
            // Relic of Sauron (CR 106.1b, 605.3b): "two mana in any combination of {U}, {B}, and/or {R}", before the same words with "colors".
            map(LISTED_COMBINATION, (r) => ({
              kind: 'anyCombination' as const,
              count: r.count,
              colors: r.colors,
            })),
            // Issue 25 (D-319, CR 106.1b, 605.3b): "two mana of different colors": each a color chosen on its own, no color twice (colorless is not a color).
            map(pattern(/(two|three) mana of different colors(?![\p{L}\p{N}])/iu), (m) => ({
              kind: 'anyCombination' as const,
              count: (m[1] ?? '').toLowerCase() === 'two' ? 2 : 3,
              distinct: true as const,
            })),
          ),
        ),
        // "Add {R} for each tapped land your opponents control" (stage P34, D-152): fixed mana, once for each of a count.
        optional(quiet(FOR_EACH_TAIL_ENDING), null),
      ),
      // Only fixed mana is added once for each: a choice of colors would be chosen once or for each, which the words do not say.
      ([, what, each]) =>
        what.value.kind === 'thatColor'
          ? each !== null
          : each === null || what.value.kind === 'symbols' || what.value.kind === 'oneOf',
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

/** What an additional mana is: one symbol ("{C}", "{G}") or "one mana of any color" (CR 106.1b, 605.3b: the player chooses the color as the mana ability is activated). */
const ADDITIONAL_WHAT: Parser<{ spec: IrManaSpec['what']; span: Span }> = choice(
  map(spanned(ONE_SYMBOL), (s) => ({
    spec: { kind: 'symbols', symbols: [s.value] } as IrManaSpec['what'],
    span: s.span,
  })),
  map(spanned(literal('one mana of any color')), (s) => ({
    spec: { kind: 'anyColor' } as IrManaSpec['what'],
    span: s.span,
  })),
);

function additionalClause(
  rule: string,
  what: { spec: IrManaSpec['what']; span: { start: number; end: number } },
  controller: boolean,
) {
  return {
    verb: 'addMana',
    args: {
      mana: { kind: 'manaSpec' as const, what: what.spec, span: what.span, rule },
      additional: { kind: 'flag' as const, value: true as const, span: what.span, rule },
      ...(controller
        ? { controller: { kind: 'flag' as const, value: true as const, span: what.span, rule } }
        : {}),
    },
  };
}

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
    ([, symbol]) =>
      additionalClause(
        'effect.add-additional-mana',
        { spec: { kind: 'symbols', symbols: [symbol.value] }, span: symbol.span },
        false,
      ),
  ),
});

/**
 * `effect.controller-adds-additional-mana`: "its controller adds an additional one mana of any color", "its controller adds an additional {G}" (CR 106.12, 605.1b, 106.1b): the
 * mana a triggered mana ability adds for the controller of the permanent that was tapped for mana (an Aura's "enchanted land", whose controller taps it), on top of what it made.
 * One mana symbol or one mana of any color. The lowering reads it only as the effect of the trigger of `trigger.enchanted-tapped-for-mana`. Not read: another subject ("you",
 * "that player"), "an additional" left out, two mana, a color restriction ("one mana of any color that land could produce"), "add".
 */
export const EFFECT_CONTROLLER_ADDS_ADDITIONAL_MANA = defineRule<Clauses>({
  id: 'effect.controller-adds-additional-mana',
  family: 'effect',
  leading: ['its'],
  cites: ['CR 106.12 (Mana)', 'CR 605.1b (Mana Abilities)', 'CR 106.1b (Mana)'],
  examples: [
    'its controller adds an additional one mana of any color',
    'its controller adds an additional {G}',
  ],
  rejects: [
    'its controller adds one mana of any color',
    'its controller adds an additional two mana of any color',
    'its controller adds an additional one mana of any type',
    'its controller adds an additional {X}',
    'its controller add an additional {G}',
    'its owner adds an additional {G}',
    'you add an additional {G}',
    'its controller adds an additional one mana of any color that land could produce',
    'its controller adds an additional',
  ],
  parse: single(
    'effect.controller-adds-additional-mana',
    sequence(literal('its controller adds an additional '), ADDITIONAL_WHAT),
    ([, what]) => additionalClause('effect.controller-adds-additional-mana', what, true),
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

export const EFFECT_CHOOSE_CREATURE_TYPE = defineRule<Clauses>({
  id: 'effect.choose-creature-type',
  family: 'effect',
  leading: ['choose'],
  cites: ['CR 205.3m (Creature Types)', 'CR 608.2d (Resolving Spells and Abilities)'],
  examples: ['choose a creature type'],
  rejects: ['choose a creature', 'choose any creature type', 'choose two creature types'],
  parse: single(
    'effect.choose-creature-type',
    pattern(/choose a creature type(?![\p{L}\p{N}])/iu),
    () => ({ verb: 'chooseCreatureType', args: {} }),
  ),
});
