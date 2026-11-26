/**
 * Static ability rules of stage P34 (D-151, D-152): what the engine's Dragons slice reads. Mana that does not empty as steps and phases end (CR
 * 500.5), casting spells from the top of the library (CR 601.3, 401.5) and what a permanent is while a condition holds ("~ is a Dragon with base
 * power and toughness 4/4, flying, and "{R}: ..."", CR 613.1d, 613.4b, 613.1f), which `static.conditional-prefix` reads as one of its statements.
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  type Parser,
  pattern,
  quiet,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrFilter, IrNoun, IrStatic, IrStaticEffect } from '../../ir/types';
import { BASE_PT, CREATURE_TYPE_LIST } from '../effect/becomes';
import { KEYWORD_WORDS } from '../keyword/list';
import { readCreatureType } from '../noun/creature-types';
import {
  CARD_TYPES,
  comparisonSuffix,
  SUBTYPE_WORD,
  typeChoice,
  typeWords,
  withComparison,
} from '../noun/phrases';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, family, quietly } from '../registry';
import type { StaticUnit } from './grants';
import { QUOTED_ABILITY } from './quoted';

const COLOR_LETTERS: Readonly<Record<string, string>> = {
  white: 'W',
  blue: 'U',
  black: 'B',
  red: 'R',
  green: 'G',
  colorless: 'C',
};

function youNoun(rule: string, pos: number): IrNoun {
  return {
    kind: 'noun',
    det: 'you',
    filter: { raw: 'You' },
    upTo: false,
    plural: false,
    other: false,
    span: { start: pos, end: pos + 3 },
    rule,
  };
}

/**
 * `static.unspent-mana`: "You don't lose unspent red mana as steps and phases end." (CR 500.5, 106.4: mana empties from a player's pool as each
 * step and phase ends; this ability keeps the mana of the color it names). One color word, or none for mana of every color.
 */
export const STATIC_UNSPENT_MANA = defineRule<IrStatic>({
  id: 'static.unspent-mana',
  family: 'static',
  leading: ['you'],
  cites: [
    'CR 500.5 (Beginning of Turn)',
    'CR 106.4 (Mana)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    "You don't lose unspent red mana as steps and phases end.",
    'You don’t lose unspent green mana as steps and phases end.',
    "You don't lose unspent mana as steps and phases end.",
    "You don't lose unspent colorless mana as steps and phases end.",
  ],
  rejects: [
    "You don't lose unspent red mana as steps and phases end",
    "You don't lose unspent red mana as steps end.",
    "You don't lose unspent red and green mana as steps and phases end.",
    "You don't lose unspent red mana as phases end.",
    "You don't lose red mana as steps and phases end.",
    "You don't lose unspent red mana as steps and phases end and you gain 1 life.",
    "Each player doesn't lose unspent red mana as steps and phases end.",
    "You don't lose unspent red mana as steps and phases end until end of turn.",
    'You lose unspent red mana as steps and phases end.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /you don['’]t lose unspent (?:(white|blue|black|red|green|colorless) )?mana as steps and phases end\./iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const word = (r.value[1] ?? '').toLowerCase();
    const colors = word === '' ? ['W', 'U', 'B', 'R', 'G', 'C'] : [COLOR_LETTERS[word] ?? ''];
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: youNoun('static.unspent-mana', pos),
        effects: [{ kind: 'unspentManaStays', colors }],
        span: { start: pos, end: r.pos },
        rule: 'static.unspent-mana',
      },
      pos: r.pos,
    };
  },
});

const COUNT_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

/**
 * `static.surveil-look-additional`: "You may look at an additional two cards each time you surveil." (Enhanced Surveillance; CR 701.25a, 604.1: each surveil of the controller looks at that
 * many more cards). A number of one to six, written as a word; "one" takes the singular "card". Not read: a digit, another player, "scry", "whenever", a missing period, a second sentence.
 */
export const STATIC_SURVEIL_LOOK_ADDITIONAL = defineRule<IrStatic>({
  id: 'static.surveil-look-additional',
  family: 'static',
  leading: ['you'],
  cites: ['CR 701.25a (Surveil)', 'CR 604.1 (Handling Static Abilities)'],
  examples: [
    'You may look at an additional two cards each time you surveil.',
    'You may look at an additional card each time you surveil.',
    'You may look at an additional three cards each time you surveil.',
  ],
  rejects: [
    'You may look at an additional two cards each time you surveil',
    'You may look at an additional 2 cards each time you surveil.',
    'You may look at an additional two cards each time you scry.',
    'You may look at an additional two cards each time an opponent surveils.',
    'You may look at an additional two cards whenever you surveil.',
    'You may look at an additional card each time you surveil. Draw a card.',
    'You may look at an additional two card each time you surveil.',
    'You may look at an additional one cards each time you surveil.',
    'You may look at two additional cards each time you surveil.',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /you may look at an additional (?:(card)|(one|two|three|four|five|six) (cards)) each time you surveil\./iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const word = (r.value[2] ?? '').toLowerCase();
    // "an additional card" is one, and "one cards" is not English.
    if (word === 'one') return fail(ctx, pos);
    const count = word === '' ? 1 : (COUNT_WORDS[word] ?? 0);
    if (count < 1) return fail(ctx, pos);
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: youNoun('static.surveil-look-additional', pos),
        effects: [{ kind: 'surveilLookAdditional', count }],
        span: { start: pos, end: r.pos },
        rule: 'static.surveil-look-additional',
      },
      pos: r.pos,
    };
  },
});

/**
 * `static.play-surveiled-graveyard`: "You may play lands and cast spells from among cards in your graveyard you've surveilled this turn. If you cast a spell this way, you pay life equal to its
 * mana value rather than paying its mana cost." (Eye of Duskmantle; CR 701.25a, 601.2a, 305.1, 118.9: the cards a surveil of the controller put into the graveyard this turn, played at the
 * timing of their types, the spells paid for with life). Both sentences, as the card prints them. Not read: another player's graveyard, another span than "this turn", only lands or only
 * spells, a payment other than life equal to the mana value, a missing second sentence.
 */
export const STATIC_PLAY_SURVEILED_GRAVEYARD = defineRule<IrStatic>({
  id: 'static.play-surveiled-graveyard',
  family: 'static',
  leading: ['you'],
  cites: [
    'CR 701.25a (Surveil)',
    'CR 601.2a (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 118.9 (Costs)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    "You may play lands and cast spells from among cards in your graveyard you've surveilled this turn. If you cast a spell this way, you pay life equal to its mana value rather than paying its mana cost.",
    'You may play lands and cast spells from among cards in your graveyard you’ve surveilled this turn. If you cast a spell this way, you pay life equal to its mana value rather than paying its mana cost.',
  ],
  rejects: [
    "You may play lands and cast spells from among cards in your graveyard you've surveilled this turn.",
    "You may play lands and cast spells from among cards in your graveyard you've surveilled this turn. If you cast a spell this way, you pay life equal to its mana value rather than paying its mana cost. Draw a card.",
    "You may play lands from among cards in your graveyard you've surveilled this turn. If you cast a spell this way, you pay life equal to its mana value rather than paying its mana cost.",
    "You may play lands and cast spells from among cards in a graveyard you've surveilled this turn. If you cast a spell this way, you pay life equal to its mana value rather than paying its mana cost.",
    "You may play lands and cast spells from among cards in your graveyard you've surveilled. If you cast a spell this way, you pay life equal to its mana value rather than paying its mana cost.",
    "You may play lands and cast spells from among cards in your graveyard you've scried this turn. If you cast a spell this way, you pay life equal to its mana value rather than paying its mana cost.",
    "You may play lands and cast spells from among cards in your graveyard you've surveilled this turn. If you cast a spell this way, you pay twice its mana value in life rather than paying its mana cost.",
    "You may play lands and cast spells from among cards in your graveyard you've surveilled this turn. If you cast a spell this way, you pay life equal to its mana value.",
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /you may play lands and cast spells from among cards in your graveyard you['’]ve surveilled this turn\. if you cast a spell this way, you pay life equal to its mana value rather than paying its mana cost\./iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: youNoun('static.play-surveiled-graveyard', pos),
        effects: [{ kind: 'playSurveiledFromGraveyard' }],
        span: { start: pos, end: r.pos },
        rule: 'static.play-surveiled-graveyard',
      },
      pos: r.pos,
    };
  },
});

/** The kind of spell a cast-from-the-top permission names: card types, one creature type, or a choice of creature types. */
interface SpellKind {
  readonly types: string[];
  readonly subtypes: string[];
  readonly anyOfSubtypes?: readonly string[];
}

/**
 * `static.cast-from-top`: "You may cast creature spells with power 4 or greater from the top of your library. If you cast a creature spell this
 * way, it gains haste until end of turn." (CR 601.3, 401.5, 702.10: the player may cast the top card of their library when it is a spell of the
 * kind, at the timing of its type and for its ordinary cost). The kind is the card types and the comparisons of a card ("with power 4 or greater",
 * "with mana value 3 or less"); the second sentence is only said of creature spells. It does not let the player look at the card, which is the
 * ability "You may look at the top card of your library any time." by itself.
 */
export const STATIC_CAST_FROM_TOP = defineRule<IrStatic>({
  id: 'static.cast-from-top',
  family: 'static',
  leading: ['you'],
  cites: [
    'CR 601.3 (Casting Spells)',
    'CR 401.5 (Library)',
    'CR 702.10 (Haste)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    'You may cast creature spells with power 4 or greater from the top of your library. If you cast a creature spell this way, it gains haste until end of turn.',
    'You may cast creature spells from the top of your library.',
    'You may cast artifact spells with mana value 3 or less from the top of your library.',
    'You may cast spells from the top of your library.',
    // Issue 144 (Conspicuous Snoop): a creature type.
    'You may cast Goblin spells from the top of your library.',
    // Nalia de'Arnise (CR 205.3m): spells with any of several creature types.
    'You may cast Cleric, Rogue, Warrior, and Wizard spells from the top of your library.',
    'You may cast Cleric and Rogue spells from the top of your library.',
    // Sliver Swarm deck, group C (Realmwalker): the creature type the permanent chose as it entered.
    'You may cast creature spells of the chosen type from the top of your library.',
    // Death Toll deck, group D (CR 601.2b, 118.8): an additional cost for each such spell.
    'You may cast spells from the top of your library by sacrificing a nonland permanent in addition to paying their other costs.',
  ],
  rejects: [
    'You may cast spells from the top of your library by sacrificing a nonland permanent in addition to paying their other costs',
    'You may cast spells from the top of your library by sacrificing a creature in addition to paying their other costs.',
    'You may cast spells from the top of your library by sacrificing a nonland permanent.',
    'You may cast spells from the top of your library by sacrificing a nonland permanent instead of paying their mana costs.',
    'You may cast creature spells from the top of your library by sacrificing a nonland permanent in addition to paying their other costs. If you cast a creature spell this way, it gains haste until end of turn.',
    'You may cast spells from the top of your library by sacrificing two nonland permanents in addition to paying their other costs.',
    'You may cast creature spells from the top of your library',
    'You may cast creature spells from the top of your graveyard.',
    'You may cast creature spells from the top of an opponent’s library.',
    'You may cast creature spells with power 4 or greater from the top of your library. If you cast a creature spell this way, it gains flying until end of turn.',
    'You may cast artifact spells from the top of your library. If you cast a creature spell this way, it gains haste until end of turn.',
    'You may cast creature spells from the top of your library. If you cast a creature spell this way, it gains haste.',
    'You may cast creature spells from the top of your library and the bottom of your library.',
    'You may cast a creature spell from the top of your library.',
    'You may cast creature spells from the top of your library once each turn.',
    'You may play lands from the top of your library.',
    'You may cast creature spells from the top of your library. You may look at the top card of your library any time.',
    'You may cast creature cards from the top of your library.',
    'You may cast Goblins spells from the top of your library.',
    'You may cast Cleric, Rogue, Warrior, or Wizard spells from the top of your library.',
    'You may cast Cleric, Rogue, Goblins spells from the top of your library.',
    'You may cast Goblin from the top of your library.',
    'You may cast Goblin Warrior spells from the top of your library. If you cast a creature spell this way, it gains haste until end of turn.',
    'You may cast creature spells of the chosen color from the top of your library.',
    'You may cast creature spells of the chosen type from the top of your graveyard.',
    'You may cast creature spells of the chosen type of the chosen type from the top of your library.',
  ],
  parse: (ctx, pos) => {
    const id = 'static.cast-from-top';
    const r = sequence(
      literal('you may cast '),
      optional(
        choice(
          map(sequence(typeWords(CARD_TYPES, false), literal(' ')), ([types]) => ({
            types,
            subtypes: [] as string[],
          })),
          // Nalia de'Arnise (CR 205.3m): "Cleric, Rogue, Warrior, and Wizard spells", a spell with any of two or more creature types.
          map(
            sequence(
              satisfy(typeChoice(SUBTYPE_WORD, true, 'and'), (list) =>
                list.every((w) => readCreatureType(w)?.plural === false),
              ),
              literal(' '),
            ),
            ([list]) => ({ types: [] as string[], subtypes: [] as string[], anyOfSubtypes: list }),
          ),
          // Issue 144 (Conspicuous Snoop): "Goblin spells", a creature type.
          map(
            sequence(
              satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural !== true),
              literal(' '),
            ),
            ([w]) => ({ types: [] as string[], subtypes: [w.subtype] }),
          ),
        ),
        { types: [] as string[], subtypes: [] as string[] },
      ),
      literal('spells'),
      // Sliver Swarm deck, group C (Realmwalker): "creature spells of the chosen type", the creature type the permanent chose as it entered (CR 607.2d).
      optional(
        map(pattern(/ of the chosen type(?![\p{L}\p{N}])/iu), () => true),
        false,
      ),
      optional(
        map(comparisonSuffix(['power', 'toughness', 'manaValue']), (c) => c),
        undefined,
      ),
      pattern(
        / from the top of your library(?:\.| by sacrificing a nonland permanent in addition to paying their other costs\.)/iu,
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, kind, , chosenType, compared, ended] = r.value;
    const { types, subtypes } = kind;
    const anyOfSubtypes = (kind as SpellKind).anyOfSubtypes;
    const sacrifice = /by sacrificing/iu.test(ended[0] ?? '');
    const base: IrFilter = {
      ...(types.length > 0 ? { types } : {}),
      ...(subtypes.length > 0 ? { subtypes } : {}),
      ...(anyOfSubtypes === undefined
        ? {}
        : { anyOf: anyOfSubtypes.map((w): IrFilter => ({ subtypes: [w], raw: w })) }),
      ...(chosenType ? { chosen: 'type' as const } : {}),
      raw: ctx.text.slice(pos, r.pos),
    };
    const spells = withComparison(base, compared);
    // "If you cast a creature spell this way, it gains haste until end of turn.": said of creature spells.
    const haste = pattern(
      / if you cast a creature spell this way, it gains haste until end of turn\./iu,
    )(ctx, r.pos);
    if (haste.ok && !types.includes('creature')) return fail(ctx, r.pos);
    // The sacrifice is said of "spells" in general, with nothing after it: a line that also gives haste is another ability.
    if (haste.ok && sacrifice) return fail(ctx, r.pos);
    const end = haste.ok ? haste.pos : r.pos;
    return {
      ok: true,
      value: {
        kind: 'static',
        subject: youNoun(id, pos),
        effects: [
          {
            kind: 'castFromTop',
            spells,
            gainsHaste: haste.ok,
            ...(sacrifice ? { sacrifice: { notTypes: ['land'], raw: 'a nonland permanent' } } : {}),
          },
        ],
        span: { start: pos, end },
        rule: id,
      },
      pos: end,
    };
  },
});

/**
 * What `~` is while a condition holds: "~ is a Dragon with base power and toughness 4/4, flying, and "{R}: Dragons you control get +1/+0 until end
 * of turn."" (CR 613.1d, 613.4b, 613.1f). Creature types that replace its own (the card types stay), base power and toughness, keywords, and an
 * ability in quotes, each its own effect of the statement, as the layers apply them. A unit of `static.conditional-prefix`.
 */
export const SELF_BECOMES_UNIT: Parser<StaticUnit> = (ctx, pos) => {
  const self = quiet(family<IrNoun>('noun', { only: ['noun.self'] }))(ctx, pos);
  if (!self.ok) return self;
  const is = sequence(
    pattern(/ is an? /iu),
    CREATURE_TYPE_LIST,
    optional(
      map(sequence(literal(' with '), BASE_PT('static.conditional-prefix')), ([, pt]) => pt),
      null,
    ),
  )(ctx, self.pos);
  if (!is.ok) return is;
  const [, subtypes, basePt] = is.value;
  const effects: IrStaticEffect[] = [{ kind: 'replaceTypes', cardTypes: [], subtypes }];
  if (basePt !== null) {
    effects.push({ kind: 'basePt', power: basePt.power, toughness: basePt.toughness });
  }
  let at = is.pos;
  const keywords = sequence(literal(', '), KEYWORD_WORDS)(ctx, at);
  if (keywords.ok) {
    for (const keyword of keywords.value[1]) effects.push({ kind: 'grantKeyword', keyword });
    at = keywords.pos;
  }
  const quoted = sequence(choice(literal(', and '), literal(' and ')), QUOTED_ABILITY)(ctx, at);
  if (quoted.ok) {
    effects.push(...quoted.value[1]);
    at = quoted.pos;
  }
  // A statement that is nothing but a creature type and numbers is `static.attached-becomes`'s way of speaking; here at least one thing more
  // than the type is said, or the keywords and the ability.
  if (basePt === null && !keywords.ok && !quoted.ok) return fail(ctx, pos);
  return { ok: true, value: { noun: self.value, effects }, pos: at };
};

export const DRAGON_STATIC_RULES = [
  STATIC_UNSPENT_MANA,
  STATIC_SURVEIL_LOOK_ADDITIONAL,
  STATIC_PLAY_SURVEILED_GRAVEYARD,
  STATIC_CAST_FROM_TOP,
].map(quietly);
