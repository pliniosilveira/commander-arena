/**
 * Noun rules: who or what a clause acts on (CR 109, 115). Registered in the order they are tried:
 * graveyard cards before permanents ("target creature card from a graveyard" starts like a
 * permanent phrase), the player nouns and "any target" first because they cannot be permanents.
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrFilter, IrNoun } from '../../ir/types';
import { quantity } from '../amount/index';
import { defineRule, family, node, spanned } from '../registry';
import { ANGEL_NOUN_RULES } from './angels';
import { NOUN_ATTACKED_BY_IT } from './attacked';
import { CHOOSE_NOUN_RULES } from './choose';
import { NOUN_ITS_CONTROLLER } from './controller';
import { CROSS_ZONE_NOUN_RULES } from './cross-zone';
import { DINOSAUR_NOUN_RULES } from './dinosaurs';
import { DRAGON_NOUN_RULES } from './dragons';
import { EDHREC_NOUN_RULES } from './edhrec';
import { HOFRI_NOUN_RULES } from './hofri';
import { KORVOLD_EARLY_NOUN_RULES, KORVOLD_NOUN_RULES } from './korvold';
import { LIBRARY_NOUN_RULES } from './library';
import {
  graveyardPhrase,
  PLURAL_TYPE_UNION,
  permanentPhrase,
  spellPhrase,
  withColorList,
} from './phrases';
import { PLAYER_NOUN_RULES } from './players';
import { NOUN_EACH_OF_THEM, NOUN_IT, NOUN_THAT_TOKEN } from './pronoun';
import { NOUN_SUBTYPE_UNION, SUBJECT_NOUN_RULES } from './subjects';
import { VRASKA_EARLY_NOUN_RULES, VRASKA_NOUN_RULES } from './vraska';

type Bare = Omit<IrNoun, 'span' | 'rule'>;

function bare(det: IrNoun['det'], filter: IrFilter, extra: Partial<Bare> = {}): Bare {
  return { kind: 'noun', det, filter, upTo: false, plural: false, other: false, ...extra };
}

/**
 * "target <phrase>", "two target <plural phrase>" and "up to one target <phrase>" (CR 115.1: a
 * target is chosen as the spell or ability is put on the stack; CR 115.2: "up to" lets the player
 * choose none). A count is two or more; "one target creatures" is not English. "Up to one" takes the
 * singular phrase and "up to two" or more the plural, and they set `upTo`, the engine's minimum of
 * zero targets.
 */
function targetOf(id: string, phrase: (plural: boolean) => Parser<IrFilter>): Parser<IrNoun> {
  const counted: Parser<Bare> = map(
    sequence(spanned(satisfy(quantity, (n) => n >= 2)), literal(' target '), phrase(true)),
    ([count, , filter]) =>
      bare('target', filter, {
        count: { kind: 'number', value: count.value, span: count.span },
        plural: true,
      }),
  );
  const upTo: Parser<Bare> = (ctx, pos) => {
    const head = sequence(
      literal('up to '),
      spanned(satisfy(quantity, (n) => n >= 1)),
      literal(' target '),
    )(ctx, pos);
    if (!head.ok) return head;
    const count = head.value[1];
    const plural = count.value >= 2;
    const filter = phrase(plural)(ctx, head.pos);
    if (!filter.ok) return filter;
    const value = bare('target', filter.value, {
      count: { kind: 'number', value: count.value, span: count.span },
      plural,
      upTo: true,
    });
    return { ok: true, value, pos: filter.pos };
  };
  // "up to that many target creatures" (stage P41, D-188, CR 603.12): the number is what a sacrifice before a reflexive ability made; always plural,
  // with no count of its own.
  const upToThatMany: Parser<Bare> = map(
    sequence(literal('up to that many target '), phrase(true)),
    ([, filter]) => bare('target', filter, { plural: true, upTo: true, upToThatMany: true }),
  );
  // "another target creature": one target that is not the source of the ability (CR 115.1, 109.1).
  const another = map(sequence(literal('another target '), phrase(false)), ([, filter]) =>
    bare('target', filter, { other: true }),
  );
  const single = map(sequence(literal('target '), phrase(false)), ([, filter]) =>
    bare('target', filter),
  );
  // "each of up to two target creatures": the counters of a spell that puts one on each (the engine's
  // target slot already stands for every object chosen for it).
  const eachOf: Parser<Bare> = map(
    sequence(literal('each of '), choice(upTo, counted)),
    ([, noun]) => noun,
  );
  return node<Bare, IrNoun>(
    id,
    choice(eachOf, upTo, upToThatMany, counted, another, single),
    (b) => b,
  );
}

const ID = {
  anyTarget: 'noun.any-target',
  player: 'noun.player',
  targetSpell: 'noun.target-spell',
  targetGraveyard: 'noun.target-graveyard-card',
  playerGraveyard: 'noun.player-graveyard',
  allGraveyard: 'noun.all-graveyard-cards',
  targetPermanent: 'noun.target-permanent',
  allPermanents: 'noun.all-permanents',
  eachPermanent: 'noun.each-permanent',
} as const;

/** `noun.any-target`: "any target" (CR 115.4: a creature, player, planeswalker or battle). */
export const NOUN_ANY_TARGET = defineRule<IrNoun>({
  id: ID.anyTarget,
  family: 'noun',
  leading: ['any'],
  cites: ['CR 115.4 (Targets)'],
  examples: ['any target'],
  rejects: ['any creature', 'target'],
  parse: node<string, IrNoun>(
    ID.anyTarget,
    map(literal('any target'), (raw) => raw),
    (raw) => bare('target', { anyTarget: true, raw }),
  ),
});

const END = '(?![\\p{L}\\p{N}])';

function player(text: string): Parser<string> {
  return map(pattern(new RegExp(`${text}${END}`, 'iu')), (m) => m[0]);
}

/**
 * `noun.player`: "you", "target player", "target opponent", "each player", "each opponent"
 * (CR 102, 115). A subject can do several things in one sentence, all to the same chosen player.
 */
export const NOUN_PLAYER = defineRule<IrNoun>({
  id: ID.player,
  family: 'noun',
  leading: ['you', 'target', 'each'],
  cites: ['CR 102.1 (Players)', 'CR 115.1 (Targets)'],
  examples: ['you', 'target player', 'target opponent', 'each player', 'each opponent'],
  rejects: ['your', 'target creature', 'each creature', 'target players'],
  parse: node<{ det: IrNoun['det']; raw: string; player?: 'any' | 'opponent' }, IrNoun>(
    ID.player,
    choice<{ det: IrNoun['det']; raw: string; player?: 'any' | 'opponent' }>(
      map(player('you'), (raw) => ({ det: 'you' as const, raw })),
      map(player('target player'), (raw) => ({
        det: 'target' as const,
        raw,
        player: 'any' as const,
      })),
      map(player('target opponent'), (raw) => ({
        det: 'target' as const,
        raw,
        player: 'opponent' as const,
      })),
      map(player('each player'), (raw) => ({ det: 'eachPlayer' as const, raw })),
      map(player('each opponent'), (raw) => ({ det: 'eachOpponent' as const, raw })),
    ),
    ({ det, raw, player: kind }) =>
      bare(det, { ...(kind === undefined ? {} : { player: kind }), raw }),
  ),
});

/**
 * `noun.target-spell`: "target spell", "target noncreature spell", "target instant or sorcery
 * spell", "target blue spell" (CR 405.1 (Stack), 701.6 (Counter), 115.1 (Targets)). The spell is
 * chosen as the counterspell is cast (CR 601.2c) among the spells on the stack that the words
 * describe: the filter is a stack filter of the card types, colors and subtypes the words name.
 */
export const NOUN_TARGET_SPELL = defineRule<IrNoun>({
  id: ID.targetSpell,
  family: 'noun',
  leading: ['target'],
  cites: ['CR 405.1 (Stack)', 'CR 701.6 (Counter)', 'CR 115.1 (Targets)', 'CR 205.2a (Card Types)'],
  examples: [
    'target spell',
    'target noncreature spell',
    'target creature spell',
    'target instant or sorcery spell',
    'target enchantment, instant, or sorcery spell',
    'target blue spell',
    'target legendary spell',
    'target Aura spell',
    'target spell with mana value 1',
    'target creature spell with mana value 3 or less',
  ],
  rejects: [
    'target spells',
    'target spell or ability',
    'target tapped spell',
    'target spell with mana value X or less',
    'target spell with power 4 or greater',
    'target spell with mana value greater than 3',
    'target creature or spell',
    'target creature, instant spell',
    'target instant or sorcery',
    'two target spells',
    'target nonland spell you control',
    'target',
  ],
  parse: node<IrFilter, IrNoun>(
    ID.targetSpell,
    map(sequence(literal('target '), spellPhrase()), ([, filter]) => filter),
    (filter) => bare('target', filter),
  ),
});

/** `noun.target-graveyard-card`: "target creature card from a graveyard" (CR 404.1). */
export const NOUN_TARGET_GRAVEYARD_CARD = defineRule<IrNoun>({
  id: ID.targetGraveyard,
  family: 'noun',
  leading: [],
  cites: ['CR 404.1 (Graveyard)', 'CR 115.1 (Targets)'],
  examples: [
    'target card from a graveyard',
    'target creature card from your graveyard',
    "target creature card from an opponent's graveyard",
    'two target land cards from your graveyard',
    'up to three target land cards from your graveyard',
    'up to one target card from a graveyard',
  ],
  rejects: [
    'target creature',
    'target card',
    'all creature cards from your graveyard',
    'up to two target land card from your graveyard',
  ],
  parse: targetOf(ID.targetGraveyard, graveyardPhrase),
});

/**
 * `noun.player-graveyard`: "target player's graveyard", "target opponent's graveyard" (CR 404.1: a
 * graveyard is its owner's discard pile; CR 108.3: a card belongs to its owner). Every card in it,
 * selected by its owner: the player is a target (CR 115.1) the noun carries as `of`, and the
 * engine's `each` selector reads cards whose owner is that player. Since stage P31 (D-140) the player may be "each opponent" or
 * "each player": the cards owned by each of them (`eachOpponent`, `eachPlayer`). A card of the graveyard, or "your" graveyard, is
 * another phrase.
 */
export const NOUN_PLAYER_GRAVEYARD = defineRule<IrNoun>({
  id: ID.playerGraveyard,
  family: 'noun',
  leading: ['target', 'each'],
  cites: ['CR 404.1 (Graveyard)', 'CR 108.3 (Cards)', 'CR 115.1 (Targets)'],
  examples: [
    "target player's graveyard",
    'target player’s graveyard',
    "target opponent's graveyard",
    "each opponent's graveyard",
    "each player's graveyard",
  ],
  rejects: [
    'target player',
    "target player's graveyards",
    "target players' graveyard",
    "each opponent's graveyards",
    "target creature's graveyard",
    "target player's library",
    'target player’s graveyard card',
    'a graveyard',
    'target card from a graveyard',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      // Stage P31 (D-140): "each opponent's graveyard", "each player's graveyard": the cards each of those players owns there.
      satisfy(
        family<IrNoun>('noun', { only: [ID.player] }),
        (n) => n.det === 'target' || n.det === 'eachOpponent' || n.det === 'eachPlayer',
      ),
      pattern(new RegExp(`['’]s graveyard${END}`, 'iu')),
    )(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    const [of] = r.value;
    const raw = ctx.text.slice(pos, r.pos);
    return {
      ok: true,
      value: {
        kind: 'noun',
        det: 'each',
        filter: { zone: 'graveyard', card: true, raw },
        upTo: false,
        plural: true,
        other: false,
        of,
        span: { start: pos, end: r.pos },
        rule: ID.playerGraveyard,
      },
      pos: r.pos,
    };
  },
});

/**
 * `noun.all-graveyards`: "all graveyards" (CR 404.1: each player's graveyard; stage P15): every card
 * in every graveyard, whoever owns it. A verb that takes it says so (`exile`).
 */
export const NOUN_ALL_GRAVEYARDS = defineRule<IrNoun>({
  id: 'noun.all-graveyards',
  family: 'noun',
  leading: ['all'],
  cites: ['CR 404.1 (Graveyard)'],
  examples: ['all graveyards'],
  rejects: ['all graveyard', 'each graveyard', 'all graveyards you control', 'graveyards', 'all'],
  parse: node<string, IrNoun>(
    'noun.all-graveyards',
    map(pattern(new RegExp(`all graveyards${END}`, 'iu')), (m) => m[0]),
    (raw) => bare('each', { zone: 'graveyard', card: true, raw }, { plural: true }),
  ),
});

/** `noun.all-graveyard-cards`: "all land cards from your graveyard". */
export const NOUN_ALL_GRAVEYARD_CARDS = defineRule<IrNoun>({
  id: ID.allGraveyard,
  family: 'noun',
  leading: ['all'],
  cites: ['CR 404.1 (Graveyard)'],
  examples: [
    'all land cards from your graveyard',
    'all cards from a graveyard',
    'all creature cards from all graveyards',
  ],
  rejects: ['all lands', 'each land card from your graveyard'],
  parse: node<IrFilter, IrNoun>(
    ID.allGraveyard,
    map(sequence(literal('all '), graveyardPhrase(true)), ([, filter]) => filter),
    (filter) => bare('each', filter, { plural: true }),
  ),
});

/** `noun.target-permanent`: "target nonland permanent an opponent controls" (CR 110.1, 115.1). */
export const NOUN_TARGET_PERMANENT = defineRule<IrNoun>({
  id: ID.targetPermanent,
  family: 'noun',
  leading: [],
  cites: ['CR 110.1 (Permanents)', 'CR 115.1 (Targets)'],
  examples: [
    'target creature',
    'target nonland permanent',
    'target tapped creature',
    'target legendary creature you control',
    "target creature you don't control",
    'target artifact creature',
    'two target creatures',
    'three target nonland permanents',
    'target creature or planeswalker',
    'target artifact or enchantment',
    'target artifact, creature, enchantment, or land',
    'target artifact or enchantment you control',
    'up to one target creature',
    'up to two target creatures',
    'up to one target artifact or enchantment',
    // Stage P41 (D-188, CR 603.12): as many targets as a sacrifice before a reflexive ability made.
    'up to that many target creatures',
    'up to that many target nonland permanents you control',
    'another target creature',
    'another target nonland permanent you control',
    'each of up to two target creatures',
    'each of two target creatures',
    'target Dragon',
    'target Forest',
    'target Equipment you control',
    'target Elf creature',
    'target legendary Elf creature',
    'two target Elves',
    'target creature with power 3 or less',
    "target creature or planeswalker that's green or blue",
    "target creature that's white, blue, or black",
    "target creature that's red or green",
    'target creature with flying',
    'target nontoken creature',
    'target creature without flying',
    'target creature an opponent controls with mana value 3 or greater',
    'target nonland permanent with mana value 2 or less',
    'target creature you control with toughness 5 or greater',
  ],
  rejects: [
    'up to one target creatures',
    'another target creatures',
    'each of target creature',
    'each of up to one target creatures',
    'another creature',
    'another target card from a graveyard',
    'another two target creatures',
    'up to two target creature',
    'up to zero target creatures',
    'up to target creature',
    'up to one creature',
    'up to that many target creature',
    'up to that many creatures',
    'up to that many target',
    'that many target creatures',
    'target nonblack creature',
    'target tapped creature or planeswalker',
    'target artifact, creature',
    'target artifact or',
    'target creature or creature',
    'target artifact and enchantment',
    'target artifact, or enchantment',
    'target creatures',
    'one target creature',
    'two target creature',
    'target creature with power greater than 3',
    'target creature with power 3 or less and flying',
    'target creature with power 3 or less or greater',
    'target Banana',
    'target card from a graveyard',
    "target creature that's green",
    "target creature that's green or green",
    "target creature that's green, or blue",
    "target green creature that's blue or red",
    "target creature that's green and blue",
    "target creature that's green or blue or red",
    "target creatures that's green or blue",
    "target creature that's colorless or blue",
    "target creature that's green or",
  ],
  // Stage P48 (D-205): one target may say which colors it has, "target creature or planeswalker that's green or blue".
  parse: targetOf(ID.targetPermanent, (plural) =>
    plural ? permanentPhrase(true, 'all') : withColorList(permanentPhrase(false, 'all')),
  ),
});

/**
 * `noun.all-permanents`: "all creatures", "all nonland permanents you control", "all other creatures"
 * (the permanents that match but the source itself, CR 109.1; stage P15).
 */
export const NOUN_ALL_PERMANENTS = defineRule<IrNoun>({
  id: ID.allPermanents,
  family: 'noun',
  leading: ['all'],
  cites: ['CR 110.1 (Permanents)'],
  examples: [
    'all creatures',
    'all nonland permanents',
    'all creatures your opponents control',
    'all other creatures',
    'all other Elves you control',
    'all artifacts, creatures, and enchantments',
    'all artifacts and enchantments',
    'all creatures and planeswalkers you control',
  ],
  rejects: [
    'all artifacts, creatures and enchantments',
    'all artifacts and artifacts',
    'all artifact and enchantments',
    'all creature',
    'all creature cards from your graveyard',
    'each creature',
    'all other creature',
    'all other',
    'other creatures',
  ],
  parse: node<{ filter: IrFilter; other: boolean }, IrNoun>(
    ID.allPermanents,
    map(
      sequence(
        literal('all '),
        optional(
          map(literal('other '), () => true),
          false,
        ),
        // Stage P31 (D-140): "all artifacts, creatures, and enchantments", a union of plural card types.
        choice(PLURAL_TYPE_UNION, permanentPhrase(true, 'all')),
      ),
      ([, other, filter]) => ({ filter, other }),
    ),
    ({ filter, other }) => bare('each', filter, { plural: true, other }),
  ),
});

/** `noun.each-permanent`: "each creature", "each other creature you control" (stage P15). */
export const NOUN_EACH_PERMANENT = defineRule<IrNoun>({
  id: ID.eachPermanent,
  family: 'noun',
  leading: ['each'],
  cites: ['CR 110.1 (Permanents)', 'CR 109.1 (Objects)'],
  examples: [
    'each creature',
    'each artifact you control',
    'each Plant creature you control',
    'each other creature you control',
  ],
  rejects: ['each creatures', 'all creatures', 'each opponent', 'each player', 'each other'],
  parse: node<{ filter: IrFilter; other: boolean }, IrNoun>(
    ID.eachPermanent,
    map(
      sequence(
        literal('each '),
        optional(
          map(literal('other '), () => true),
          false,
        ),
        permanentPhrase(false, 'all'),
      ),
      ([, other, filter]) => ({ filter, other }),
    ),
    ({ filter, other }) => bare('each', filter, { other }),
  ),
});

/**
 * `noun.plain-permanents`: "creatures you control", "nonland permanents you control": a plural
 * with no determiner, the subject of "get +1/+1 until end of turn". Which permanents it means is
 * fixed as the effect resolves (CR 611.2c), like "each". The singular and "other ..." are not read.
 */
export const NOUN_PLAIN_PERMANENTS = defineRule<IrNoun>({
  id: 'noun.plain-permanents',
  family: 'noun',
  leading: [],
  cites: ['CR 110.1 (Permanents)', 'CR 611.2c (Continuous Effects)'],
  examples: [
    'creatures you control',
    'nonland permanents you control',
    'creatures your opponents control',
    'artifact creatures you control',
  ],
  rejects: [
    'creature you control',
    'all creatures',
    'each creature',
    'other creatures you control',
    'target creatures',
  ],
  parse: node<IrFilter, IrNoun>('noun.plain-permanents', permanentPhrase(true, 'all'), (filter) =>
    bare('each', filter, { plural: true }),
  ),
});

export const NOUN_RULES = [
  NOUN_ANY_TARGET,
  // Stage P37 (D-180): "target player or planeswalker" and "each creature that player controls", whose first words are those of `noun.player`
  // and of `noun.each-permanent`.
  ...KORVOLD_EARLY_NOUN_RULES,
  // Before `noun.player`: "you and target opponent each" starts with "you", "each other player" with "each".
  ...PLAYER_NOUN_RULES,
  // Stage P52 (D-210): "each player who discarded a card this way".
  ...VRASKA_EARLY_NOUN_RULES,
  NOUN_PLAYER,
  NOUN_TARGET_SPELL,
  // Stage P32 (D-147): "target commander" before `noun.target-permanent`, whose phrase would stop at "commander".
  ...DINOSAUR_NOUN_RULES,
  // Stage P34 (D-152): "each other opponent" and "each of up to two other targets".
  ...DRAGON_NOUN_RULES,
  ...KORVOLD_NOUN_RULES,
  // D-931: "up to three other target creatures from the battlefield and/or creature cards from graveyards".
  ...CROSS_ZONE_NOUN_RULES,
  NOUN_TARGET_GRAVEYARD_CARD,
  NOUN_PLAYER_GRAVEYARD,
  NOUN_ALL_GRAVEYARD_CARDS,
  NOUN_ALL_GRAVEYARDS,
  NOUN_TARGET_PERMANENT,
  NOUN_ALL_PERMANENTS,
  // Stage P68 (D-230): "each permanent you control that's a creature or Vehicle", which `noun.each-permanent` would stop at.
  ...HOFRI_NOUN_RULES,
  NOUN_EACH_PERMANENT,
  // Stage P64 and P65 (D-217, D-218): "creature tokens you control" and "creatures attacking your opponents and/or planeswalkers they control", whose first words are
  // those of `noun.plain-permanents`.
  ...EDHREC_NOUN_RULES,
  // Before `noun.plain-permanents`, which reads the first group of "A you control and other B you control" alone.
  NOUN_SUBTYPE_UNION,
  NOUN_PLAIN_PERMANENTS,
  NOUN_IT,
  NOUN_EACH_OF_THEM,
  NOUN_THAT_TOKEN,
  // Stage P50 (D-207): "target triggered ability or colorless spell".
  ...VRASKA_NOUN_RULES,
  // Stage P33 (D-150): "that nonland permanent card", "this card".
  ...ANGEL_NOUN_RULES,
  NOUN_ITS_CONTROLLER,
  NOUN_ATTACKED_BY_IT,
  ...SUBJECT_NOUN_RULES,
  ...CHOOSE_NOUN_RULES,
  ...LIBRARY_NOUN_RULES,
];

export const NOUN_IDS = ID;
