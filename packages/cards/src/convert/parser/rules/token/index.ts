/**
 * Token rules (CR 111): what "create ..." makes. A predefined token is read by name (CR 111.10:
 * Treasure, Food, Clue, Map, Blood); an inline definition has power and toughness, colors, creature
 * types and "creature token" (CR 111.3, 111.4). A token's abilities are read when they are keywords the engine can
 * grant ("with flying") or an ability in quotes that is an activated, a mana or a triggered ability ("with \"When this
 * token dies, you gain 1 life.\"", stage P35, D-176): any other text stays unparsed rather than creating a token that
 * lacks it.
 */
import {
  choice,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  quiet,
  satisfy,
  separatedBy1,
  sequence,
} from '../../combinators';
import type { IrAmount, IrNoun, IrQuotedAbility, IrToken } from '../../ir/types';
import { article, positiveCount, quantity } from '../amount/index';
import { EQUAL_AMOUNTS } from '../amount/scaled';
import { KEYWORD_WORD, KEYWORD_WORDS } from '../keyword/list';
import { defineRule, family, node, spanned } from '../registry';
import { namedTokenQuotedAbility, TOKEN_QUOTED_ABILITY } from '../static/quoted';
import { TOKEN_COPY_EXCEPT } from './copy-except';

export type Bare = Omit<IrToken, 'span' | 'rule'>;

/** " token" or " tokens": true for the plural. */
const TOKEN_WORD = map(pattern(/ tokens?(?![\p{L}\p{N}])/iu), (m) =>
  m[0].toLowerCase().endsWith('s'),
);

/**
 * The count of a "create" phrase: "a", "an", "two", "3", at least one, or "X" (stage P16, D-103: the
 * X of the spell or ability; X tokens are always plural, "X Treasure tokens").
 */
const COUNT = choice(
  map(spanned(positiveCount), ({ value, span }): IrAmount => ({ kind: 'number', value, span })),
  map(spanned(pattern(/X(?![\p{L}\p{N}])/u)), ({ span }): IrAmount => ({ kind: 'x', span })),
);

const PREDEFINED = ['Treasure', 'Food', 'Clue', 'Map', 'Blood'] as const;
type Predefined = (typeof PREDEFINED)[number];

/** "tapped " between the count and the token ("two tapped Treasure tokens", CR 110.5b: they enter tapped). */
const TAPPED = optional(
  map(literal('tapped '), () => true as const),
  null,
);

/** The words of a predefined token after its count: "tapped Treasure tokens" (the plural, when the count is X or "a number of", CR 111.10). */
function predefinedToken(count: Parser<IrAmount>, pluralOnly = false): Parser<Bare> {
  return map(
    satisfy(
      sequence(
        count,
        literal(' '),
        TAPPED,
        map(
          pattern(new RegExp(`(${PREDEFINED.join('|')})(?![\\p{L}\\p{N}])`, 'u')),
          (m) => m[1] as Predefined,
        ),
        TOKEN_WORD,
      ),
      ([amount, , , , plural]) => (amount.kind !== 'x' && !pluralOnly) || plural,
    ),
    ([amount, , tapped, predefined]): Bare => ({
      kind: 'token',
      predefined,
      count: amount,
      ...(tapped === null ? {} : { tapped }),
    }),
  );
}

/** `token.predefined`: "a Treasure token", "two Treasure tokens" (CR 111.10). */
export const TOKEN_PREDEFINED = defineRule<IrToken>({
  id: 'token.predefined',
  family: 'token',
  leading: [],
  cites: ['CR 111.10 (Tokens)', 'CR 111.10a (Tokens)'],
  examples: [
    'a Treasure token',
    'two Treasure tokens',
    'a Food token',
    'a Clue token',
    'X Treasure tokens',
    'X Food tokens',
    'a tapped Treasure token',
    'two tapped Treasure tokens',
  ],
  rejects: [
    'a Gold token',
    'a Treasure',
    'a 1/1 white Soldier creature token',
    'a Treasure token tapped',
    'X Treasure token',
    'Y Treasure tokens',
    'a tapped Treasure',
    'a tapped tapped Treasure token',
  ],
  parse: node<Bare, IrToken>('token.predefined', predefinedToken(COUNT), (b) => b),
});

/** "devour 2" (CR 702.82a, stage P40, D-186): the one keyword with a number a token may have; written "devour N" in the keywords of the token. */
const DEVOUR_WORD: Parser<string> = map(
  pattern(/devour ([1-9]\d*)(?![\p{L}\p{N}])/iu),
  (m) => `devour ${m[1] ?? ''}`,
);

/**
 * The keywords of a token: a list of those the engine can grant, or one keyword and "devour N" ("flying and devour 2"), or "devour N" alone. A longer
 * list with "devour N" at its end is not read (the list of grantable words is written "A, B, and C" and stops at the keyword it does not know).
 */
const TOKEN_KEYWORDS: Parser<string[]> = choice(
  map(
    satisfy(
      sequence(KEYWORD_WORDS, literal(' and '), DEVOUR_WORD),
      ([words]) => words.length === 1,
    ),
    ([words, , devour]): string[] => [...words, devour],
  ),
  map(DEVOUR_WORD, (devour): string[] => [devour]),
  KEYWORD_WORDS,
);

/**
 * What follows " with " in the description of a token: keywords it has, an ability in quotes, or both ("with defender and \"When this token
 * dies, ...\"", "with flying and '{R}: ...'" inside the quotes of another token; with a list of keywords the "and" has the comma of the list,
 * stage P45, D-197: "with flying, haste, and \"When ~ dies, ...\""). The keywords are those the engine can grant, and "devour N".
 * `quoted` reads the ability in quotes: a token with a name of its own reads that name as the token inside them.
 */
const tokenWith = (
  quoted: Parser<IrQuotedAbility>,
): Parser<{ keywords: string[]; abilities: IrQuotedAbility[] }> =>
  choice(
    // "with flying, haste, and \"...\"": the ability in quotes is the last of a list of three, so the keywords before it are joined by commas.
    map(
      satisfy(
        sequence(separatedBy1(KEYWORD_WORD, literal(', ')), literal(', and '), quoted),
        ([words]) => words.length >= 2 && new Set(words).size === words.length,
      ),
      ([keywords, , one]) => ({ keywords, abilities: [one] }),
    ),
    map(
      sequence(
        TOKEN_KEYWORDS,
        optional(
          map(sequence(choice(literal(', and '), literal(' and ')), quoted), ([, one]) => one),
          null,
        ),
      ),
      ([keywords, one]) => ({ keywords, abilities: one === null ? [] : [one] }),
    ),
    map(quoted, (one) => ({ keywords: [] as string[], abilities: [one] })),
  );

const TOKEN_WITH = tokenWith(TOKEN_QUOTED_ABILITY);

const COLOR_WORD = pattern(/(white|blue|black|red|green)(?![\p{L}\p{N}])/iu);

/** "colorless", or one or more colors joined by commas and "and" ("white and blue"). */
const COLORS = choice<string[]>(
  map(pattern(/colorless(?![\p{L}\p{N}])/iu), (): string[] => []),
  satisfy(
    map(
      separatedBy1(
        map(COLOR_WORD, (m) => (m[1] ?? '').toLowerCase()),
        choice(literal(', and '), literal(', '), literal(' and ')),
      ),
      (colors) => colors,
    ),
    (colors) => new Set(colors).size === colors.length,
  ),
);

/** Creature types as printed: capitalized words ("Soldier", "Elf Warrior"). */
const SUBTYPES = map(pattern(/[A-Z][a-z]+(?: [A-Z][a-z]+)*/), (m) => m[0].split(' '));

/**
 * " named Kobolds of Kher Keep" (stage P39, D-184, CR 111.4): the name a token is given, capitalized words that "of", "the" and the like may join, up to the
 * comma, the period or the "with" that follows. The name is the token's own: it has nothing to do with its creature types.
 */
const TOKEN_NAME = map(
  pattern(/[A-Z][\p{L}'’-]*(?:(?: (?:of|the|de|la|in|on))* [A-Z][\p{L}'’-]*)*/u),
  (m) => m[0],
);

/**
 * " named ~'s Pridemate" (D-266): the name of a token that begins with the name of the card that makes it, as Ajani's Pridemate does. The card's name was
 * written `~` when the text was normalized (a legendary card's short name too), so the possessive after it is what shows it is a name and not the card's: `~'s`
 * and one or more capitalized words, nothing else of `~`. The lowering puts the card's own short name back; a name that is only `~` or has it later is not read.
 */
const SELF_TOKEN_NAME = map(
  pattern(/~['’]s(?:(?: (?:of|the|de|la|in|on))* [A-Z][\p{L}'’-]*)+/u),
  (m) => m[0],
);

/** The words of a described token after its count: "tapped 2/2 black Zombie creature tokens with menace" (CR 111.3, 111.4). */
export function customToken(count: Parser<IrAmount>, pluralOnly = false): Parser<Bare> {
  return map(
    satisfy(
      sequence(
        count,
        literal(' '),
        TAPPED,
        pattern(/(\d+)\/(\d+) /),
        COLORS,
        literal(' '),
        SUBTYPES,
        choice(
          // Stage P63 (D-216): "a 3/3 colorless Golem enchantment artifact creature token" (Hammer of Purphoros).
          map(literal(' enchantment artifact creature'), () => [
            'enchantment',
            'artifact',
            'creature',
          ]),
          map(literal(' artifact creature'), () => ['artifact', 'creature']),
          map(literal(' creature'), () => ['creature']),
        ),
        TOKEN_WORD,
        optional(
          map(
            sequence(literal(' named '), choice(SELF_TOKEN_NAME, TOKEN_NAME)),
            ([, name]) => name,
          ),
          null,
        ),
        optional(quiet(map(sequence(literal(' with '), TOKEN_WITH), ([, what]) => what)), {
          keywords: [] as string[],
          abilities: [] as IrQuotedAbility[],
        }),
      ),
      ([amount, , , , , , , , plural]) => (amount.kind !== 'x' && !pluralOnly) || plural,
    ),
    ([
      amount,
      ,
      tapped,
      pt,
      colors,
      ,
      subtypes,
      types,
      ,
      named,
      { keywords, abilities },
    ]): Bare => ({
      kind: 'token',
      ...(tapped === null ? {} : { tapped }),
      ...(named === null ? {} : { named }),
      power: Number(pt[1]),
      toughness: Number(pt[2]),
      colors,
      types,
      subtypes,
      count: amount,
      ...(keywords.length > 0 ? { keywords } : {}),
      ...(abilities.length > 0 ? { abilities } : {}),
    }),
  );
}

/**
 * `token.custom`: "a 1/1 white Soldier creature token", "two 2/2 black Zombie creature tokens",
 * "a 1/1 colorless Servo artifact creature token" (CR 111.3 a token's characteristics come from
 * the effect, 111.4 name and subtypes). Power and toughness are numbers; the colors and at least
 * one creature type are written out. The keywords the engine can grant may follow ("a 1/1 white
 * Spirit creature token with flying", "with flying and vigilance", stage P15; CR 702: a keyword
 * ability of the token's own). Any other ability, in quotes or not ("with changeling", "with
 * \"Sacrifice this token: ...\"") is not read, so a token is never created without it.
 */
export const TOKEN_CUSTOM = defineRule<IrToken>({
  id: 'token.custom',
  family: 'token',
  leading: [],
  cites: ['CR 111.3 (Tokens)', 'CR 111.4 (Tokens)', 'CR 205.3m (Subtypes)'],
  examples: [
    'a 1/1 white Soldier creature token',
    'two 2/2 black Zombie creature tokens',
    'a 1/1 colorless Servo artifact creature token',
    'a 3/3 colorless Golem enchantment artifact creature token',
    'three 1/1 white and blue Spirit creature tokens',
    'a 3/3 green Beast creature token',
    'a 1/1 white Spirit creature token with flying',
    'two 1/1 colorless Thopter artifact creature tokens with flying',
    'a 1/1 black Snake creature token with deathtouch',
    'a 2/2 white Knight creature token with first strike and vigilance',
    'a 3/3 green Beast creature token with trample, reach, and haste',
    'X 1/1 white Soldier creature tokens',
    'X 2/2 black Zombie creature tokens',
    'a tapped 2/2 black Zombie creature token',
    'thirteen tapped 2/2 black Zombie creature tokens',
    'two 2/2 black Zombie Knight creature tokens with menace',
    // Stage P35 (D-176, CR 111.4, 113.1): an ability the token has, in quotes, alone or after keywords; a quote inside the quote is the ability of
    // the token it makes.
    'a 0/1 colorless Eldrazi Spawn creature token with "Sacrifice ~: Add {C}."',
    'a 1/1 black and green Pest creature token with "When ~ dies, you gain 1 life."',
    'a 0/2 red Dragon Egg creature token with defender and "When ~ dies, create a 2/2 red Dragon creature token with flying and \'{R}: ~ gets +1/+0 until end of turn.\'"',
    'a 1/1 white Soldier creature token with flying and "{T}: You gain 1 life."',
    // Stage P39 (D-184, CR 111.4): a token with a name of its own.
    'X 0/1 red Kobold creature tokens named Kobolds of Kher Keep',
    'a 1/1 white Soldier creature token named Hero',
    'two 2/2 black Zombie creature tokens named Dead Knights with menace',
    // Stage P40 (D-186, CR 702.82a): a token with devour.
    'a 1/1 red and green Dragon creature token with flying and devour 2',
    'a 2/2 red Goblin creature token with devour 1',
    'a 1/1 red Dragon creature token with first strike and devour 3',
  ],
  rejects: [
    'a 1/1 red and green Dragon creature token with devour',
    'a 1/1 red and green Dragon creature token with devour 0',
    'a 1/1 red and green Dragon creature token with devour X',
    'a 1/1 red and green Dragon creature token with devour 2 and flying',
    'a 1/1 red and green Dragon creature token with flying, devour 2',
    'a 1/1 red and green Dragon creature token with flying, trample and devour 2',
    'a 1/1 red and green Dragon creature token with flying, trample, and devour 2',
    'a 1/1 red and green Dragon creature token with flying and trample and devour 2',
    'a 1/1 red and green Dragon creature token with devour 2 and devour 1',
    'a 1/1 red and green Dragon creature token with devour artifact 2',
    'a tapped 1/1 Soldier creature token',
    'a 1/1 white Soldier creature token with flying and flying',
    'a 1/1 white Soldier creature token with',
    'a 1/1 white Soldier creature token with flash',
    'a 1/1 white Soldier creature token with changeling',
    'a 1/1 white Soldier creature token with "Sacrifice ~: Draw a card"',
    'a 1/1 white Soldier creature token with "Sacrifice ~: Draw a card." and flying',
    'a 1/1 white Soldier creature token with flying and "Sacrifice ~: Draw a card"',
    'a 1/1 white Soldier creature token with "Flying" and "{T}: You gain 1 life."',
    'a 1/1 white Soldier creature token with "{T}: You gain 1 life." and "{T}: You gain 1 life."',
    'a 1/1 white Soldier creature token tapped',
    'a 1/1 Soldier creature token',
    'a white Soldier creature token',
    'X 1/1 white Soldier creature token',
    'a Treasure token',
    'a 1/1 white soldier creature token',
    'a 1/1 white Soldier creature token named',
    'a 1/1 white Soldier creature token named hero',
    'a 1/1 white Soldier creature token named Hero named Villain',
  ],
  parse: node<Bare, IrToken>('token.custom', customToken(COUNT), (b) => b),
});

/**
 * `token.named-legendary`: "Smaug, a legendary 6/6 red Dragon creature token with flying, haste, and \"When Smaug dies, create fourteen Treasure
 * tokens.\"" (stage P45, D-197, CR 111.4, 205.4, 704.5j): one token with a name of its own that the effect gives, and the supertype legendary. The
 * name inside the quotes is the token (as `~` is the card in the text of a card). One token ("a"), as the legendary ones are: the legend rule would
 * put a second one into its owner's graveyard.
 */
export const TOKEN_NAMED_LEGENDARY = defineRule<IrToken>({
  id: 'token.named-legendary',
  family: 'token',
  leading: [],
  cites: ['CR 111.4 (Tokens)', 'CR 205.4 (Supertypes)', 'CR 704.5j (State-Based Actions)'],
  examples: [
    'Smaug, a legendary 6/6 red Dragon creature token with flying, haste, and "When Smaug dies, create fourteen Treasure tokens."',
    'Hero, a legendary 2/2 white Soldier creature token',
    'Hero, a legendary 2/2 white Soldier creature token with flying',
    'Dead Knight of Doom, a legendary 3/3 black Zombie Knight creature token with menace',
    'Hero, a legendary 2/2 white Soldier creature token with "When Hero dies, you gain 1 life."',
    'Hero, a legendary 2/2 white Soldier creature token with flying and "When Hero dies, you gain 1 life."',
  ],
  rejects: [
    'Smaug, a 6/6 red Dragon creature token',
    'Smaug, a legendary 6/6 red Dragon creature token with',
    'Smaug, a legendary 6/6 red Dragon creature token with flash',
    'Smaug, a legendary 6/6 Dragon creature token',
    'Smaug, a legendary red Dragon creature token',
    'Smaug, two legendary 6/6 red Dragon creature tokens',
    'smaug, a legendary 6/6 red Dragon creature token',
    'a legendary 6/6 red Dragon creature token',
    'Smaug a legendary 6/6 red Dragon creature token',
    'Smaug, a legendary 6/6 red Dragon creature token named Smaug',
    'Smaug, a legendary 6/6 red Dragon creature token with "When Smaug dies, create fourteen Treasure tokens"',
    'Smaug, a legendary 6/6 red Dragon creature token with flying, haste and "When Smaug dies, create fourteen Treasure tokens." and more',
    'Smaug, a legendary 6/6 red Dragon creature token tapped',
  ],
  parse: node<Bare, IrToken>(
    'token.named-legendary',
    (ctx, pos) => {
      const named = spanned(TOKEN_NAME)(ctx, pos);
      if (!named.ok) return named;
      const name = named.value.value;
      const rest = map(
        sequence(
          literal(', a legendary '),
          pattern(/(\d+)\/(\d+) /),
          COLORS,
          literal(' '),
          SUBTYPES,
          choice(
            map(literal(' artifact creature'), () => ['artifact', 'creature']),
            map(literal(' creature'), () => ['creature']),
          ),
          satisfy(TOKEN_WORD, (plural) => !plural),
          optional(
            quiet(
              map(
                sequence(literal(' with '), tokenWith(namedTokenQuotedAbility(name))),
                ([, w]) => w,
              ),
            ),
            { keywords: [] as string[], abilities: [] as IrQuotedAbility[] },
          ),
        ),
        ([, pt, colors, , subtypes, types, , { keywords, abilities }]): Bare => ({
          kind: 'token',
          named: name,
          legendary: true,
          power: Number(pt[1]),
          toughness: Number(pt[2]),
          colors,
          types,
          subtypes,
          count: { kind: 'number', value: 1, span: named.value.span },
          ...(keywords.length > 0 ? { keywords } : {}),
          ...(abilities.length > 0 ? { abilities } : {}),
        }),
      )(ctx, named.pos);
      return rest;
    },
    (b) => b,
  ),
});

/** "a number of": a count that the sentence gives after the tokens, "equal to ..." (a placeholder of 1 until then). */
const A_NUMBER_OF: Parser<IrAmount> = map(
  spanned(pattern(/a number of(?![\p{L}\p{N}])/iu)),
  ({ span }): IrAmount => ({ kind: 'number', value: 1, span }),
);

/**
 * `token.number-of`: "a number of tapped Treasure tokens equal to its power", "a number of 1/1 white Soldier creature tokens equal to the number
 * of creatures you control" (stage P35, D-176, CR 111.2, 608.2h): the count is the amount after "equal to", worked out as the instruction runs
 * (from last-known information when its object has left the battlefield). The tokens are plural, a predefined token or one the text describes.
 */
export const TOKEN_NUMBER_OF = defineRule<IrToken>({
  id: 'token.number-of',
  family: 'token',
  leading: ['a'],
  cites: [
    'CR 111.2 (Tokens)',
    'CR 608.2h (Resolving Spells and Abilities)',
    'CR 110.5b (Permanents)',
  ],
  examples: [
    'a number of tapped Treasure tokens equal to its power',
    'a number of Treasure tokens equal to its power',
    'a number of Food tokens equal to that creature\u2019s power',
    'a number of 1/1 white Soldier creature tokens equal to its power',
  ],
  rejects: [
    'a number of Treasure token equal to its power',
    'a number of Treasure tokens',
    'a number of Treasure tokens equal to',
    'a number of tokens equal to its power',
    'a number of Gold tokens equal to its power',
    'a number of tapped tapped Treasure tokens equal to its power',
    'a number of Treasure tokens equal to its power and draw a card',
  ],
  parse: node<Bare, IrToken>(
    'token.number-of',
    map(
      sequence(
        satisfy(
          choice(predefinedToken(A_NUMBER_OF, true), customToken(A_NUMBER_OF, true)),
          (token) => token.abilities === undefined,
        ),
        literal(' '),
        family<IrAmount>('amount', { only: EQUAL_AMOUNTS }),
      ),
      ([token, , count]): Bare => ({ ...token, count }),
    ),
    (b) => b,
  ),
});

/** What a copy can be made of: this permanent, one target permanent, or "it" (CR 707.2). */
const COPY_SOURCES = ['noun.self', 'noun.target-permanent', 'noun.it'] as const;

const COPY_SOURCE = satisfy(family<IrNoun>('noun', { only: COPY_SOURCES }), (noun) => !noun.plural);

/**
 * `token.copy`: "a token that's a copy of target creature" and "two tokens that are copies of
 * target creature" (CR 707.2: a copy has the copiable values of the original; CR 111.4: a token
 * that is a copy has the original's name). One token is counted with "a"/"an", several with a number
 * of two or more, each in its own grammatical form. The source is one permanent: `~`, "target
 * <permanent>" or "it", which the binding pass resolves. A copy "except ..." (CR 707.9), of a token
 * or a card in a graveyard, of equipped creature or of several permanents is not read, and neither
 * is a rider such as "That token gains haste".
 */
export const TOKEN_COPY = defineRule<IrToken>({
  id: 'token.copy',
  family: 'token',
  leading: [],
  cites: ['CR 707.2 (Copying Objects)', 'CR 111.4 (Tokens)', 'CR 707.9 (Copying Objects)'],
  examples: [
    "a token that's a copy of target creature",
    'a token that’s a copy of target creature you control',
    "a token that's a copy of ~",
    "a token that's a copy of it",
    'two tokens that are copies of target creature',
    'three tokens that are copies of ~',
    "a token that's a copy of target artifact",
  ],
  rejects: [
    "a token that's a copy of target creature, except it's a 1/1",
    "a token that's a copy of target token you control",
    "a token that's a copy of equipped creature",
    "a token that's a copy of two target creatures",
    "a token that's a copy of target creatures",
    "a token that's a copy of that creature",
    "one token that's a copy of target creature",
    "two tokens that's a copy of target creature",
    'a token that are copies of target creature',
    'X tokens that are copies of target creature',
    'a Treasure token',
  ],
  parse: node<Bare, IrToken>(
    'token.copy',
    choice<Bare>(
      map(
        sequence(
          map(spanned(article), ({ value, span }): IrAmount => ({ kind: 'number', value, span })),
          pattern(/ token that['’]s a copy of /i),
          COPY_SOURCE,
        ),
        ([count, , copyOf]): Bare => ({ kind: 'token', copyOf, count }),
      ),
      map(
        sequence(
          map(
            spanned(satisfy(quantity, (n) => n >= 2)),
            ({ value, span }): IrAmount => ({ kind: 'number', value, span }),
          ),
          pattern(/ tokens that are copies of /i),
          COPY_SOURCE,
        ),
        ([count, , copyOf]): Bare => ({ kind: 'token', copyOf, count }),
      ),
    ),
    (b) => b,
  ),
});

export const TOKEN_RULES = [
  TOKEN_PREDEFINED,
  TOKEN_CUSTOM,
  TOKEN_NAMED_LEGENDARY,
  TOKEN_NUMBER_OF,
  // Before `token.copy`: a family takes the first rule that reads, and the plain copy would stop short of ", except it's ...".
  TOKEN_COPY_EXCEPT,
  TOKEN_COPY,
];
