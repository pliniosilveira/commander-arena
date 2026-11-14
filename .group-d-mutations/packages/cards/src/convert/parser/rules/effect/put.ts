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
import type { IrFlag, IrNoun, IrNounList, IrZoneSpec } from '../../ir/types';
import { PERMANENT_TYPES, typeWords } from '../noun/phrases';
import { SUBTYPE_WORD_NUMBERED } from '../noun/subtypes';
import { defineRule, spanned } from '../registry';
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
  // A permanent, or ~, to its owner's library.
  map(
    sequence(
      literal('put '),
      operands(['noun.self', ...PERMANENT_OPERANDS], RULE),
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
    "put target creature on top of its owner's library",
    'put target creature card from your graveyard on top of your library',
    'put target artifact card from your graveyard on top of your library',
    "put target card from a graveyard on top of its owner's library",
    "put target creature card from an opponent's graveyard on the bottom of its owner's library",
  ],
  rejects: [
    'put ~ on top of your library',
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
    // Stage P34 (D-152, CR 508.4): it enters attacking.
    'you may put a Dragon creature card from your hand onto the battlefield tapped and attacking',
  ],
  rejects: [
    'you may put an artifact card from your hand onto the battlefield under your control',
    'you may put an artifact from your hand onto the battlefield',
    'you may put two artifact cards from your hand onto the battlefield',
    "you may put an artifact card from an opponent's hand onto the battlefield",
    'you may put an instant card from your hand onto the battlefield',
    'you may put an artifact card from your library onto the battlefield',
    'you may put target artifact card from your graveyard onto the battlefield',
    'you may put a creature card from your hand onto the battlefield attacking',
    'you may put a creature card from your hand onto the battlefield tapped and attacking and draw a card',
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
                  map(pattern(/permanent(?![\p{L}\p{N}])/iu), (): string[] => []),
                  typeWords(PERMANENT_TYPES, false),
                ),
                literal(' card from your '),
                choice(
                  map(literal('hand'), () => 'hand' as const),
                  map(literal('graveyard'), () => 'graveyard' as const),
                ),
              ),
            ),
            spanned(literal(' onto the battlefield')),
          ),
        ),
        spanned(optional(choice(literal(' tapped and attacking'), literal(' tapped')), null)),
      )(ctx, pos);
      if (!r.ok) return r;
      const [[may, , card, onto], tapped] = r.value;
      const where = {
        value: [null, tapped.value] as const,
        span: { start: onto.span.start, end: tapped.span.end },
      };
      const [, subtypes, types, , zone] = card.value;
      const objects: IrNoun = {
        kind: 'noun',
        det: 'a',
        filter: {
          zone,
          ...(types.length > 0 ? { types } : {}),
          ...(subtypes.length > 0 ? { subtypes } : {}),
          controller: 'you',
          card: true,
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
      return { ok: true, value: { objects, to, may: flag }, pos: r.pos };
    },
    ({ objects, to, may }) => ({ verb: 'putFromZone', args: { objects, to, may } }),
  ),
});

export const PUT_RULES = [EFFECT_PUT_LIBRARY, EFFECT_PUT_BATTLEFIELD, EFFECT_PUT_FROM_HAND];
