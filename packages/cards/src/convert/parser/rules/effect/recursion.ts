/**
 * Effect rules of stage P30 (D-135, D-136): the instructions of the engine's recursion slice that no earlier rule read. A card put
 * into a library "third from the top" (CR 401.7), a permission to cast a card of your graveyard this turn (CR 601.2, 611.2a), and a
 * card that returns itself from your graveyard (CR 113.6b). Each says what the text says; what the engine can run is the lowering's
 * business (`lower/effects.ts`).
 */
import {
  choice,
  fail,
  literal,
  map,
  optional,
  pattern,
  satisfy,
  sequence,
} from '../../combinators';
import type { IrNoun, IrNounList, IrZoneSpec, Span } from '../../ir/types';
import { positiveCount } from '../amount/index';
import { defineRule, family, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, operands, PERMANENT_OPERANDS, single } from './operands';

const ORDINALS: Readonly<Record<string, number>> = {
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

const NOT_IN_WORD = '(?![\\p{L}\\p{N}])';

const PUT_NTH_RULE = 'effect.put-library-nth';

/**
 * `effect.put-library-nth`: "put ~ into its owner's library third from the top", "put it into her owner's library third from the top"
 * (CR 401.7: the card goes below the first N - 1 cards, or on the bottom when the library has fewer than N cards; CR 401.1: a card
 * put into a library goes to its owner's). The permanent, `~` or "it" (the card a permanent became, when the trigger is about its
 * own death or leaving, CR 400.7) goes to its owner's library. "On top of" and "on the bottom of" are `effect.put-library`'s.
 */
export const EFFECT_PUT_LIBRARY_NTH = defineRule<Clauses>({
  id: PUT_NTH_RULE,
  family: 'effect',
  leading: ['put'],
  cites: ['CR 401.7 (Library)', 'CR 401.1 (Library)', 'CR 400.7 (General)'],
  examples: [
    "put ~ into its owner's library third from the top",
    'put ~ into its owner’s library second from the top',
    "put it into its owner's library third from the top",
    "put her into her owner's library third from the top",
    "put him into his owner's library fourth from the top",
    "put target creature into its owner's library third from the top",
    "put ~ into their owner's library fifth from the top",
  ],
  rejects: [
    "put ~ into its owner's library",
    "put ~ into its owner's library first from the top",
    "put ~ into its owner's library third from the bottom",
    "put ~ into its owner's library third",
    'put ~ into your library third from the top',
    "put ~ on top of its owner's library third from the top",
    "put ~ into its owner's library third from the top and draw a card",
    "put target creature card from your graveyard into its owner's library third from the top",
    "put ~ into its owner's graveyard third from the top",
  ],
  parse: single(
    PUT_NTH_RULE,
    sequence(
      literal('put '),
      operands(['noun.self', 'noun.it', ...PERMANENT_OPERANDS], PUT_NTH_RULE),
      spanned(
        pattern(
          new RegExp(
            ` into (?:its|her|his|their) owner['’]s library (${Object.keys(ORDINALS).join('|')}) from the top${NOT_IN_WORD}`,
            'iu',
          ),
        ),
      ),
    ),
    ([, objects, where]): {
      verb: string;
      args: { objects: IrNoun | IrNounList; to: IrZoneSpec };
    } => ({
      verb: 'putLibrary',
      args: {
        objects,
        to: {
          kind: 'zoneSpec',
          zone: 'library',
          position: ORDINALS[(where.value[1] ?? '').toLowerCase()] ?? 0,
          whose: 'owner',
          span: where.span,
          rule: PUT_NTH_RULE,
        },
      },
    }),
  ),
});

const MAY_CAST_RULE = 'effect.may-cast';

/** ". If that spell would be put into your graveyard, exile it instead": the rider of the permission, the next sentence, taken with the clause (D-359, CR 614.1a). */
const EXILE_INSTEAD_YOUR = pattern(
  /\. if that spell would be put into your graveyard, exile it instead(?![\p{L}\p{N}'’])(?!,| and\b| then\b)/iu,
);

/**
 * `effect.may-cast`: "you may cast target Zombie creature card from your graveyard this turn" (CR 601.2: casting a spell from the
 * graveyard when an effect permits it; CR 611.2a: a continuous effect from a resolving ability lasts for the duration it says; CR
 * 514.2: until end of turn it ends in the cleanup step; CR 400.7: a card that leaves the graveyard is a new object and has lost the
 * permission). One target card of your own graveyard; the engine's `mayCast`. The words "you may" are part of the rule: a
 * sentence that begins with them in a triggered ability's body is read as an optional ability instead, and not as this.
 */
export const EFFECT_MAY_CAST = defineRule<Clauses>({
  id: MAY_CAST_RULE,
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 601.2 (Casting Spells)',
    'CR 611.2a (Continuous Effects)',
    'CR 514.2 (Cleanup Step)',
    'CR 400.7 (General)',
  ],
  examples: [
    'you may cast target Zombie creature card from your graveyard this turn',
    'you may cast target creature card from your graveyard this turn',
    'you may cast target instant or sorcery card from your graveyard this turn',
    'you may cast target Goblin card from your graveyard until end of turn',
    'you may cast target Angel creature card from your graveyard this turn',
    // D-359 (Vohar, Vodalian Desecrator): the rider of the permission, for the spell cast with it.
    'you may cast target instant or sorcery card from your graveyard this turn. if that spell would be put into your graveyard, exile it instead',
    'you may cast target creature card from your graveyard until end of turn. if that spell would be put into your graveyard, exile it instead',
  ],
  rejects: [
    'you may cast target instant or sorcery card from your graveyard this turn. if that spell would be put into a graveyard, exile it instead',
    'you may cast target instant or sorcery card from your graveyard this turn. if that spell would be put into your graveyard, exile it instead, then draw a card',
    'you may cast target instant or sorcery card from your graveyard this turn. if that spell would be put into your graveyard, put it on the bottom of your library instead',
    'you may cast target instant or sorcery card from your graveyard this turn. exile it instead',
    'you may cast target instant or sorcery card from your graveyard this turn. if it would be put into your graveyard, exile it instead',
    'you may cast target creature card from a graveyard this turn',
    "you may cast target creature card from an opponent's graveyard this turn",
    'you may cast two target creature cards from your graveyard this turn',
    'you may cast up to one target creature card from your graveyard this turn',
    'you may cast target creature card from your graveyard',
    'you may cast target creature card from your graveyard this turn and draw a card',
    'you may cast target creature card from your graveyard without paying its mana cost',
    'you may cast target creature from your graveyard this turn',
    'cast target creature card from your graveyard this turn',
    'you may play target land card from your graveyard this turn',
  ],
  parse: single(
    MAY_CAST_RULE,
    sequence(
      // A lookahead first: "you may cast a spell from your hand without paying its mana cost" (the free cast) stops where it always did.
      pattern(/(?=you may cast target )/iu),
      literal('you may cast '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.target-graveyard-card'] }),
        (noun) =>
          noun.filter.controller === 'you' &&
          noun.count === undefined &&
          !noun.upTo &&
          !noun.plural,
      ),
      choice(literal(' this turn'), literal(' until end of turn')),
      optional(spanned(EXILE_INSTEAD_YOUR), null),
    ),
    ([, , objects, , exileInstead]) => ({
      verb: 'mayCast',
      args: { objects, exileInstead: flag(MAY_CAST_RULE, exileInstead !== null, objects.span) },
    }),
  ),
});

const RETURN_SELF_RULE = 'effect.return-self';

interface Destination {
  readonly zone: 'battlefield' | 'hand';
  readonly counters: { readonly count: number; readonly counter: string } | null;
  readonly span: Span;
}

/** "with a +1/+1 counter on it", "with two +1/+1 counters on it": the counters the card enters with (CR 122.6, 614.1c). */
const WITH_COUNTERS = map(
  sequence(
    literal(' with '),
    satisfy(positiveCount, (n) => n >= 1),
    literal(' '),
    pattern(/[+-]\d+\/[+-]\d+|[a-z]+/i),
    pattern(/ counters? on it(?![\p{L}\p{N}])/iu),
  ),
  ([, count, , name]) => ({ count, counter: name[0].toLowerCase() }),
);

/**
 * `effect.return-self-attached`: "return this card from your graveyard to the battlefield attached to target creature you control with power 1 or less" (stage P50,
 * D-207, CR 303.4f, 303.4g, 113.6b): an Aura card of the card itself that works from the graveyard enters the battlefield attached to a target of the ability
 * (the ability is not a spell: the target is chosen as it is activated, CR 602.2b). The target is a permanent phrase. Not read: another destination
 * word, counters, a card other than `this card`, "attached to it".
 */
export const EFFECT_RETURN_SELF_ATTACHED = defineRule<Clauses>({
  id: 'effect.return-self-attached',
  family: 'effect',
  leading: ['return'],
  cites: [
    'CR 303.4f (Auras)',
    'CR 303.4g (Auras)',
    'CR 113.6b (Abilities)',
    'CR 602.2b (Activating Activated Abilities)',
  ],
  examples: [
    'return this card from your graveyard to the battlefield attached to target creature you control with power 1 or less',
    'return ~ from your graveyard to the battlefield attached to target creature you control',
    'return this card from your graveyard to the battlefield attached to target creature',
  ],
  rejects: [
    'return this card from your graveyard to the battlefield attached to it',
    'return this card from your graveyard to the battlefield attached to target creature and draw a card',
    'return this card from your graveyard to your hand attached to target creature',
    'return this card from your graveyard to the battlefield attached to creatures you control',
    'return it from your graveyard to the battlefield attached to target creature',
    'return this card from your graveyard to the battlefield tapped attached to target creature',
    'return this card from your graveyard to the battlefield attached to',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('return '),
      spanned(choice(literal('this card'), literal('~'))),
      literal(' from your graveyard to the battlefield attached to '),
      family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, self, , host] = r.value;
    if (host.plural || host.upTo || host.det !== 'target') return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const objects: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: self.value },
      upTo: false,
      plural: false,
      other: false,
      span: self.span,
      rule: 'effect.return-self-attached',
    };
    const spec: IrZoneSpec = {
      kind: 'zoneSpec',
      zone: 'battlefield',
      from: 'graveyard',
      whose: 'owner',
      span,
      rule: 'effect.return-self-attached',
    };
    return {
      ok: true,
      value: [
        {
          kind: 'clause',
          verb: 'return',
          args: { objects, to: spec, attachTo: host },
          optional: false,
          span,
          rule: 'effect.return-self-attached',
        },
      ],
      pos: r.pos,
    };
  },
});

/**
 * `effect.return-self`: "return this card from your graveyard to the battlefield with a +1/+1 counter on it", "return this card from
 * your graveyard to your hand" (CR 113.6b: an ability that works from the graveyard; CR 400.7: the card is a new object in the zone it
 * goes to; CR 122.6, 614.1c: it enters with the counters). The card itself, from its owner's graveyard: only an activated ability of
 * the card, which the lowering checks. The card enters under its owner's control, which is yours.
 */
export const EFFECT_RETURN_SELF = defineRule<Clauses>({
  id: RETURN_SELF_RULE,
  family: 'effect',
  leading: ['return'],
  cites: [
    'CR 113.6b (Abilities)',
    'CR 400.7 (General)',
    'CR 122.6 (Counters)',
    'CR 614.1c (Replacement Effects)',
  ],
  examples: [
    'return this card from your graveyard to the battlefield',
    'return this card from your graveyard to the battlefield with a +1/+1 counter on it',
    'return this card from your graveyard to the battlefield with two +1/+1 counters on it',
    'return this card from your graveyard to your hand',
    'return ~ from your graveyard to the battlefield',
    'return ~ from your graveyard to your hand',
  ],
  rejects: [
    'return this card from a graveyard to the battlefield',
    'return this card from your graveyard to the battlefield tapped',
    'return this card from your graveyard to your hand with a +1/+1 counter on it',
    'return this card to the battlefield',
    'return this card from your graveyard to its owner’s hand',
    'return this card from your graveyard',
    'return this card from your graveyard to the battlefield with a +1/+1 counter',
    'return this card from your graveyard to the battlefield and draw a card',
    'return it from your graveyard to the battlefield',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('return '),
      spanned(choice(literal('this card'), literal('~'))),
      literal(' from your graveyard to '),
      choice<Destination>(
        map(
          spanned(sequence(literal('the battlefield'), optional(WITH_COUNTERS, null))),
          ({ value, span }): Destination => ({ zone: 'battlefield', counters: value[1], span }),
        ),
        map(
          spanned(literal('your hand')),
          ({ span }): Destination => ({ zone: 'hand', counters: null, span }),
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, self, , to] = r.value;
    const span = { start: pos, end: r.pos };
    const objects: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: self.value },
      upTo: false,
      plural: false,
      other: false,
      span: self.span,
      rule: RETURN_SELF_RULE,
    };
    const spec: IrZoneSpec = {
      kind: 'zoneSpec',
      zone: to.zone,
      from: 'graveyard',
      whose: to.zone === 'hand' ? 'you' : 'owner',
      ...(to.counters === null
        ? {}
        : { counters: { counter: to.counters.counter, count: to.counters.count } }),
      span: to.span,
      rule: RETURN_SELF_RULE,
    };
    return {
      ok: true,
      value: [
        {
          kind: 'clause',
          verb: 'return',
          args: { objects, to: spec },
          optional: false,
          span,
          rule: RETURN_SELF_RULE,
        },
      ],
      pos: r.pos,
    };
  },
});

export const RECURSION_EFFECT_RULES = [
  EFFECT_PUT_LIBRARY_NTH,
  EFFECT_MAY_CAST,
  // Before `effect.return-self`, whose words are a prefix of these (stage P50, D-207).
  EFFECT_RETURN_SELF_ATTACHED,
  EFFECT_RETURN_SELF,
];
