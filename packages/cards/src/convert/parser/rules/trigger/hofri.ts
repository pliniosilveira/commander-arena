/**
 * Trigger rules of the Hofri Ghostforge deck (stage P68, D-229): "Whenever one or more cards leave your graveyard" (CR 400.7, 603.2c), "Whenever one or more
 * cards are put into exile from your library and/or your graveyard", "an opponent casts their second spell each turn" and "you cast your first spell during each opponent's turn" (CR 601.2i), "one or more creatures
 * you control with mana value 3 or less enter" (CR 603.2c, 603.6a) and "you create one or more creature tokens" (CR 111.1, 701.7a: a token is created as it
 * enters the battlefield).
 */
import { choice, fail, literal, map, optional, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun, IrTrigger } from '../../ir/types';
import { permanentPhrase, spellPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
import { CARD_KINDS, cardFilter } from './death-toll-b';
import { makeNoun } from './subjects';

/** A trigger of one event with no subject, from `pos` to `end`. */
function plain(id: string, event: string, pos: number, end: number): IrTrigger {
  return {
    kind: 'trigger',
    event,
    args: {},
    span: { start: pos, end },
    rule: id,
  };
}

/**
 * `trigger.cards-leave-graveyard`: "one or more cards leave your graveyard" (CR 400.7: a card that changes zones becomes a new object; a card that leaves a
 * graveyard for any other zone leaves it; CR 603.2c: the ability triggers once however many cards left together). The engine's `leftGraveyard`; a kind of card
 * ("one or more creature cards") is a filter on the card as it was in the graveyard. Not read: a number, the graveyard of another player, "a card leaves", the cards that go
 * to a zone, a card of two kinds.
 */
export const TRIGGER_CARDS_LEAVE_GRAVEYARD = defineRule<IrTrigger>({
  id: 'trigger.cards-leave-graveyard',
  family: 'trigger',
  leading: ['one'],
  cites: ['CR 400.7 (Zones)', 'CR 603.2c (Handling Triggered Abilities)', 'CR 404.1 (Graveyard)'],
  examples: [
    'one or more cards leave your graveyard',
    'one or more creature cards leave your graveyard',
    'one or more nonland cards leave your graveyard',
    'one or more artifact and/or creature cards leave your graveyard',
    'one or more creature and/or land cards leave your graveyard',
  ],
  rejects: [
    'one or more cards leave a graveyard',
    "one or more cards leave an opponent's graveyard",
    'one or more cards leaves your graveyard',
    'one or more land or creature cards leave your graveyard',
    'one or more artifact and/or artifact cards leave your graveyard',
    'one or more nonartifact and/or creature cards leave your graveyard',
    'one or more artifact and/or creature and/or land cards leave your graveyard',
    'one or more artifact and/or creature cards leaves your graveyard',
    'one or more creature cards leaves your graveyard',
    'two or more cards leave your graveyard',
    'one card leaves your graveyard',
    'one or more cards leave your graveyard and',
    'one or more cards leave your hand',
    'one or more cards are put into your graveyard',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      new RegExp(
        `one or more (?:(non)?(${CARD_KINDS})(?: and/or (${CARD_KINDS}))? )?cards leave your graveyard(?![\\p{L}\\p{N}])(?!\\s+and)`,
        'iu',
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, non, kind, other] = r.value;
    // "artifact and/or creature cards" (CR 608.2c: either kind): two different kinds, neither negated; the engine's `anyOf` of one card type each.
    if (other !== undefined && (non !== undefined || other.toLowerCase() === kind?.toLowerCase())) {
      return fail(ctx, pos);
    }
    const filter =
      other === undefined || kind === undefined
        ? cardFilter(undefined, non, kind)
        : {
            anyOf: [kind, other].map((k): IrFilter => ({ types: [k.toLowerCase()], raw: k })),
            raw: `${kind} and/or ${other} card`,
          };
    if (filter === null) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const value = plain('trigger.cards-leave-graveyard', 'leftGraveyard', pos, r.pos);
    return {
      ok: true,
      value:
        kind === undefined
          ? value
          : {
              ...value,
              subject: {
                ...makeNoun('trigger.cards-leave-graveyard', span, 'a', filter),
                plural: true,
              },
            },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.cards-exiled-library-graveyard`: "one or more cards are put into exile from your library and/or your graveyard" (CR 400.7, 603.2c). The engine's
 * `exiledFromLibraryOrGraveyard`. Not read: another player's zones, another zone, a number, one of the two zones alone (a different ability).
 */
export const TRIGGER_CARDS_EXILED_LIBRARY_GRAVEYARD = defineRule<IrTrigger>({
  id: 'trigger.cards-exiled-library-graveyard',
  family: 'trigger',
  leading: ['one'],
  cites: ['CR 400.7 (Zones)', 'CR 603.2c (Handling Triggered Abilities)', 'CR 406.1 (Exile)'],
  examples: ['one or more cards are put into exile from your library and/or your graveyard'],
  rejects: [
    'one or more cards are put into exile from your library',
    'one or more cards are put into exile from your graveyard',
    'one or more cards are put into exile from your library or your graveyard',
    'one or more cards are put into exile from a library and/or a graveyard',
    "one or more cards are put into exile from your opponents' libraries and/or graveyards",
    'one or more cards is put into exile from your library and/or your graveyard',
    'two or more cards are put into exile from your library and/or your graveyard',
    'one or more cards are put into exile from your library and/or your graveyard and',
    'one or more cards are put into exile from your hand and/or your graveyard',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /one or more cards are put into exile from your library and\/or your graveyard(?![\p{L}\p{N}])(?!\s+and)/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    return {
      ok: true,
      value: plain(
        'trigger.cards-exiled-library-graveyard',
        'exiledFromLibraryOrGraveyard',
        pos,
        r.pos,
      ),
      pos: r.pos,
    };
  },
});

const ORDINALS: Readonly<Record<string, number>> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
};

/**
 * `trigger.cast-nth`: "an opponent casts their second spell each turn", "you cast your second spell each turn" (CR 601.2i, 603.2: the ability triggers as the
 * caster casts the spell that is their nth of the turn). The engine's `castSpell` with `nth`. "During each opponent's turn" also checks the active player. Not read: a kind of spell, a
 * number the text spells with digits, another player, a missing "each turn".
 */
export const TRIGGER_CAST_NTH = defineRule<IrTrigger>({
  id: 'trigger.cast-nth',
  family: 'trigger',
  leading: ['you', 'an', 'a'],
  cites: [
    'CR 601.2i (Casting Spells)',
    'CR 603.2 (Handling Triggered Abilities)',
    'CR 112.1 (Spells)',
  ],
  examples: [
    'an opponent casts their second spell each turn',
    'you cast your second spell each turn',
    'a player casts their third spell each turn',
    "you cast your first spell during each opponent's turn",
    // "Your first spell each turn" is the caster's first spell of the turn (the engine's nth of 1).
    'you cast your first spell each turn',
    // Mind's Dilation (Grand Larceny deck, group B): the same count for another caster, each one's own first spell.
    'an opponent casts their first spell each turn',
    'a player casts their first spell each turn',
  ],
  rejects: [
    "an opponent casts their first spell during each opponent's turn",
    'an opponent casts their second spell',
    'an opponent casts their second creature spell each turn',
    'an opponent casts your second spell each turn',
    'you cast their second spell each turn',
    'an opponent casts their 2nd spell each turn',
    'an opponent casts a second spell each turn',
    'an opponent cast their second spell each turn',
    'an opponent casts their second spell each turn and',
    'you cast your second spells each turn',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.cast-nth';
    const who = choice(
      map(spanned(literal('you cast your ')), ({ span }) =>
        makeNoun(id, { start: span.start, end: span.start + 3 }, 'you', { raw: 'you' }),
      ),
      map(spanned(literal('an opponent casts their ')), ({ span }) =>
        makeNoun(id, { start: span.start, end: span.start + 11 }, 'eachOpponent', {
          raw: 'an opponent',
        }),
      ),
      map(spanned(literal('a player casts their ')), ({ span }) =>
        makeNoun(id, { start: span.start, end: span.start + 8 }, 'eachPlayer', { raw: 'a player' }),
      ),
    );
    const r = sequence(
      who,
      pattern(/(first|second|third|fourth) /iu),
      spanned(map(spellPhrase(), withoutZone)),
      choice(
        map(
          pattern(/ during each opponent's turn(?![\p{L}\p{N}])(?!\s+and)/iu),
          () => 'opponent' as const,
        ),
        map(pattern(/ each turn(?![\p{L}\p{N}])(?!\s+and)/iu), () => undefined),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [actor, ordinal, spell, duringTurn] = r.value;
    const filter: IrFilter = spell.value;
    // A kind of spell ("creature spell") is another trigger; only a plain "spell" is counted here.
    if (Object.keys(filter).some((k) => k !== 'raw' && k !== 'zone' && k !== 'stackKind')) {
      return fail(ctx, pos);
    }
    const n = ORDINALS[(ordinal[1] ?? '').toLowerCase()];
    if (n === undefined) return fail(ctx, pos);
    // "During each opponent's turn" is read for the controller's own first spell only (the engine's `duringTurn: 'opponent'` goes with `by: 'you'` and `nth: 1`).
    if (duringTurn !== undefined && !(n === 1 && actor.det === 'you')) return fail(ctx, pos);
    const subject = makeNoun(id, spell.span, 'a', filter);
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'cast',
        subject,
        actor,
        nth: n,
        ...(duringTurn === undefined ? {} : { duringTurn }),
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.enters-one-or-more-creatures`: "one or more creatures you control with mana value 3 or less enter" (CR 603.2c, 603.6a: creatures that enter together are
 * one event for the ability; "other" leaves out the permanent with the ability, Twilight Diviner). The engine's `entersBatch`, as `trigger.enters-one-or-more` has it for tokens. Not read: a number, "enters", a controller other than
 * "you", more than one group of types, a group that is not creatures, artifacts or one creature type.
 */
export const TRIGGER_ENTERS_ONE_OR_MORE_CREATURES = defineRule<IrTrigger>({
  id: 'trigger.enters-one-or-more-creatures',
  family: 'trigger',
  leading: ['one'],
  cites: [
    'CR 603.2c (Handling Triggered Abilities)',
    'CR 603.6a (Handling Triggered Abilities)',
    'CR 202.3 (Mana Value)',
  ],
  examples: [
    'one or more creatures you control with mana value 3 or less enter',
    'one or more creatures you control enter',
    'one or more nontoken creatures you control enter',
    'one or more other creatures you control enter',
    // Food and Fellowship deck, group B (Merry): a group of artifacts is one event for the ability just as a group of creatures is.
    'one or more artifacts you control enter',
    'one or more nontoken artifacts you control enter',
    // Elvish Warmaster (CR 205.3m): a creature type.
    'one or more other Elves you control enter',
    'one or more Elves you control enter',
  ],
  rejects: [
    'one or more other creatures you control enters',
    'one or more other creatures enter',
    'one or more creatures you control with mana value 3 or less enters',
    'one or more creatures with mana value 3 or less enter',
    'one or more creatures your opponents control enter',
    'one or more creatures you control enter tapped',
    'one or more creatures you control enter or',
    'one or more lands you control enter',
    'one or more artifact creatures you control and lands enter',
    'one or more artifacts your opponents control enter',
    'one or more Elves enter',
    'one or more Elves your opponents control enter',
    'one or more Elves you control enters',
    'one or more Elves and Goblins you control enter',
    'two or more creatures you control enter',
    'one or more creatures you control with mana value 3 or less enter and',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.enters-one-or-more-creatures';
    const r = sequence(
      literal('one or more '),
      optional(literal('other '), null),
      spanned(map(permanentPhrase(true, 'all'), withoutZone)),
      pattern(/ enter(?![\p{L}\p{N}])(?!\s+(?:tapped|untapped|or|and)(?![\p{L}\p{N}]))/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, other, phrase] = r.value;
    const filter: IrFilter = phrase.value;
    // Elvish Warmaster (CR 205.3m): "one or more other Elves you control enter", one creature type with no card type of its own.
    const creatureType =
      (filter.types === undefined || filter.types.length === 0) &&
      filter.subtypes?.length === 1 &&
      filter.notTypes === undefined;
    const creatures =
      filter.anyOf === undefined &&
      (creatureType ||
        (filter.types?.length === 1 &&
          (filter.types[0] === 'creature' || filter.types[0] === 'artifact')));
    if (!creatures || filter.controller !== 'you') return fail(ctx, pos);
    const subject: IrNoun = {
      ...makeNoun(id, phrase.span, 'a', filter),
      plural: true,
      ...(other === null ? {} : { other: true }),
    };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'entersBatch',
        subject,
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

/**
 * `trigger.you-create-tokens`: "you create one or more creature tokens" (CR 111.1, 701.7a: to create a token is to put it onto the battlefield, so the
 * creature tokens that enter under your control together are created together, CR 603.2c). The engine's `entersBatch` over the creature tokens you control, as
 * `trigger.enters-one-or-more` reads "one or more creature tokens you control enter". Not read: another player's tokens, a number, one token, "or copy".
 */
export const TRIGGER_YOU_CREATE_TOKENS = defineRule<IrTrigger>({
  id: 'trigger.you-create-tokens',
  family: 'trigger',
  leading: ['you'],
  cites: ['CR 111.1 (Tokens)', 'CR 701.7a (Create)', 'CR 603.2c (Handling Triggered Abilities)'],
  examples: ['you create one or more creature tokens', 'you create one or more tokens'],
  rejects: [
    'an opponent creates one or more creature tokens',
    'you create two or more creature tokens',
    'you create a creature token',
    'you create one or more creature tokens or',
    'you create one or more artifact tokens',
    'you create one or more creature tokens and',
    'you create one or more Treasure tokens',
    'you create one or more',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.you-create-tokens';
    const r = pattern(
      /you create one or more (creature )?tokens(?![\p{L}\p{N}])(?!\s+(?:or|and)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const creature = /creature/i.test(ctx.text.slice(pos, r.pos));
    const filter: IrFilter = {
      ...(creature ? { types: ['creature'] } : {}),
      token: true,
      controller: 'you',
      raw: ctx.text.slice(pos + 'you create '.length, r.pos),
    };
    const subject: IrNoun = {
      ...makeNoun(id, { start: pos + 'you create '.length, end: r.pos }, 'a', filter),
      plural: true,
    };
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'entersBatch',
        subject,
        args: {},
        span: { start: pos, end: r.pos },
        rule: id,
      },
      pos: r.pos,
    };
  },
});

export const HOFRI_TRIGGER_RULES = [
  TRIGGER_CARDS_LEAVE_GRAVEYARD,
  TRIGGER_CARDS_EXILED_LIBRARY_GRAVEYARD,
  TRIGGER_CAST_NTH,
  TRIGGER_ENTERS_ONE_OR_MORE_CREATURES,
  TRIGGER_YOU_CREATE_TOKENS,
].map(quietly);
