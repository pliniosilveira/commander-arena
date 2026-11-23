/**
 * Static units of the Hofri Ghostforge deck (stage P68, D-229): "~ isn't a creature" (CR 613.1d, 205.1a), a unit of `static.conditional-prefix`
 * ("As long as there are fewer than eight cards in your graveyard, ~ isn't a creature.").
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
  sequence,
} from '../../combinators';
import type { IrFilter, IrNoun, IrQuotedAbility, IrStatic } from '../../ir/types';
import {
  CARD_TYPES,
  comparisonSuffix,
  SUBTYPE_WORD,
  typeChoice,
  typeWords,
  withComparison,
} from '../noun/phrases';
import { defineRule, family, quietly } from '../registry';
import type { StaticUnit } from './grants';
import { readQuotedAbility } from './quoted';

/** `~ isn't a creature` and `~ is not a creature`: the permanent itself loses the creature card type. Not read: another subject, another type, "is a". */
export const SELF_ISNT_CREATURE_UNIT: Parser<StaticUnit> = (ctx, pos) => {
  const self = quiet(family<IrNoun>('noun', { only: ['noun.self'] }))(ctx, pos);
  if (!self.ok) return self;
  const tail = map(
    choice(
      literal(" isn't a creature"),
      literal(' isn’t a creature'),
      literal(' is not a creature'),
    ),
    () => null,
  )(ctx, self.pos);
  if (!tail.ok) return tail;
  return {
    ok: true,
    value: { noun: self.value, effects: [{ kind: 'loseTypes', cardTypes: ['creature'] }] },
    pos: tail.pos,
  };
};

/**
 * The subtypes only a permanent that is not a land can have (CR 205.3g artifact types, 205.3h enchantment types): "an Aura or Equipment spell" (D-401, Danitha). A subtype of
 * an instant or a sorcery (CR 205.3k) or of a land is not one, as the spell has to be something the permission can cast.
 */
const PERMANENT_SPELL_SUBTYPES: ReadonlySet<string> = new Set([
  'Aura',
  'Curse',
  'Equipment',
  'Fortification',
  'Saga',
  'Shrine',
  'Vehicle',
]);

/** "Aura", "Aura or Equipment", "Aura, Equipment, or Vehicle": one or more subtypes of `PERMANENT_SPELL_SUBTYPES`, each once. */
const SPELL_SUBTYPES: Parser<string[]> = (ctx, pos) => {
  const several = typeChoice(SUBTYPE_WORD, true)(ctx, pos);
  const words = several.ok
    ? several
    : map(pattern(new RegExp(`${SUBTYPE_WORD}(?![\\p{L}\\p{N}])`, 'u')), (m): string[] => [m[0]])(
        ctx,
        pos,
      );
  if (!words.ok) return words;
  return words.value.every((w) => PERMANENT_SPELL_SUBTYPES.has(w)) ? words : fail(ctx, pos);
};

/** What a graveyard permission's spell words name: card types (or "permanent"), or subtypes of permanents. */
interface Named {
  readonly types: string[];
  readonly subtypes?: string[];
  /** A creature type before "creature" ("a Zombie creature spell", Gisa and Geralf, issue 159): the spell is a creature of that type. */
  readonly creatureType?: string;
}

/**
 * The spells a graveyard permission names, "an artifact spell", "a permanent spell with mana value 3 or less", "an Aura or Equipment spell": an article, the card types or
 * "permanent" (a card type of a permanent: not an instant, a sorcery or a land) or subtypes of permanents (D-401), "spell", and a comparison of the card.
 */
const GRAVEYARD_SPELL: Parser<IrFilter> = (ctx, pos) => {
  const r = sequence(
    pattern(/an? /iu),
    choice(
      map(literal('permanent'), (): Named => ({ types: ['permanent'] })),
      map(typeWords(CARD_TYPES, false), (types): Named => ({ types })),
      map(SPELL_SUBTYPES, (subtypes): Named => ({ types: [], subtypes })),
      // Issue 159: "a Zombie creature spell": a creature type, then "creature".
      map(
        sequence(pattern(new RegExp(`(${SUBTYPE_WORD})(?= creature )`, 'u')), literal(' creature')),
        ([m]): Named => ({ types: ['creature'], creatureType: m[1] ?? '' }),
      ),
    ),
    literal(' spell'),
    optional(
      map(comparisonSuffix(['manaValue']), (c) => c),
      undefined,
    ),
  )(ctx, pos);
  if (!r.ok) return r;
  const [, what, , compared] = r.value;
  const { types } = what;
  if (what.creatureType !== undefined && PERMANENT_SPELL_SUBTYPES.has(what.creatureType)) {
    return fail(ctx, pos);
  }
  const permanent = types.length === 1 && types[0] === 'permanent';
  if (!permanent && types.some((t) => t === 'land' || t === 'instant' || t === 'sorcery')) {
    return fail(ctx, pos);
  }
  const raw = ctx.text.slice(pos, r.pos);
  const base: IrFilter = what.creatureType
    ? { types: ['creature'], subtypes: [what.creatureType], raw }
    : what.subtypes
      ? {
          // The spell is an Aura or an Equipment (each member one subtype), as a spell of any of the card types is (CR 205.3).
          anyOf: what.subtypes.map((w): IrFilter => ({ subtypes: [w], raw: w })),
          raw,
        }
      : {
          ...(permanent
            ? {
                anyOf: ['artifact', 'creature', 'enchantment', 'planeswalker', 'battle'].map(
                  (t): IrFilter => ({ types: [t], raw: t }),
                ),
              }
            : { types }),
          raw,
        };
  return { ok: true, value: withComparison(base, compared), pos: r.pos };
};

/**
 * `static.graveyard-play-once-each-turn`: "Once during each of your turns, you may play a land from your graveyard or cast a permanent spell with mana value 3 or less from
 * your graveyard. If you do, it gains "When this permanent is put into a graveyard from the battlefield, exile it and you gain 2 life."" (Serra Paragon) and "Once during each
 * of your turns, you may cast an artifact spell from your graveyard. If you cast a spell this way, that artifact enters tapped." (Edgar, Master Machinist; CR 601.2a, 305.1,
 * 113.6, 604.1: while the permanent is on the battlefield its controller may, in their own turn and once each turn, play a land card or cast a spell from their graveyard;
 * a land or a spell has to be what the text says). The engine's `playFromGraveyardOnceEachTurn`. Not read: another zone or player, "any number of times", an
 * ability the permanent gains that is not triggered, the rider of the artifact for a spell that is not an artifact, a land and a spell with a rider that says "that artifact".
 */
export const STATIC_GRAVEYARD_PLAY = defineRule<IrStatic>({
  id: 'static.graveyard-play-once-each-turn',
  family: 'static',
  leading: ['once'],
  cites: [
    'CR 601.2a (Casting Spells)',
    'CR 305.1 (Lands)',
    'CR 113.6 (Abilities)',
    'CR 604.1 (Handling Static Abilities)',
  ],
  examples: [
    'Once during each of your turns, you may cast an artifact spell from your graveyard. If you cast a spell this way, that artifact enters tapped.',
    'Once during each of your turns, you may play a land from your graveyard or cast a permanent spell with mana value 3 or less from your graveyard. If you do, it gains "When ~ is put into a graveyard from the battlefield, exile it and you gain 2 life."',
    'Once during each of your turns, you may cast a creature spell from your graveyard.',
    // Grave Danger (issue 159, Gisa and Geralf): a creature type before "creature".
    'Once during each of your turns, you may cast a Zombie creature spell from your graveyard.',
    'Once during each of your turns, you may play a land from your graveyard.',
    // D-401 (Danitha, group 1b): subtypes of permanents.
    'Once during each of your turns, you may cast an Aura or Equipment spell from your graveyard.',
    'Once during each of your turns, you may cast an Aura spell from your graveyard.',
    'Once during each of your turns, you may cast an Aura, Equipment, or Vehicle spell from your graveyard.',
    // Issue 102 (Kotis, Sibsig Champion): the spell cast exiles other cards of the graveyard as an additional cost.
    'Once during each of your turns, you may cast a creature spell from your graveyard by exiling three other cards from your graveyard in addition to paying its other costs.',
    // Issue 97 (Banon, the Returners' Leader): only the cards put there this turn from anywhere but the battlefield.
    'Once during each of your turns, you may cast a creature spell from among cards in your graveyard that were put there from anywhere other than the battlefield this turn.',
  ],
  rejects: [
    'Once during each of your turns, you may cast a creature spell from among cards in your graveyard that were put there from the battlefield this turn.',
    'Once during each of your turns, you may cast a creature spell from among cards in your graveyard that were put there from anywhere other than the battlefield this turn',
    'Once during each of your turns, you may play a land from among cards in your graveyard that were put there from anywhere other than the battlefield this turn.',
    'Once during each of your turns, you may cast an artifact spell from your graveyard',
    'Once during each of your turns, you may cast an artifact spell from your hand.',
    'Once during each of your turns, you may cast an artifact spell from an opponent’s graveyard.',
    'Once during each of your turns, you may cast an artifact spell from your graveyard. If you cast a spell this way, that artifact enters untapped.',
    'Once during each of your turns, you may cast a creature spell from your graveyard. If you cast a spell this way, that artifact enters tapped.',
    'Once during each of your turns, you may cast an instant spell from your graveyard.',
    'Once during each of your turns, you may play a land from your graveyard or cast an artifact spell from your graveyard. If you cast a spell this way, that artifact enters tapped.',
    'Once during each of your turns, you may play a land from your graveyard or cast a permanent spell from your graveyard. If you do, it gains flying.',
    'Once each turn, you may cast an artifact spell from your graveyard.',
    'Once during each of your turns, you may play lands from your graveyard.',
    'Once during each of your turns, you may cast artifact spells from your graveyard.',
    'Once during each of your turns, you may cast an Aura or Equipment spell from your hand.',
    'Once during each of your turns, you may cast an Aura or Equipment spell from an opponent’s graveyard.',
    'Once during each of your turns, you may cast an Aura or Equipment spell from your graveyard. If you cast a spell this way, that artifact enters tapped.',
    'Once during each of your turns, you may cast an Aura or Arcane spell from your graveyard.',
    'Once during each of your turns, you may cast an Aura or Forest spell from your graveyard.',
    'Once during each of your turns, you may cast a Zombie spell from your graveyard.',
    'Once during each of your turns, you may cast a Zombie creature spell from your hand.',
    'Once during each of your turns, you may cast an Aura creature spell from your graveyard.',
    'Once during each of your turns, you may cast an Aura or Banana spell from your graveyard.',
    'Once during each of your turns, you may cast an Aura or Aura spell from your graveyard.',
    'Once during each of your turns, you may cast Aura or Equipment spells from your graveyard.',
    'Once during each of your turns, you may cast an Aura and Equipment spell from your graveyard.',
    'Once during each of your turns, you may cast a creature spell from your graveyard by exiling three other cards from your graveyard.',
    'Once during each of your turns, you may cast a creature spell from your graveyard by exiling three other cards from your hand in addition to paying its other costs.',
    'Once during each of your turns, you may cast a creature spell from your graveyard by exiling one other card from your graveyard in addition to paying its other costs.',
  ],
  parse: (ctx, pos) => {
    const id = 'static.graveyard-play-once-each-turn';
    const head = literal('once during each of your turns, you may ')(ctx, pos);
    if (!head.ok) return head;
    const land = literal('play a land from your graveyard')(ctx, head.pos);
    let at = head.pos;
    let hasLand = false;
    let cast: IrFilter | undefined;
    let exileOthers: number | undefined;
    let putElsewhere = false;
    if (land.ok) {
      hasLand = true;
      at = land.pos;
      const or = literal(' or cast ')(ctx, at);
      if (or.ok) {
        const spell = GRAVEYARD_SPELL(ctx, or.pos);
        if (!spell.ok) return spell;
        cast = spell.value;
        at = spell.pos;
        const yard = literal(' from your graveyard')(ctx, at);
        if (!yard.ok) return yard;
        at = yard.pos;
      }
    } else {
      const verb = literal('cast ')(ctx, at);
      if (!verb.ok) return verb;
      const spell = GRAVEYARD_SPELL(ctx, verb.pos);
      if (!spell.ok) return spell;
      cast = spell.value;
      // CR 404.1 (Banon): "from among cards in your graveyard that were put there from anywhere other than the battlefield this turn".
      const among = literal(
        ' from among cards in your graveyard that were put there from anywhere other than the battlefield this turn',
      )(ctx, spell.pos);
      const yard = among.ok ? among : literal(' from your graveyard')(ctx, spell.pos);
      if (!yard.ok) return yard;
      putElsewhere = among.ok;
      at = yard.pos;
      // Issue 102 (Kotis, CR 601.2f): "by exiling three other cards from your graveyard in addition to paying its other costs".
      const extra = pattern(
        /by exiling (two|three|four|five) other cards from your graveyard in addition to paying its other costs/iu,
      )(ctx, at + 1);
      if (extra.ok && ctx.text[at] === ' ') {
        exileOthers = { two: 2, three: 3, four: 4, five: 5 }[(extra.value[1] ?? '').toLowerCase()];
        at = extra.pos;
      }
    }
    const stop = literal('.')(ctx, at);
    if (!stop.ok) return stop;
    at = stop.pos;
    let entersTapped = false;
    let gains: IrQuotedAbility | undefined;
    const tapped = literal(' If you cast a spell this way, that artifact enters tapped.')(ctx, at);
    const gain = literal(' If you do, it gains ')(ctx, at);
    if (tapped.ok) {
      // "that artifact" says the spells are artifacts and nothing else is played this way.
      const onlyArtifacts =
        !hasLand &&
        cast?.types?.length === 1 &&
        cast.types[0] === 'artifact' &&
        cast.anyOf === undefined;
      if (!onlyArtifacts) return fail(ctx, at);
      entersTapped = true;
      at = tapped.pos;
    } else if (gain.ok) {
      // "it" is the land or the spell the permission was used for: both are named by the text.
      if (!hasLand || cast === undefined) return fail(ctx, at);
      const quoted = readQuotedAbility(ctx, gain.pos, { mana: false });
      if (!quoted.ok) return quoted;
      const end = literal('.')(ctx, quoted.pos);
      gains = quoted.value;
      at = quoted.pos;
      if (end.ok) at = end.pos;
    }
    const subject: IrNoun = {
      kind: 'noun',
      det: 'you',
      filter: { raw: 'You' },
      upTo: false,
      plural: false,
      other: false,
      span: { start: pos, end: pos },
      rule: id,
    };
    return {
      ok: true,
      value: {
        kind: 'static',
        subject,
        effects: [
          {
            kind: 'graveyardPlay',
            ...(cast === undefined ? {} : { cast }),
            land: hasLand,
            entersTapped,
            ...(gains === undefined ? {} : { gains }),
            ...(exileOthers === undefined ? {} : { exileOthers }),
            ...(putElsewhere ? { putElsewhereThisTurn: true as const } : {}),
          },
        ],
        span: { start: pos, end: at },
        rule: id,
      },
      pos: at,
    };
  },
});

export const HOFRI_STATIC_RULES = [STATIC_GRAVEYARD_PLAY].map(quietly);
