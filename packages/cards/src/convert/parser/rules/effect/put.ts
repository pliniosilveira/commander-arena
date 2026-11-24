/**
 * `effect.put-library`: "put ~ on top of its owner's library", "put target creature card from your
 * graveyard on top of your library", "put target card from a graveyard on top of its owner's
 * library" (CR 401.1: a card put into a library goes to its owner's library, CR 401.3: on top or
 * on the bottom when the effect says so). A card from a graveyard goes to its owner's library
 * (CR 404.1, 400.3), so "your library" is read only for a card of your own graveyard; a permanent
 * goes to its owner's. The same phrases that return a card to a hand, for a library.
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
import type {
  IrAmount,
  IrArg,
  IrFilter,
  IrFlag,
  IrNoun,
  IrNounList,
  IrZoneSpec,
} from '../../ir/types';
import { PERMANENT_CARD_TYPES, PERMANENT_TYPES, typeWords } from '../noun/phrases';
import { OTHER_SUBTYPES, SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, family, spanned } from '../registry';
import {
  type Clauses,
  GRAVEYARD_OPERANDS,
  operands,
  PERMANENT_OPERANDS,
  type Restriction,
  single,
  UNDER_CONTROL,
} from './operands';

const RULE = 'effect.put-library';

/** " on top of" and " on the bottom of": where in the library (CR 401.3). */
const POSITION: Parser<'top' | 'bottom'> = choice(
  map(literal(' on top of '), () => 'top' as const),
  map(literal(' on the bottom of '), () => 'bottom' as const),
);

const OWNERS_LIBRARY = pattern(/(?:its|their) owner['’]s library/i);

/** A card put into "your library" must come from your own graveyard (CR 400.3). */
const OWN_GRAVEYARD_ONLY: Restriction = {
  accept: (noun) => noun.filter.controller === 'you',
  locate: (noun, text) => text.indexOf(' from ', noun.span.start),
};

interface Put {
  readonly objects: IrNoun | IrNounList;
  readonly to: IrZoneSpec;
}

function zone(
  position: 'top' | 'bottom',
  whose: 'you' | 'owner',
  span: IrZoneSpec['span'],
): IrZoneSpec {
  return { kind: 'zoneSpec', zone: 'library', position, whose, span, rule: RULE };
}

const PUT_LIBRARY: Parser<Put> = choice(
  // A permanent, or ~, or "it" (the card a permanent became when the trigger is about its own death, CR 400.7) to its owner's library.
  map(
    sequence(
      literal('put '),
      operands(['noun.self', 'noun.it', ...PERMANENT_OPERANDS], RULE),
      spanned(sequence(POSITION, OWNERS_LIBRARY)),
    ),
    ([, objects, where]): Put => ({
      objects,
      to: zone(where.value[0], 'owner', where.span),
    }),
  ),
  // A card from your own graveyard, to your library.
  map(
    sequence(
      literal('put '),
      operands(GRAVEYARD_OPERANDS, RULE, OWN_GRAVEYARD_ONLY),
      spanned(sequence(POSITION, literal('your library'))),
    ),
    ([, objects, where]): Put => ({
      objects,
      to: zone(where.value[0], 'you', where.span),
    }),
  ),
  // A card from any graveyard, to its owner's library.
  map(
    sequence(
      literal('put '),
      operands(GRAVEYARD_OPERANDS, RULE),
      spanned(sequence(POSITION, OWNERS_LIBRARY)),
    ),
    ([, objects, where]): Put => ({
      objects,
      to: zone(where.value[0], 'owner', where.span),
    }),
  ),
);

export const EFFECT_PUT_LIBRARY = defineRule<Clauses>({
  id: RULE,
  family: 'effect',
  leading: ['put'],
  cites: ['CR 401.1 (Library)', 'CR 401.3 (Library)', 'CR 400.3 (General)', 'CR 404.1 (Graveyard)'],
  examples: [
    "put ~ on top of its owner's library",
    "put ~ on the bottom of its owner's library",
    "put it on the bottom of its owner's library",
    "put it on top of its owner's library",
    "put target creature on top of its owner's library",
    'put target creature card from your graveyard on top of your library',
    'put target artifact card from your graveyard on top of your library',
    "put target card from a graveyard on top of its owner's library",
    "put target creature card from an opponent's graveyard on the bottom of its owner's library",
  ],
  rejects: [
    'put ~ on top of your library',
    'put it on the bottom of your library',
    "put it on the bottom of its owner's library and draw a card",
    'put target creature on top of your library',
    'put target card from a graveyard on top of your library',
    "put target creature card from an opponent's graveyard on top of your library",
    'put target creature card from your graveyard on top of its owner’s library and draw a card',
    'put ~ into its owner’s library',
    "put ~ on top of its owner's library third from the top",
    'put target creature card from your graveyard on top of the library',
    'put a +1/+1 counter on ~',
  ],
  parse: single(RULE, PUT_LIBRARY, ({ objects, to }) => ({
    verb: 'putLibrary',
    args: { objects, to },
  })),
});

const BATTLEFIELD_RULE = 'effect.put-battlefield';

/** " onto the battlefield", then "tapped" and the control when the text says them, in that order. */
const ONTO_THE_BATTLEFIELD: Parser<IrZoneSpec> = map(
  spanned(
    sequence(
      literal(' onto the battlefield'),
      optional(literal(' tapped'), null),
      optional(UNDER_CONTROL, null),
    ),
  ),
  ({ value: [, tapped, whose], span }): IrZoneSpec => ({
    kind: 'zoneSpec',
    zone: 'battlefield',
    ...(tapped === null ? {} : { tapped: true }),
    ...(whose === null ? {} : { whose }),
    span,
    rule: BATTLEFIELD_RULE,
  }),
);

/**
 * `effect.put-battlefield`: "Put target creature card from a graveyard onto the battlefield under
 * your control." (CR 400.7: the card is a new object; CR 110.2a: it enters under the control of the
 * player performing the effect unless the text says otherwise). The same instruction as "return
 * target creature card from a graveyard to the battlefield", which the engine runs as a move to the
 * battlefield, so it reads to the same `return` clause. Only a card of a graveyard: a card put onto
 * the battlefield from a hand or a library, or "it", is another gap.
 */
export const EFFECT_PUT_BATTLEFIELD = defineRule<Clauses>({
  id: BATTLEFIELD_RULE,
  family: 'effect',
  leading: ['put'],
  cites: ['CR 400.7 (General)', 'CR 110.2a (Permanents)', 'CR 404.1 (Graveyard)'],
  examples: [
    'put target creature card from a graveyard onto the battlefield under your control',
    'put target creature card from your graveyard onto the battlefield',
    'put target creature card from a graveyard onto the battlefield tapped under your control',
    "put target creature card from an opponent's graveyard onto the battlefield under your control",
    // Aberrant Return (CR 115.1, 601.2c): one, two or three cards of any graveyards.
    'put one, two, or three target creature cards from graveyards onto the battlefield under your control',
    "put target creature card from a graveyard onto the battlefield under its owner's control",
    'put all creature cards from your graveyard onto the battlefield',
  ],
  rejects: [
    'put target creature card from a graveyard onto the battlefield under his control',
    'put target creature card from a graveyard onto the battlefield under your control tapped',
    'put target creature card from a graveyard onto the battlefield at the beginning of the next end step',
    'put target creature card from a graveyard into your hand',
    'put target creature onto the battlefield',
    'put a creature card from your hand onto the battlefield',
    'put it onto the battlefield under your control',
    'put target creature card from a graveyard onto the battlefield with a +1/+1 counter on it',
  ],
  parse: single(
    BATTLEFIELD_RULE,
    map(
      sequence(
        literal('put '),
        operands(GRAVEYARD_OPERANDS, BATTLEFIELD_RULE),
        ONTO_THE_BATTLEFIELD,
      ),
      ([, objects, to]) => ({ objects, to }),
    ),
    ({ objects, to }) => ({ verb: 'return', args: { objects, to } }),
  ),
});

const FROM_HAND_RULE = 'effect.put-from-hand';
/** Stands for "permanent" among the words read before the filter is built. */
const PERMANENT_MARK = 'permanent';

/**
 * `effect.put-from-hand`: "You may put an artifact card from your hand onto the battlefield.", "put a creature card from your hand onto
 * the battlefield tapped", "you may put a land card from your graveyard onto the battlefield" (stage P31, D-140, CR 400.7, 110.2a: the
 * card enters under the control of the player who puts it; CR 608.2d: the player chooses the card as the instruction runs). A permanent
 * card of the player's own hand or graveyard, chosen, not targeted; with "you may" the player may choose none (the words are read here,
 * so an activated ability's text has them too).
 */
export const EFFECT_PUT_FROM_HAND = defineRule<Clauses>({
  id: FROM_HAND_RULE,
  family: 'effect',
  leading: ['you', 'put'],
  cites: [
    'CR 400.7 (General)',
    'CR 110.2a (Permanents)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'you may put an artifact card from your hand onto the battlefield',
    'put a creature card from your hand onto the battlefield',
    'you may put a land card from your hand onto the battlefield tapped',
    'you may put a creature card from your graveyard onto the battlefield',
    'you may put a permanent card from your hand onto the battlefield',
    'you may put a Dragon creature card from your hand onto the battlefield',
    // Issue 103 (Broodcaller Scourge): the limit is the damage of the trigger.
    'you may put a permanent card with mana value less than or equal to that damage from your hand onto the battlefield',
    // Stage P34 (D-152, CR 508.4): it enters attacking.
    'you may put a Dragon creature card from your hand onto the battlefield tapped and attacking',
    // D-544: a card of the hand or of the graveyard.
    'you may put a land card from your hand or graveyard onto the battlefield',
    'put a creature card from your hand or graveyard onto the battlefield tapped',
    // CR 107.3a, 202.3: the mana value limit is the X of the spell.
    'you may put a permanent card with mana value X or less from your hand onto the battlefield tapped',
    'you may put a creature card with mana value X or less from your hand onto the battlefield',
    // Issue 103 (Selvala's Stampede, CR 701.38b): up to one card for each vote for an option.
    'you may put a permanent card from your hand onto the battlefield for each free vote',
    // Federation Fleet deck, group E (Unification): a card of an artifact-only subtype.
    'you may put a Spacecraft card from your hand or graveyard onto the battlefield',
    'you may put a Vehicle card from your hand onto the battlefield',
    // Terrain Generator (CR 205.4): the supertype basic.
    'you may put a basic land card from your hand onto the battlefield tapped',
  ],
  rejects: [
    'you may put a basic card from your hand onto the battlefield',
    'you may put a basic Forest creature card from your hand onto the battlefield',
    'you may put an artifact card from your hand onto the battlefield under your control',
    'you may put an artifact from your hand onto the battlefield',
    'you may put two artifact cards from your hand onto the battlefield',
    "you may put an artifact card from an opponent's hand onto the battlefield",
    'you may put an instant card from your hand onto the battlefield',
    'you may put an artifact card from your library onto the battlefield',
    'you may put target artifact card from your graveyard onto the battlefield',
    'you may put a creature card from your hand onto the battlefield attacking',
    'you may put a creature card from your hand onto the battlefield tapped and attacking and draw a card',
    'you may put a land card from your graveyard or hand onto the battlefield',
    'you may put a land card from your hand or library onto the battlefield',
    'you may put a land card from your hand or your graveyard onto the battlefield',
    'you may put a land card from your hand or graveyard into your hand',
    'you may put a land card from your hand or graveyard onto the battlefield and draw a card',
    'you may put a permanent card with mana value 3 or less from your hand onto the battlefield',
    'you may put a permanent card with mana value x from your hand onto the battlefield',
    'you may put a permanent card with mana value x or more from your hand onto the battlefield',
    'you may put a permanent card with mana value y or less from your hand onto the battlefield',
    'you may put a permanent card with mana value less than or equal to that much from your hand onto the battlefield',
    'you may put a permanent card with mana value less than or equal to that damage from your library onto the battlefield',
    'you may put a permanent card from your hand onto the battlefield for each vote',
    'you may put a permanent card from your hand onto the battlefield for each free votes',
    'you may put a Dragon card from your hand onto the battlefield',
    'you may put a Spacecraft Dragon card from your hand onto the battlefield',
    'you may put a card from your hand onto the battlefield',
  ],
  parse: single(
    FROM_HAND_RULE,
    (ctx, pos) => {
      // Quiet up to the card words: a line that starts "You may ..." or "Put ..." and is something else stops where it always did.
      const r = sequence(
        quiet(
          sequence(
            optional(literal('you may '), null),
            literal('put '),
            spanned(
              sequence(
                pattern(/an? /i),
                // CR 205.4 (Supertypes): "a basic land card" (Terrain Generator), the supertype basic.
                optional(literal('basic '), null),
                many(
                  map(
                    sequence(
                      satisfy(SUBTYPE_WORD_NUMBERED, (w) => w.plural !== true),
                      literal(' '),
                    ),
                    ([w]) => w.subtype,
                  ),
                ),
                choice(
                  map(pattern(/permanent(?![\p{L}\p{N}])/iu), (): string[] => [PERMANENT_MARK]),
                  typeWords(PERMANENT_TYPES, false),
                  // Federation Fleet deck, group E (Unification): "a Spacecraft card", a card named by one of the artifact-only subtypes alone (never a creature type: "a Dragon card").
                  map(pattern(/(?=card(?![\p{L}\p{N}]))/u), (): string[] => []),
                ),
                // The space before "card" is the one the subtype words read when there is no type word ("a Spacecraft card").
                choice(
                  literal(' card'),
                  map(pattern(/card(?![\p{L}\p{N}])/u), () => 'card'),
                ),
                // CR 107.3a, 202.3: "with mana value X or less", the X of the spell (Mind into Matter); read as the effect resolves.
                // Issue 103 (CR 202.3, 603.2c): "with mana value less than or equal to that damage", the damage the trigger event carries (`true`).
                optional(
                  choice<IrArg | true>(
                    map(
                      sequence(
                        literal(' with mana value '),
                        family<IrArg>('amount', { only: ['amount.x'] }),
                        literal(' or less'),
                      ),
                      ([, x]): IrArg | true => x,
                    ),
                    map(
                      pattern(
                        / with mana value less than or equal to that damage(?![\p{L}\p{N}])/iu,
                      ),
                      () => true as const,
                    ),
                  ),
                  null,
                ),
                literal(' from your '),
                choice(
                  // D-544 (Galadriel deck, group 2): "from your hand or graveyard", the cards of both places together.
                  map(literal('hand or graveyard'), () => 'handOrGraveyard' as const),
                  map(literal('hand'), () => 'hand' as const),
                  map(literal('graveyard'), () => 'graveyard' as const),
                ),
              ),
            ),
            spanned(literal(' onto the battlefield')),
          ),
        ),
        spanned(optional(choice(literal(' tapped and attacking'), literal(' tapped')), null)),
        // Issue 103 (CR 701.38b, 608.2c): "... onto the battlefield for each free vote", up to that many cards (Selvala's Stampede).
        optional(
          map(
            sequence(literal(' '), family<IrAmount>('amount', { only: ['amount.for-each-vote'] })),
            ([, votes]) => votes,
          ),
          null,
        ),
      )(ctx, pos);
      if (!r.ok) return r;
      const [[may, , card, onto], tapped, votes] = r.value;
      const where = {
        value: [null, tapped.value] as const,
        span: { start: onto.span.start, end: tapped.span.end },
      };
      const [, basic, subtypes, typeWordsRead, , limit, , zone] = card.value;
      // No type word: only the subtypes that belong to no creature ("a Spacecraft card"); otherwise the card words stop where they did before.
      if (
        typeWordsRead.length === 0 &&
        !(subtypes.length > 0 && subtypes.every((name) => OTHER_SUBTYPES.has(name)))
      ) {
        return fail(ctx, pos);
      }
      // "a permanent card" (CR 110.1, 400.1): a card of any permanent type, never an instant or a sorcery.
      const anyPermanent = typeWordsRead.includes(PERMANENT_MARK);
      const atMostX = limit === true || limit === null ? null : limit;
      const types = anyPermanent ? [] : typeWordsRead;
      const objects: IrNoun = {
        kind: 'noun',
        det: 'a',
        filter: {
          zone: zone === 'handOrGraveyard' ? 'hand' : zone,
          ...(anyPermanent
            ? {
                anyOf: PERMANENT_CARD_TYPES.map((t): IrFilter => ({ types: [t], raw: t })),
              }
            : {}),
          ...(types.length > 0 ? { types } : {}),
          ...(subtypes.length > 0 ? { subtypes } : {}),
          ...(basic === null ? {} : { supertypes: ['basic'] }),
          ...(anyPermanent
            ? {
                anyOf: PERMANENT_CARD_TYPES.map((t): IrFilter => ({ types: [t], raw: t })),
              }
            : {}),
          controller: 'you',
          card: true,
          ...(limit !== true
            ? {}
            : {
                manaValueAtMostAmount: {
                  kind: 'triggerDamage' as const,
                  span: card.span,
                },
              }),
          raw: ctx.text.slice(card.span.start, card.span.end),
        },
        upTo: false,
        plural: false,
        other: false,
        span: card.span,
        rule: FROM_HAND_RULE,
      };
      const to: IrZoneSpec = {
        kind: 'zoneSpec',
        zone: 'battlefield',
        ...(where.value[1] === null ? {} : { tapped: true }),
        ...(where.value[1]?.toLowerCase() === ' tapped and attacking'
          ? { attacking: true as const }
          : {}),
        span: where.span,
        rule: FROM_HAND_RULE,
      };
      const flag: IrFlag = {
        kind: 'flag',
        value: may !== null,
        span: { start: pos, end: pos },
        rule: FROM_HAND_RULE,
      };
      const both: IrFlag = {
        kind: 'flag',
        value: zone === 'handOrGraveyard',
        span: { start: pos, end: pos },
        rule: FROM_HAND_RULE,
      };
      return { ok: true, value: { objects, to, may: flag, both, votes, atMostX }, pos: r.pos };
    },
    ({ objects, to, may, both, votes, atMostX }) => ({
      verb: 'putFromZone',
      args: {
        objects,
        to,
        may,
        ...(both.value ? { alsoGraveyard: both } : {}),
        ...(atMostX === null ? {} : { manaValueAtMost: atMostX }),
        ...(votes === null ? {} : { count: votes }),
      },
    }),
  ),
});

const UP_TO_X_RULE = 'effect.put-up-to-x-from-hand-graveyard';

/**
 * `effect.put-up-to-x-from-hand-graveyard`: "put up to X land cards from your hand and/or graveyard onto the battlefield tapped" (Worldsoul's Rage; CR 608.2d, 110.2a, 107.3a: the X
 * of the spell; the player chooses up to that many cards of the kind among the cards of their hand and of their graveyard together, "and/or" letting them take from either or both).
 * The same engine choice as `effect.put-from-hand` with both places (`alsoGraveyard`), for up to X cards. Not read: a number instead of X (another amount), "or" (that is one card),
 * another place, the library, "you may" (the words already say "up to"), an instant or a sorcery.
 */
export const EFFECT_PUT_UP_TO_X_FROM_HAND_GRAVEYARD = defineRule<Clauses>({
  id: UP_TO_X_RULE,
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 608.2d (Resolving Spells and Abilities)',
    'CR 110.2a (Permanents)',
    'CR 107.3a (Numbers and Symbols)',
  ],
  examples: [
    'put up to X land cards from your hand and/or graveyard onto the battlefield tapped',
    'put up to X creature cards from your hand and/or graveyard onto the battlefield',
  ],
  rejects: [
    'put up to two land cards from your hand and/or graveyard onto the battlefield tapped',
    'put up to X land cards from your hand or graveyard onto the battlefield tapped',
    'put up to X land cards from your hand onto the battlefield tapped',
    'put up to X land cards from your graveyard and/or library onto the battlefield tapped',
    'put up to X instant cards from your hand and/or graveyard onto the battlefield',
    'put up to X land cards from your hand and/or graveyard onto the battlefield under your control',
    'you may put up to X land cards from your hand and/or graveyard onto the battlefield tapped',
    'put up to X lands from your hand and/or graveyard onto the battlefield tapped',
  ],
  parse: single(
    UP_TO_X_RULE,
    (ctx, pos) => {
      const r = sequence(
        literal('put up to '),
        family<IrAmount>('amount', { only: ['amount.x'] }),
        literal(' '),
        spanned(typeWords(PERMANENT_TYPES, false)),
        literal(' cards from your hand and/or graveyard '),
        spanned(sequence(literal('onto the battlefield'), optional(literal(' tapped'), null))),
      )(ctx, pos);
      if (!r.ok) return r;
      const [, count, , kind, , onto] = r.value;
      const noun: IrNoun = {
        kind: 'noun',
        det: 'a',
        filter: {
          zone: 'hand',
          types: kind.value,
          controller: 'you',
          card: true,
          raw: ctx.text.slice(kind.span.start, kind.span.end),
        },
        upTo: true,
        plural: true,
        other: false,
        count,
        span: kind.span,
        rule: UP_TO_X_RULE,
      };
      const to: IrZoneSpec = {
        kind: 'zoneSpec',
        zone: 'battlefield',
        ...(onto.value[1] === null ? {} : { tapped: true }),
        span: onto.span,
        rule: UP_TO_X_RULE,
      };
      const flag = (value: boolean): IrFlag => ({
        kind: 'flag',
        value,
        span: { start: pos, end: pos },
        rule: UP_TO_X_RULE,
      });
      return {
        ok: true,
        value: { noun, to, may: flag(true), both: flag(true), count },
        pos: r.pos,
      };
    },
    ({ noun, to, may, both, count }) => ({
      verb: 'putFromZone',
      args: { objects: noun, to, may, alsoGraveyard: both, count },
    }),
  ),
});

export const PUT_RULES = [
  EFFECT_PUT_LIBRARY,
  EFFECT_PUT_BATTLEFIELD,
  EFFECT_PUT_FROM_HAND,
  EFFECT_PUT_UP_TO_X_FROM_HAND_GRAVEYARD,
];
