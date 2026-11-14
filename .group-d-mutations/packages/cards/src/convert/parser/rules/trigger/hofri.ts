/**
 * Trigger rules of the Hofri Ghostforge deck (stage P68, D-229): "Whenever one or more cards leave your graveyard" (CR 400.7, 603.2c), "Whenever one or more
 * cards are put into exile from your library and/or your graveyard", "an opponent casts their second spell each turn" (CR 601.2i), "one or more creatures
 * you control with mana value 3 or less enter" (CR 603.2c, 603.6a) and "you create one or more creature tokens" (CR 111.1, 701.7a: a token is created as it
 * enters the battlefield).
 */
import { choice, fail, literal, map, pattern, sequence } from '../../combinators';
import type { IrFilter, IrNoun, IrTrigger } from '../../ir/types';
import { permanentPhrase, spellPhrase, withoutZone } from '../noun/phrases';
import { defineRule, quietly, spanned } from '../registry';
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
 * graveyard for any other zone leaves it; CR 603.2c: the ability triggers once however many cards left together). The engine's `leftGraveyard`. Not read: a
 * number, the graveyard of another player, "a card leaves", the cards that go to a zone.
 */
export const TRIGGER_CARDS_LEAVE_GRAVEYARD = defineRule<IrTrigger>({
  id: 'trigger.cards-leave-graveyard',
  family: 'trigger',
  leading: ['one'],
  cites: ['CR 400.7 (Zones)', 'CR 603.2c (Handling Triggered Abilities)', 'CR 404.1 (Graveyard)'],
  examples: ['one or more cards leave your graveyard'],
  rejects: [
    'one or more cards leave a graveyard',
    "one or more cards leave an opponent's graveyard",
    'one or more cards leaves your graveyard',
    'one or more creature cards leave your graveyard',
    'two or more cards leave your graveyard',
    'one card leaves your graveyard',
    'one or more cards leave your graveyard and',
    'one or more cards leave your hand',
    'one or more cards are put into your graveyard',
  ],
  parse: (ctx, pos) => {
    const r = pattern(/one or more cards leave your graveyard(?![\p{L}\p{N}])(?!\s+and)/iu)(
      ctx,
      pos,
    );
    if (!r.ok) return r;
    return {
      ok: true,
      value: plain('trigger.cards-leave-graveyard', 'leftGraveyard', pos, r.pos),
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

const ORDINALS: Readonly<Record<string, number>> = { second: 2, third: 3, fourth: 4 };

/**
 * `trigger.cast-nth`: "an opponent casts their second spell each turn", "you cast your second spell each turn" (CR 601.2i, 603.2: the ability triggers as the
 * caster casts the spell that is their nth of the turn). The engine's `castSpell` with `nth`. "First" is not read here: a different count (the engine would
 * need to tell a first spell from a spell cast with nothing before it, which `nth: 1` does, but no card of the corpus asks yet). Not read: a kind of spell, a
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
  ],
  rejects: [
    'an opponent casts their first spell each turn',
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
      pattern(/(second|third|fourth) /iu),
      spanned(map(spellPhrase(), withoutZone)),
      pattern(/ each turn(?![\p{L}\p{N}])(?!\s+and)/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [actor, ordinal, spell] = r.value;
    const filter: IrFilter = spell.value;
    // A kind of spell ("creature spell") is another trigger; only a plain "spell" is counted here.
    if (Object.keys(filter).some((k) => k !== 'raw' && k !== 'zone' && k !== 'stackKind')) {
      return fail(ctx, pos);
    }
    const n = ORDINALS[(ordinal[1] ?? '').toLowerCase()];
    if (n === undefined) return fail(ctx, pos);
    const subject = makeNoun(id, spell.span, 'a', filter);
    return {
      ok: true,
      value: {
        kind: 'trigger',
        event: 'cast',
        subject,
        actor,
        nth: n,
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
 * one event for the ability). The engine's `entersBatch`, as `trigger.enters-one-or-more` has it for tokens. Not read: a number, "enters", a controller other than
 * "you", more than one group of types, a group that is not creatures.
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
  ],
  rejects: [
    'one or more creatures you control with mana value 3 or less enters',
    'one or more creatures with mana value 3 or less enter',
    'one or more creatures your opponents control enter',
    'one or more creatures you control enter tapped',
    'one or more creatures you control enter or',
    'one or more artifacts you control enter',
    'two or more creatures you control enter',
    'one or more creatures you control with mana value 3 or less enter and',
  ],
  parse: (ctx, pos) => {
    const id = 'trigger.enters-one-or-more-creatures';
    const r = sequence(
      literal('one or more '),
      spanned(map(permanentPhrase(true, 'all'), withoutZone)),
      pattern(/ enter(?![\p{L}\p{N}])(?!\s+(?:tapped|untapped|or|and)(?![\p{L}\p{N}]))/iu),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, phrase] = r.value;
    const filter: IrFilter = phrase.value;
    const creatures =
      filter.anyOf === undefined && filter.types?.length === 1 && filter.types[0] === 'creature';
    if (!creatures || filter.controller !== 'you') return fail(ctx, pos);
    const subject: IrNoun = { ...makeNoun(id, phrase.span, 'a', filter), plural: true };
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
