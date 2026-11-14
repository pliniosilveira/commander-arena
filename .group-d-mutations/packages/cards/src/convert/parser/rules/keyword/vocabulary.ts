import {
  GRANTABLE_KEYWORDS as ENGINE_GRANTABLE,
  type Keyword,
  type ObjectFilter,
} from '@commander-arena/engine';

/** The keywords that take no parameter. Listed, not derived: the engine adds parameterised ones. */
export type SimpleKeyword = Extract<
  Keyword['kind'],
  | 'firstStrike'
  | 'doubleStrike'
  | 'flying'
  | 'deathtouch'
  | 'defender'
  | 'haste'
  | 'hexproof'
  | 'shroud'
  | 'indestructible'
  | 'lifelink'
  | 'menace'
  | 'reach'
  | 'trample'
  | 'vigilance'
  | 'flash'
  | 'prowess'
  | 'fear'
  | 'intimidate'
  | 'shadow'
  | 'changeling'
  | 'devoid'
  | 'partner'
  | 'chooseBackground'
  | 'exalted'
  | 'persist'
  | 'undying'
  | 'infect'
  | 'wither'
  | 'splitSecond'
  | 'skulk'
  | 'battleCry'
  | 'mentor'
  | 'evolve'
  | 'extort'
  | 'convoke'
  | 'improvise'
  | 'delve'
  | 'cascade'
  | 'readAhead'
  | 'dethrone'
  | 'myriad'
  | 'decayed'
  | 'riot'
  | 'ascend'
  | 'soulbond'
>;

/** The engine's keyword node of each `SimpleKeyword`. */
type PlainKeyword = Extract<Keyword, { readonly kind: SimpleKeyword }>;
type ExtraFields<K> = K extends unknown ? Exclude<keyof K, 'kind'> : never;
type MustBeNever<T extends never> = T;
/** Compile-time check: a `SimpleKeyword` is a keyword with no field but `kind` (no parameter). */
export type SimpleKeywordsTakeNoParameter = MustBeNever<ExtraFields<PlainKeyword>>;

/**
 * The AST keyword of a `SimpleKeyword`. TypeScript cannot match a union of more than 25 literals
 * against the engine's `Keyword` union member by member, so the node is built here once, and
 * `SimpleKeywordsTakeNoParameter` proves that `{ kind }` is all any of them is.
 */
export function plainKeyword(kind: SimpleKeyword): Keyword {
  return { kind } as PlainKeyword;
}

/** Oracle spelling of each keyword without parameters (CR 702), mapped to its AST kind. */
export const SIMPLE_KEYWORDS: readonly (readonly [string, SimpleKeyword])[] = [
  ['first strike', 'firstStrike'],
  ['double strike', 'doubleStrike'],
  ['flying', 'flying'],
  ['deathtouch', 'deathtouch'],
  ['defender', 'defender'],
  ['haste', 'haste'],
  ['hexproof', 'hexproof'],
  ['shroud', 'shroud'],
  ['indestructible', 'indestructible'],
  ['lifelink', 'lifelink'],
  ['menace', 'menace'],
  ['reach', 'reach'],
  ['trample', 'trample'],
  ['vigilance', 'vigilance'],
  ['flash', 'flash'],
  ['prowess', 'prowess'],
  ['fear', 'fear'],
  ['intimidate', 'intimidate'],
  ['shadow', 'shadow'],
  // Keyword batch 1 (D-104, D-110; stage P17). The engine runs each of them; only infect and wither can
  // also be granted (the engine's `GRANTABLE_KEYWORDS`), the rest are printed abilities.
  ['changeling', 'changeling'],
  ['devoid', 'devoid'],
  ['partner', 'partner'],
  // Stage P35 (D-176, CR 702.124k): a deck-construction ability with no effect in the game, as Partner.
  ['choose a background', 'chooseBackground'],
  ['exalted', 'exalted'],
  ['persist', 'persist'],
  ['undying', 'undying'],
  ['infect', 'infect'],
  ['wither', 'wither'],
  ['split second', 'splitSecond'],
  // Keyword batch 2 (D-116, D-120; stage P21). The engine runs each of them; only skulk can also be
  // granted (the engine's `GRANTABLE_KEYWORDS`), the rest are printed abilities. Bushido takes a number
  // (`numbered.ts`) and Affinity a kind of permanent (`affinity.ts`).
  ['skulk', 'skulk'],
  ['battle cry', 'battleCry'],
  ['mentor', 'mentor'],
  ['evolve', 'evolve'],
  ['extort', 'extort'],
  ['convoke', 'convoke'],
  ['improvise', 'improvise'],
  ['delve', 'delve'],
  ['cascade', 'cascade'],
  // Keyword batch 4 (D-151; stage P34): printed abilities, never granted (the engine's `GRANTABLE_KEYWORDS` has none of them).
  ['read ahead', 'readAhead'],
  ['dethrone', 'dethrone'],
  ['myriad', 'myriad'],
  // D-478 (CR 702.147a): Decayed is a printed ability ("Decayed" on a card with the reminder text), the keyword of a token ("with decayed"), a keyword counter and a grant.
  ['decayed', 'decayed'],
  // Stage P40 (D-186, CR 702.136a): Riot is a printed ability and, as a static ability's grant to a group, "Nontoken creatures you control have riot" (the engine lists it in its GRANTABLE_KEYWORDS; its validators refuse every other way of giving it).
  ['riot', 'riot'],
  // D-264 (CR 702.131b): Ascend on a permanent is a printed static ability that gives the city's blessing; the engine does not let it be granted.
  ['ascend', 'ascend'],
  // D-286 (CR 702.95a): Soulbond is printed on a creature and stands for two triggered abilities the engine builds; it can not be granted (the engine's
  // GRANTABLE_KEYWORDS leaves it out, so no list that grants a keyword reads it).
  ['soulbond', 'soulbond'],
];

/** The AST kind of a keyword written as `name` (lowercased words), or undefined. */
export function keywordKind(name: string): SimpleKeyword | undefined {
  return SIMPLE_KEYWORDS.find(([word]) => word === name)?.[1];
}

/**
 * The keywords a static ability or an effect may grant (CR 613.1f): the words of `SIMPLE_KEYWORDS`
 * whose kind is in the engine's own `GRANTABLE_KEYWORDS`, which is the one list (not copied here).
 * Flash does nothing on the battlefield and prowess is expanded into its triggered ability only
 * from a printed keyword, never from a granted one (D-083), so the engine excludes both and so
 * does this table.
 */
export const GRANTABLE_KEYWORDS: readonly (readonly [string, SimpleKeyword])[] =
  SIMPLE_KEYWORDS.filter(([, kind]) => isGrantable(kind));

/** True when the AST keyword `kind` can be granted by a static ability or an effect. */
export function isGrantable(kind: SimpleKeyword): boolean {
  return ENGINE_GRANTABLE.includes(kind);
}

/**
 * The landwalk abilities (CR 702.14a): "[land type]walk", which the engine keeps as one keyword,
 * `landwalk`, with the land type. Only the five basic land types and "nonbasic landwalk"
 * (CR 702.14c) are listed: they are the ones of the owner's run, and "snow", "legendary" and
 * "artifact" landwalk are not engine keywords. D-473: a landwalk can be granted ("Other Zombie creatures have swampwalk"), read by `KEYWORD_WORDS`
 * and lowered by `grantedKeyword`.
 */
export const LANDWALKS: readonly (readonly [string, string])[] = [
  ['plainswalk', 'Plains'],
  ['islandwalk', 'Island'],
  ['swampwalk', 'Swamp'],
  ['mountainwalk', 'Mountain'],
  ['forestwalk', 'Forest'],
  ['nonbasic landwalk', 'nonbasic'],
];

/** The land type (or "nonbasic") of a landwalk written as `name` (lowercased words), or undefined. */
export function landwalkOf(name: string): string | undefined {
  return LANDWALKS.find(([word]) => word === name)?.[1];
}

/** The grant words of an Afflict (CR 702.130a): "afflict 3", the word and a positive whole number written in digits (D-472). */
export const AFFLICT_WORD = /^afflict ([1-9]\d*)$/;

/**
 * The engine's keyword that a word of a grant ("has swampwalk", "gains afflict 3", "has flying") stands for, or undefined when the engine cannot
 * grant it (CR 613.1f): a keyword without parameters (`GRANTABLE_KEYWORDS`), a landwalk with its land type (CR 702.14a, D-473) or "afflict N"
 * (CR 702.130a, D-472). The one place that turns the words `KEYWORD_WORDS` reads into the nodes a `grantKeyword` carries.
 */
export function grantedKeyword(word: string): Keyword | undefined {
  const simple = keywordKind(word);
  if (simple !== undefined) return isGrantable(simple) ? plainKeyword(simple) : undefined;
  const landType = landwalkOf(word);
  if (landType !== undefined) return { kind: 'landwalk', landType };
  const afflict = AFFLICT_WORD.exec(word);
  if (afflict?.[1] !== undefined) return { kind: 'afflict', count: Number(afflict[1]) };
  return undefined;
}

/**
 * The typecycling abilities the engine runs (CR 702.29e, D-110): "[Type]cycling [cost]" searches the
 * library for a card of the type. Only the five basic land types and "basic landcycling" are listed:
 * they are the ones of the owner's run (36 cards "Basic landcycling {1}", 11 "Plainscycling {2}", 9
 * "Islandcycling {1}" in reports/templates.json). The filter is the engine's, as the `search` effect
 * takes it: it names neither zone nor controller. "Basic landcycling" is the card type and supertype
 * ("basic land card"); the five others are the subtype, so a dual land with the Island type is found
 * by Islandcycling.
 */
export const TYPECYCLINGS: readonly (readonly [string, ObjectFilter])[] = [
  ['basic landcycling', { types: ['land'], supertypes: ['basic'] }],
  ['plainscycling', { subtypes: ['Plains'] }],
  ['islandcycling', { subtypes: ['Island'] }],
  ['swampcycling', { subtypes: ['Swamp'] }],
  ['mountaincycling', { subtypes: ['Mountain'] }],
  ['forestcycling', { subtypes: ['Forest'] }],
];

/** The search filter of a typecycling keyword written as `name` (lowercased words), or undefined. */
export function typecyclingFilter(name: string): ObjectFilter | undefined {
  return TYPECYCLINGS.find(([word]) => word === name)?.[1];
}
