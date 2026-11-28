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
import { KEYWORD_WORD, keywordWordsOf } from '../keyword/list';
import { PROTECTION_COLORS } from '../keyword/protection';
import { defineRule, family, node, spanned } from '../registry';
import {
  namedTokenQuotedAbility,
  readQuotedAbility,
  TOKEN_QUOTED_ABILITY_OR_CREW_BONUS,
} from '../static/quoted';
import { AURA_TOKEN_RULES } from './aura';
import {
  TOKEN_COPIES_EXCEPT_ADDITIVE,
  TOKEN_COPIES_HALF_PT,
  TOKEN_COPY_EXCEPT,
  TOKEN_COPY_EXCEPT_ADDITIVE,
} from './copy-except';
import { TOKEN_COPY_EXCEPT_PT, TOKEN_COPY_EXCEPT_PT_SUBTYPE } from './copy-except-pt';
import { TOKEN_COPY_EXCEPT_ADDITIVE_TYPES, TOKEN_COPY_EXCEPT_SET_TYPES } from './copy-except-types';
import { GALADRIEL_G3_TOKEN_RULES } from './galadriel-g3';
import { TOKEN_COPIES_X } from './prismari-g1';
import { SEEK_OUT_TOKEN_RULES } from './seek-out';

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
  map(
    spanned(pattern(/twice X(?![\p{L}\p{N}])/iu)),
    ({ span }): IrAmount => ({
      kind: 'multiple',
      factor: 2,
      of: { kind: 'x', span },
      span,
    }),
  ),
  // Quandrix Unlimited deck, group D2 (The Goose Mother, CR 107.1a): "create half X, rounded up Food tokens" (`normalizeOracleText` writes the rounding after the X).
  map(
    spanned(pattern(/half X, rounded (up|down)(?![\p{L}\p{N}])/iu)),
    ({ value, span }): IrAmount => ({
      kind: 'half',
      of: { kind: 'x', span },
      round: (value[1] ?? 'down').toLowerCase() as 'down' | 'up',
      span,
    }),
  ),
  map(spanned(positiveCount), ({ value, span }): IrAmount => ({ kind: 'number', value, span })),
  map(spanned(pattern(/X(?![\p{L}\p{N}])/u)), ({ span }): IrAmount => ({ kind: 'x', span })),
  // Issue 160 (D-626, CR 120.3): "Whenever ~ is dealt damage, create that many 1/1 ... tokens": the damage of the event that caused the trigger. The engine's `triggerDamage`,
  // which `validateCard` allows only in a trigger that has damage; the tokens are plural.
  map(
    spanned(pattern(/that many(?![\p{L}\p{N}])/iu)),
    ({ span }): IrAmount => ({ kind: 'triggerDamage', thatMany: true, span }),
  ),
);

const PREDEFINED = [
  'Treasure',
  'Food',
  'Clue',
  'Gold',
  'Map',
  'Gingerbrute',
  'Lander',
  'Wicked Role',
  'Junk',
  'Blood',
] as const;
type Predefined = (typeof PREDEFINED)[number];

/** "tapped " between the count and the token ("two tapped Treasure tokens", CR 110.5b: they enter tapped). */
const TAPPED = optional(
  map(literal('tapped '), () => true as const),
  null,
);

/**
 * "tapped and attacking " (CR 508.4, Ghalta and Mavren): a custom creature token created tapped that joins the combat; "attacking " alone is not read (the engine's
 * `enterAttacking` has no untapped form to name). Before the plain "tapped ", of which it is the start.
 */
const TAPPED_AND_ATTACKING = optional(
  choice(
    map(literal('tapped and attacking '), (): true | 'attacking' => 'attacking'),
    map(literal('tapped '), (): true | 'attacking' => true),
  ),
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
      ([amount, , , , plural]) =>
        (amount.kind !== 'x' && amount.kind !== 'half' && !pluralOnly) || plural,
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
    'a Gold token',
    'a Gingerbrute token',
    // CR 111.10u (Horizon Explorer, Seedship Impact).
    'a Lander token',
    // CR 111.10, 303.7 (Witch's Mark): a Role token.
    'a Wicked Role token',
    // CR 111.10t (Break Down).
    'a Junk token',
    // CR 111.10 (Moonstone Eulogist): a Blood token.
    'a Blood token',
    'X Treasure tokens',
    'X Food tokens',
    'a tapped Treasure token',
    'two tapped Treasure tokens',
  ],
  rejects: [
    'a Gold',
    'a Treasure',
    'a 1/1 white Soldier creature token',
    'a Treasure token tapped',
    'X Treasure token',
    'Y Treasure tokens',
    'a tapped Treasure',
    'a tapped tapped Treasure token',
    'a Wicked token',
    'a Role token',
  ],
  parse: node<Bare, IrToken>('token.predefined', predefinedToken(COUNT), (b) => b),
});

/** "devour 2" (CR 702.82a, stage P40, D-186): the one keyword with a number a token may have; written "devour N" in the keywords of the token. */
const DEVOUR_WORD: Parser<string> = map(
  pattern(/devour ([1-9]\d*)(?![\p{L}\p{N}])/iu),
  (m) => `devour ${m[1] ?? ''}`,
);

/** "toxic N" (CR 702.164): a numbered keyword a token may have alongside a quoted ability. */
const TOXIC_WORD: Parser<string> = map(
  pattern(/toxic ([1-9]\d*)(?![\p{L}\p{N}])/iu),
  (m) => `toxic ${m[1] ?? ''}`,
);

/** "crew 2" (CR 702.122a, issue 105): the keyword of a Vehicle token; written "crew N" in the keywords of the token. */
const CREW_WORD: Parser<string> = map(
  pattern(/crew ([1-9]\d*)(?![\p{L}\p{N}])/iu),
  (m) => `crew ${m[1] ?? ''}`,
);

/**
 * "changeling" (CR 702.73a, issue 104): a keyword a token has from its own text. It is a characteristic-defining ability the engine runs in every zone, and no static or
 * effect can grant it (the engine's `GRANTABLE_KEYWORDS`), so only the token's own description reads it, not `KEYWORD_WORD`.
 */
const CHANGELING_WORD: Parser<string> = map(
  pattern(/changeling(?![\p{L}\p{N}])/iu),
  () => 'changeling',
);

/**
 * "protection from black" (CR 702.16a, 111.4): a token's own keyword, one word that carries its colors ("protection from black and from red"); the lowering reads it back into the
 * engine's protection from colors. Other qualities (a card type, multicolored, a player) are not read.
 */
const PROTECTION_WORD: Parser<string> = map(
  PROTECTION_COLORS,
  (colors) => `protection from ${colors.join(' and from ')}`,
);

/** The words a token's own description may name as keywords: those the engine can grant, changeling and protection from colors. */
const TOKEN_KEYWORD_WORD: Parser<string> = choice(KEYWORD_WORD, CHANGELING_WORD, PROTECTION_WORD);
const TOKEN_KEYWORD_WORDS: Parser<string[]> = keywordWordsOf(TOKEN_KEYWORD_WORD);

/**
 * The keywords of a token: a list of those the engine can grant, or one keyword and "devour N" ("flying and devour 2"), or "devour N" alone. A longer
 * list with "devour N" at its end is not read (the list of grantable words is written "A, B, and C" and stops at the keyword it does not know).
 */
const TOKEN_KEYWORDS: Parser<string[]> = choice(
  map(
    satisfy(
      sequence(TOKEN_KEYWORD_WORDS, literal(' and '), choice(DEVOUR_WORD, TOXIC_WORD, CREW_WORD)),
      ([words]) => words.length === 1,
    ),
    ([words, , numbered]): string[] => [...words, numbered],
  ),
  map(choice(DEVOUR_WORD, TOXIC_WORD, CREW_WORD), (numbered): string[] => [numbered]),
  TOKEN_KEYWORD_WORDS,
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
        sequence(separatedBy1(TOKEN_KEYWORD_WORD, literal(', ')), literal(', and '), quoted),
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
    // Pursued Whale (CR 111.4, 113.1): "with \"~ can't block\" and \"Creatures you control attack each combat if able.\"": two static abilities in quotes, no two alike.
    map(
      satisfy(
        sequence(quoted, literal(' and '), quoted),
        ([a, , b]) =>
          a.ability.kind === 'static' && b.ability.kind === 'static' && a.text !== b.text,
      ),
      ([a, , b]) => ({ keywords: [] as string[], abilities: [a, b] }),
    ),
    map(quoted, (one) => ({ keywords: [] as string[], abilities: [one] })),
  );

const TOKEN_WITH = tokenWith(TOKEN_QUOTED_ABILITY_OR_CREW_BONUS);

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
 * The name of a legendary token: a token name, and the epithet some legends carry ("Primo, the Indivisible", CR 111.4, 201.2: the whole of it is the name). The epithet is the
 * comma, "the" and capitalized words; the comma before ", a legendary" is the one that ends the name.
 */
const LEGENDARY_TOKEN_NAME = map(
  sequence(
    TOKEN_NAME,
    optional(
      map(pattern(/, the [A-Z][\p{L}'’-]*(?: [A-Z][\p{L}'’-]*)*/u), (m) => m[0]),
      '',
    ),
  ),
  ([name, epithet]) => `${name}${epithet}`,
);

/**
 * " named ~'s Pridemate" (D-266): the name of a token that begins with the name of the card that makes it, as Ajani's Pridemate does. The card's name was
 * written `~` when the text was normalized (a legendary card's short name too), so the possessive after it is what shows it is a name and not the card's: `~'s`
 * and one or more capitalized words, nothing else of `~`. The lowering puts the card's own short name back; a name that is only `~` or has it later is not read.
 */
const SELF_TOKEN_NAME = map(
  choice(
    pattern(/~['’]s(?:(?: (?:of|the|de|la|in|on))* [A-Z][\p{L}'’-]*)+/u),
    // Issue 81 (Kher Keep, CR 111.4): "Kobolds of ~": capitalized words, "of" and the card's own name, which ends the token's name.
    pattern(/[A-Z][\p{L}'’-]*(?: [A-Z][\p{L}'’-]*)* of ~(?![\p{L}\p{N}~])/u),
  ),
  (m) => m[0],
);

/** The words of a described token after its count: "tapped 2/2 black Zombie creature tokens with menace" (CR 111.3, 111.4). */
export function customToken(count: Parser<IrAmount>, pluralOnly = false): Parser<Bare> {
  return map(
    satisfy(
      sequence(
        count,
        literal(' '),
        TAPPED_AND_ATTACKING,
        pattern(/(\d+|X)\/(\d+|X) /),
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
          // CR 205.2a, 111.4 (Phenomenon Investigators, Soaring Lightbringer): "a 2/2 black Horror enchantment creature token".
          map(literal(' enchantment creature'), () => ['enchantment', 'creature']),
          // CR 205.3i, 305.6 (Verdant Kraken): "a 3/3 green Forest Tentacle land creature token".
          map(literal(' land creature'), () => ['land', 'creature']),
          map(literal(' creature'), () => ['creature']),
          // Issue 105 (Pia Nalaar, Chief Mechanic): "an X/X colorless Vehicle artifact token", which is no creature until it is crewed (CR 301.7).
          map(literal(' artifact'), () => ['artifact']),
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
        // D-648 (CR 508.4): "that's attacking that opponent", said of one token.
        optional(
          quiet(
            map(
              pattern(/ that['’]s attacking that opponent(?![\p{L}\p{N}])/iu),
              () => true as const,
            ),
          ),
          null,
        ),
        // CR 508.4, 110.5b: "that's tapped and attacking", said of one token, "that are tapped and attacking" of several (Hero of Bladehold).
        optional(
          quiet(
            map(
              pattern(/ that(?:['’]s| are) tapped and attacking(?![\p{L}\p{N}])/iu),
              () => true as const,
            ),
          ),
          null,
        ),
      ),
      ([amount, , , pt, , , , , plural]) =>
        ((amount.kind !== 'x' && amount.kind !== 'half' && !pluralOnly) || plural) &&
        ((pt[1] === 'X' && pt[2] === 'X') || (pt[1] !== 'X' && pt[2] !== 'X')),
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
      attackingThatOpponent,
      tappedAndAttacking,
    ]): Bare => ({
      kind: 'token',
      ...(attackingThatOpponent === null ? {} : { attackingThatOpponent }),
      ...(tappedAndAttacking === null ? {} : { tappedAndAttacking }),
      ...(tapped === null ? {} : { tapped: true as const }),
      ...(tapped === 'attacking' ? { attacking: true as const } : {}),
      ...(named === null ? {} : { named }),
      ...(pt[1] === 'X'
        ? { ptAmount: true as const }
        : { power: Number(pt[1]), toughness: Number(pt[2]) }),
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
 * ability of the token's own). Any other ability, in quotes or not ("with flash", "with
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
    // Issue 105 (CR 301.7, 702.122a): a Vehicle token, no creature, with crew.
    'a 3/3 colorless Vehicle artifact token with flying and crew 2',
    'an X/X colorless Vehicle artifact token named Nalaar Aetherjet with flying and crew 2',
    'a 3/3 colorless Golem enchantment artifact creature token',
    'a 2/2 black Horror enchantment creature token',
    'two 1/1 white Glimmer enchantment creature tokens with flying',
    // CR 205.3i, 305.6 (Verdant Kraken): a land creature token whose subtypes include a basic land type.
    'a 3/3 green Forest Tentacle land creature token',
    'three 1/1 white and blue Spirit creature tokens',
    'a 3/3 green Beast creature token',
    'a 1/1 white Spirit creature token with flying',
    'two 1/1 colorless Thopter artifact creature tokens with flying',
    'a 1/1 black Snake creature token with deathtouch',
    'a 2/2 white Knight creature token with first strike and vigilance',
    'a 3/3 green Beast creature token with trample, reach, and haste',
    'X 1/1 white Soldier creature tokens',
    'X 2/2 black Zombie creature tokens',
    'that many 1/1 green Insect creature tokens with flying and deathtouch',
    'a tapped 2/2 black Zombie creature token',
    'thirteen tapped 2/2 black Zombie creature tokens',
    'two 2/2 black Zombie Knight creature tokens with menace',
    // CR 702.16a (Hunted Horror): a token that has protection from a color.
    'two 3/3 green Centaur creature tokens with protection from black',
    'a 2/2 white Knight creature token with protection from red and from blue',
    'a 1/1 white Soldier creature token with flying and protection from black',
    // Stage P35 (D-176, CR 111.4, 113.1): an ability the token has, in quotes, alone or after keywords; a quote inside the quote is the ability of
    // the token it makes.
    'a 0/1 colorless Eldrazi Spawn creature token with "Sacrifice ~: Add {C}."',
    'a 1/1 black and green Pest creature token with "When ~ dies, you gain 1 life."',
    'a 0/2 red Dragon Egg creature token with defender and "When ~ dies, create a 2/2 red Dragon creature token with flying and \'{R}: ~ gets +1/+0 until end of turn.\'"',
    'a 1/1 white Soldier creature token with flying and "{T}: You gain 1 life."',
    // Stage P39 (D-184, CR 111.4): a token with a name of its own.
    'X 0/1 red Kobold creature tokens named Kobolds of Kher Keep',
    'a 1/1 white Soldier creature token named Hero',
    'a 0/1 red Kobold creature token named Kobolds of ~',
    'two 2/2 black Zombie creature tokens named Dead Knights with menace',
    // Stage P40 (D-186, CR 702.82a): a token with devour.
    'a 1/1 red and green Dragon creature token with flying and devour 2',
    'a 2/2 red Goblin creature token with devour 1',
    'a 1/1 red Dragon creature token with first strike and devour 3',
    'a 1/1 colorless Phyrexian Mite artifact creature token with toxic 1 and "~ can’t block."',
    // Issue 104 (CR 702.73a): a token with changeling.
    'a 2/2 blue Shapeshifter creature token with changeling',
    'a 1/1 white Soldier creature token with changeling and flying',
    'a 1/1 white Soldier creature token with flying, changeling, and "{T}: You gain 1 life."',
    // CR 111.4, 113.1, 508.1d (Goblin Spymaster, Pursued Whale): static abilities in quotes, the second after "and".
    'a 1/1 red Goblin creature token with "Creatures you control attack each combat if able."',
    'a 1/1 red Pirate creature token with "~ can\'t block" and "Creatures you control attack each combat if able."',
    // CR 508.4, 110.5b: a token that enters tapped and attacking (after an attack batch trigger the lowering names the player).
    "a 1/1 red Goblin creature token that's tapped and attacking",
    'a 1/1 red Goblin creature token that’s tapped and attacking',
    "a 1/1 white Soldier creature token with flying that's tapped and attacking",
    'two 1/1 white Soldier creature tokens that are tapped and attacking',
  ],
  rejects: [
    'a 2/2 black Horror enchantment token',
    'a 2/2 black Horror creature enchantment token',
    'a 2/2 black Horror artifact enchantment creature token',
    "a 1/1 red Goblin creature token that's tapped and attacking and",
    "a 1/1 red Goblin creature token that's tapped",
    "a 1/1 red Goblin creature token that's attacking",
    "a 1/1 red Goblin creature token that's untapped and attacking",
    "a 1/1 red Goblin creature token that's tapped and attacking a player",
    "a tapped 1/1 red Goblin creature token that's tapped and attacking that opponent",
    "a 1/1 red Goblin creature token that's attacking and tapped",
    'a 1/1 red and green Dragon creature token with devour',
    'a 1/1 red and green Dragon creature token with devour 0',
    'a 1/1 red and green Dragon creature token with devour X',
    'a 1/1 red and green Dragon creature token with devour 2 and flying',
    'a 1/1 colorless Phyrexian Mite artifact creature token with toxic 0',
    'a 1/1 colorless Phyrexian Mite artifact creature token with toxic X',
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
    'a 1/1 white Soldier creature token with changeling and changeling',
    'a 1/1 white Soldier creature token with changelings',
    'a 1/1 white Soldier creature token with "Sacrifice ~: Draw a card"',
    'a 1/1 white Soldier creature token with "Sacrifice ~: Draw a card." and flying',
    'a 1/1 white Soldier creature token with flying and "Sacrifice ~: Draw a card"',
    'a 1/1 white Soldier creature token with "Flying" and "{T}: You gain 1 life."',
    'a 1/1 white Soldier creature token with "{T}: You gain 1 life." and "{T}: You gain 1 life."',
    'a 1/1 red Pirate creature token with "~ can\'t block" and "~ can\'t block"',
    'a 1/1 red Pirate creature token with "~ can\'t block" and "{T}: You gain 1 life."',
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
    'Primo, the Indivisible, a legendary 0/0 green and blue Fractal creature token',
    'Hero, a legendary 2/2 white Soldier creature token with flying',
    'The Blackjack, a legendary 3/3 colorless Vehicle artifact token with flying and crew 2',
    'Dead Knight of Doom, a legendary 3/3 black Zombie Knight creature token with menace',
    'Hero, a legendary 2/2 white Soldier creature token with "When Hero dies, you gain 1 life."',
    'Hero, a legendary 2/2 white Soldier creature token with flying and "When Hero dies, you gain 1 life."',
    'Beau, a legendary blue Ox creature token with "Beau\'s power and toughness are each equal to the number of lands you control."',
    'Hero, a legendary green Wolf creature token with "Hero\'s power is equal to the number of creatures you control."',
  ],
  rejects: [
    'Smaug, a 6/6 red Dragon creature token',
    'Smaug, a legendary 6/6 red Dragon creature token with',
    'The Blackjack, a legendary 3/3 colorless Vehicle artifact tokens with flying and crew 2',
    'Smaug, a legendary 6/6 red Dragon creature token with flash',
    'Smaug, a legendary 6/6 Dragon creature token',
    'Smaug, a legendary red Dragon creature token',
    'Smaug, two legendary 6/6 red Dragon creature tokens',
    'smaug, a legendary 6/6 red Dragon creature token',
    'a legendary 6/6 red Dragon creature token',
    'Smaug a legendary 6/6 red Dragon creature token',
    'Primo, the, a legendary 0/0 green and blue Fractal creature token',
    'Primo, The Indivisible, a legendary 0/0 green and blue Fractal creature token',
    'Smaug, a legendary 6/6 red Dragon creature token named Smaug',
    'Smaug, a legendary 6/6 red Dragon creature token with "When Smaug dies, create fourteen Treasure tokens"',
    'Smaug, a legendary 6/6 red Dragon creature token with flying, haste and "When Smaug dies, create fourteen Treasure tokens." and more',
    'Smaug, a legendary 6/6 red Dragon creature token tapped',
    'Beau, a legendary blue Ox creature token',
    'Beau, a legendary blue Ox creature token with flying',
    'Beau, a legendary blue Ox creature token with flying and "Beau\'s power and toughness are each equal to the number of lands you control."',
    'Beau, a legendary blue Ox creature token with "Beau gets +1/+1 for each land you control."',
    'Beau, a legendary blue Ox creature token with "Creatures you control get +1/+1."',
    'Beau, a legendary blue Ox creature token with "Beau\'s power and toughness are each equal to the number of lands you control"',
    'Beau, a legendary blue Ox creature tokens with "Beau\'s power and toughness are each equal to the number of lands you control."',
    'Beau, a legendary 2/2 blue Ox creature token with "Beau\'s power and toughness are each equal to the number of lands you control."',
    'Beau, a legendary blue Ox artifact creature token with "Beau\'s power and toughness are each equal to the number of lands you control."',
  ],
  parse: node<Bare, IrToken>(
    'token.named-legendary',
    (ctx, pos) => {
      const named = spanned(LEGENDARY_TOKEN_NAME)(ctx, pos);
      if (!named.ok) return named;
      const name = named.value.value;
      const rest = choice(
        map(
          sequence(
            literal(', a legendary '),
            pattern(/(\d+)\/(\d+) /),
            COLORS,
            literal(' '),
            SUBTYPES,
            choice(
              map(literal(' artifact creature'), () => ['artifact', 'creature']),
              map(literal(' creature'), () => ['creature']),
              // "The Blackjack, a legendary 3/3 colorless Vehicle artifact token with flying and crew 2" (CR 301.7, 111.4): a Vehicle is an artifact that is a creature only while crewed.
              map(literal(' artifact'), () => ['artifact']),
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
        ),
        // Galadriel deck, group 2 (D-543): "Beau, a legendary blue Ox creature token with \"Beau's power and toughness are each equal to the number of lands you control.\"":
        // no numbers of power and toughness, a characteristic-defining ability in the quotes defines them (CR 208.2a, 604.3). The quote is a static ability, the one
        // kind a token with a stated power and toughness never reads.
        map(
          sequence(
            literal(', a legendary '),
            COLORS,
            literal(' '),
            SUBTYPES,
            literal(' creature'),
            satisfy(TOKEN_WORD, (plural) => !plural),
            literal(' with '),
            // Only a characteristic-defining ability of power and toughness: another static ability of a token is not read.
            satisfy(
              namedTokenQuotedAbility(name, true),
              (quoted) =>
                quoted.ability.kind === 'static' &&
                quoted.ability.statement.effects.some((e) => e.kind === 'definesPt'),
            ),
          ),
          ([, colors, , subtypes, , , , ability]): Bare => ({
            kind: 'token',
            named: name,
            legendary: true,
            colors,
            types: ['creature'],
            subtypes,
            count: { kind: 'number', value: 1, span: named.value.span },
            abilities: [ability],
          }),
        ),
      )(ctx, named.pos);
      return rest;
    },
    (b) => b,
  ),
});

/**
 * A characteristic-defining ability of power and toughness in the quotes of a token with no numbers of its own: "This token's power and toughness are each equal to the number of lands
 * you control." The one static ability of such a token (CR 208.2a, 604.3); another static ability is not read.
 */
const DEFINES_PT_QUOTED: Parser<IrQuotedAbility> = satisfy(
  (ctx, pos) => readQuotedAbility(ctx, pos, { mana: false, statics: true }),
  (quoted) =>
    quoted.ability.kind === 'static' &&
    quoted.ability.statement.effects.some((e) => e.kind === 'definesPt'),
);

/**
 * `token.defined-pt`: "a green Treefolk creature token with reach and \"This token's power and toughness are each equal to the number of lands you control.\"" (Wrenn and Seven; Death Toll
 * deck, group C; CR 111.4, 208.2a, 604.3): one token with no numbers of power and toughness, its own characteristic-defining ability in the quotes defines both (the same as `token.named-
 * legendary` reads for a token with a name of its own); keywords of the token may come before the quote. One token ("a"), the colors and creature types written out. Not read: numbers of
 * power and toughness with the ability, no quote, another static ability in the quote, a plural, an artifact creature.
 */
export const TOKEN_DEFINED_PT = defineRule<IrToken>({
  id: 'token.defined-pt',
  family: 'token',
  leading: ['a'],
  cites: [
    'CR 111.4 (Tokens)',
    'CR 208.2a (Power/Toughness)',
    'CR 604.3 (Handling Static Abilities)',
  ],
  examples: [
    'a green Treefolk creature token with reach and "~\'s power and toughness are each equal to the number of lands you control."',
    'a green Treefolk creature token with "~\'s power and toughness are each equal to the number of lands you control."',
  ],
  rejects: [
    'a green Treefolk creature token',
    'a green Treefolk creature token with reach',
    'a 1/1 green Treefolk creature token with reach and "~\'s power and toughness are each equal to the number of lands you control."',
    'a green Treefolk creature token with reach and "~ gets +1/+1 for each land you control."',
    'a green Treefolk creature token with reach and "Creatures you control get +1/+1."',
    'a green Treefolk creature token with reach and "~\'s power and toughness are each equal to the number of lands you control"',
    'two green Treefolk creature tokens with reach and "~\'s power and toughness are each equal to the number of lands you control."',
    'a green Treefolk artifact creature token with reach and "~\'s power and toughness are each equal to the number of lands you control."',
  ],
  parse: node<Bare, IrToken>(
    'token.defined-pt',
    map(
      sequence(
        spanned(literal('a ')),
        COLORS,
        literal(' '),
        SUBTYPES,
        literal(' creature'),
        satisfy(TOKEN_WORD, (plural) => !plural),
        literal(' with '),
        satisfy(tokenWith(DEFINES_PT_QUOTED), (w) => w.abilities.length > 0),
      ),
      ([article, colors, , subtypes, , , , { keywords, abilities }]): Bare => ({
        kind: 'token',
        colors,
        types: ['creature'],
        subtypes,
        count: { kind: 'number', value: 1, span: article.span },
        ...(keywords.length > 0 ? { keywords } : {}),
        abilities,
      }),
    ),
    (b) => b,
  ),
});

/**
 * `token.noncreature-named`: "a colorless snow artifact token named Icy Manalith with \"{T}: Add one mana of any color.\"" (issue 345, Svella, Ice Shaper; CR 111.4, 205.4 snow,
 * 111.3): a token that is no creature (so it has no power or toughness and no creature type), with the name the effect gives it and the abilities in its quotes. One token. Not read:
 * a color, a creature type, a number for the count, "creature", no name, no quoted ability, a keyword besides the quotes, another card type.
 */
export const TOKEN_NONCREATURE_NAMED = defineRule<IrToken>({
  id: 'token.noncreature-named',
  family: 'token',
  leading: ['a'],
  cites: ['CR 111.4 (Tokens)', 'CR 111.3 (Tokens)', 'CR 205.4 (Supertypes)'],
  examples: [
    'a colorless snow artifact token named Icy Manalith with "{T}: Add one mana of any color."',
    'a colorless artifact token named Gem with "{T}: Add {C}."',
  ],
  rejects: [
    'a colorless snow artifact token named Icy Manalith',
    'a colorless snow artifact token with "{T}: Add one mana of any color."',
    'a green snow artifact token named Icy Manalith with "{T}: Add one mana of any color."',
    'a colorless snow artifact creature token named Icy Manalith with "{T}: Add one mana of any color."',
    'two colorless snow artifact tokens named Icy Manalith with "{T}: Add one mana of any color."',
    'a colorless snow enchantment token named Icy Manalith with "{T}: Add one mana of any color."',
    'a colorless snow artifact token named Icy Manalith with flying',
    'a colorless snow artifact token named icy with "{T}: Add one mana of any color."',
  ],
  parse: node<Bare, IrToken>(
    'token.noncreature-named',
    map(
      sequence(
        spanned(literal('a colorless ')),
        optional(
          map(literal('snow '), () => true as const),
          null,
        ),
        literal('artifact token named '),
        TOKEN_NAME,
        literal(' with '),
        satisfy(
          tokenWith(TOKEN_QUOTED_ABILITY_OR_CREW_BONUS),
          (w) => w.abilities.length > 0 && w.keywords.length === 0,
        ),
      ),
      ([article, snow, , named, , { abilities }]): Bare => ({
        kind: 'token',
        colors: [],
        types: ['artifact'],
        subtypes: [],
        named,
        ...(snow === null ? {} : { snow }),
        count: { kind: 'number', value: 1, span: article.span },
        abilities,
      }),
    ),
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
    'a number of Gold tokens equal to its power',
    'a number of 1/1 white Soldier creature tokens equal to its power',
    'a number of 1/1 red Goblin creature tokens equal to the amount of excess damage dealt to that creature this way',
  ],
  rejects: [
    'a number of Treasure token equal to its power',
    'a number of Treasure tokens',
    'a number of Treasure tokens equal to',
    'a number of tokens equal to its power',
    'a number of Gold token equal to its power',
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
        // Issue 144 (Goblin Negotiation, CR 120.10): "a number of 1/1 red Goblin creature tokens equal to the amount of excess damage dealt to that creature this way".
        family<IrAmount>('amount', {
          only: [...EQUAL_AMOUNTS, 'amount.excess-damage-dealt-this-way'],
        }),
      ),
      ([token, , count]): Bare => ({ ...token, count }),
    ),
    (b) => b,
  ),
});

/** What a copy can be made of: this permanent, one target permanent, or "it" (CR 707.2). */
const COPY_SOURCES = ['noun.self', 'noun.target-permanent', 'noun.it'] as const;

const COPY_SOURCE = choice(
  satisfy(family<IrNoun>('noun', { only: COPY_SOURCES }), (noun) => !noun.plural),
  // Issue 128 (Mechanized Production, CR 707.2, 303.4b): "a token that's a copy of enchanted artifact", the permanent the Aura is attached to (an Equipment's "equipped creature" is not read).
  satisfy(
    family<IrNoun>('noun', { only: ['noun.attached-permanent'] }),
    (noun) => noun.det === 'enchanted',
  ),
);

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
    // Scouring Swarm (CR 110.5b): the token enters tapped.
    "a tapped token that's a copy of ~",
    "a tapped token that's a copy of target creature you control",
    "a token that's a copy of it",
    'two tokens that are copies of target creature',
    'three tokens that are copies of ~',
    "a token that's a copy of target artifact",
    "a token that's a copy of enchanted artifact",
    "a token that's a copy of target token you control",
    'two tokens that are copies of it',
    // Flamerush Rider (CR 508.4, 110.5b, 707.2): a copy that enters tapped and attacking.
    "a token that's a copy of another target attacking creature and that's tapped and attacking",
    'a token that’s a copy of target creature you control and that’s tapped and attacking',
  ],
  rejects: [
    "a token that's a copy of target creature and that's tapped",
    "a tapped tapped token that's a copy of ~",
    "a token tapped that's a copy of ~",
    "a untapped token that's a copy of ~",
    'two tapped tokens that are copies of target creature',
    "a token that's a copy of target creature and that's attacking",
    "a token that's a copy of target creature and that's untapped and attacking",
    "a token that's a copy of target creature and that's tapped and attacking a player",
    'two tokens that are copies of target creature and that are tapped and attacking',
    "a token that's a copy of target creature, except it's a 1/1",
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
          pattern(/( tapped)? token that['’]s a copy of /i),
          COPY_SOURCE,
          optional(
            pattern(
              / and that['’]s tapped and attacking(?![\p{L}\p{N}'’]|\s+(?:a|that|and|or)(?![\p{L}\p{N}]))/iu,
            ),
            null,
          ),
        ),
        ([count, head, copyOf, attacking]): Bare => ({
          kind: 'token',
          copyOf,
          count,
          // Scouring Swarm (CR 110.5b): "a tapped token that's a copy of ~": the token enters tapped.
          ...(head[1] === undefined ? {} : { tapped: true as const }),
          ...(attacking === null ? {} : { tappedAndAttacking: true as const }),
        }),
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

/**
 * `token.copy-that-creature`: "a token that's a copy of that creature" (issue 145, Bramble Sovereign; CR 707.2, 111.4): the copy of the permanent the event of the trigger is about,
 * which the binding pass resolves as it does "it" (`token.copy`). One token, and nothing after the creature: "..., except it has haste" and the other exceptions belong to
 * the rules that read them (`token.copy-except` and the effects of the cards that name the creature), which a copy of "that creature" must leave alone. Not read: several tokens,
 * "that creature's controller", an exception, another permanent.
 */
export const TOKEN_COPY_THAT_CREATURE = defineRule<IrToken>({
  id: 'token.copy-that-creature',
  family: 'token',
  leading: [],
  cites: ['CR 707.2 (Copying Objects)', 'CR 111.4 (Tokens)'],
  examples: ["a token that's a copy of that creature", 'a token that’s a copy of that creature'],
  rejects: [
    "a token that's a copy of that creature, except it has haste",
    "a token that's a copy of that creature's controller",
    'two tokens that are copies of that creature',
    "a token that's a copy of that permanent",
    "a token that's a copy of that creatures",
    "one token that's a copy of that creature",
    "a token that's a copy of that creature and",
  ],
  parse: node<Bare, IrToken>(
    'token.copy-that-creature',
    map(
      sequence(
        map(spanned(article), ({ value, span }): IrAmount => ({ kind: 'number', value, span })),
        pattern(/ token that['’]s a copy of /i),
        satisfy(family<IrNoun>('noun', { only: ['noun.that-object'] }), (noun) =>
          /^that creature$/iu.test(noun.filter.raw.trim()),
        ),
        pattern(/(?!,? except)(?! and)/iu),
      ),
      ([count, , copyOf]): Bare => ({ kind: 'token', copyOf, count }),
    ),
    (b) => b,
  ),
});

export const TOKEN_RULES = [
  TOKEN_PREDEFINED,
  TOKEN_CUSTOM,
  TOKEN_NAMED_LEGENDARY,
  // Death Toll deck, group C: a token with no numbers whose own characteristic-defining ability defines them.
  TOKEN_DEFINED_PT,
  // Issue 345: a named token that is no creature.
  TOKEN_NONCREATURE_NAMED,
  TOKEN_NUMBER_OF,
  // Before `token.copy`: a family takes the first rule that reads, and the plain copy would stop short of ", except it's ...".
  TOKEN_COPY_EXCEPT,
  TOKEN_COPY_EXCEPT_ADDITIVE,
  TOKEN_COPIES_EXCEPT_ADDITIVE,
  // Aetherdrift energy deck (issue 105): "a 5/5 artifact creature in addition to its other types and has haste".
  TOKEN_COPY_EXCEPT_ADDITIVE_TYPES,
  // Espers to Magicite: "..., except it's an artifact and it loses all other card types".
  TOKEN_COPY_EXCEPT_SET_TYPES,
  TOKEN_COPY_EXCEPT_PT,
  // Nightmare Shepherd: "..., except it's 1/1 and it's a Nightmare in addition to its other types", before the plain copies.
  TOKEN_COPY_EXCEPT_PT_SUBTYPE,
  // Saw in Half: "two tokens that are copies of that creature, except their power is half ...", before the plain copy.
  TOKEN_COPIES_HALF_PT,
  // Galadriel deck, group 3: "..., except it's not legendary and its starting loyalty is 1", for the same reason.
  ...GALADRIEL_G3_TOKEN_RULES,
  // Federation Fleet deck, group A (Reg Barclay): "..., except it isn't legendary, it's an Illusion artifact in addition to its other types, and it has haste".
  ...SEEK_OUT_TOKEN_RULES,
  ...AURA_TOKEN_RULES,
  // Prismari deck, group 1 (D-638): "X tokens that are copies of ...", which `token.copy` does not read (a number of two or more).
  TOKEN_COPIES_X,
  TOKEN_COPY,
  TOKEN_COPY_THAT_CREATURE,
];
