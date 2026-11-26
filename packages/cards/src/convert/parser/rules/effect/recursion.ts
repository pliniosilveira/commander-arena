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
import type { IrFilter, IrNoun, IrNounList, IrZoneSpec, Span } from '../../ir/types';
import { positiveCount } from '../amount/index';
import { CREATURE_TYPES } from '../noun/creature-types';
import { defineRule, family, spanned } from '../registry';
import { flag } from './dragons';
import { type Clauses, makeClause, operands, PERMANENT_OPERANDS, single } from './operands';

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

const MAY_CAST_ANY_RULE = 'effect.may-cast-any-graveyard';

/** ". When you cast it this turn, ~ gains all activated abilities of that card until end of turn": the rider of the permission, the next sentence, taken with the clause (issue 159). */
const WHEN_CAST_GAINS_ABILITIES = pattern(
  /\. when you cast it this turn, ~ gains all activated abilities of that card until end of turn(?![\p{L}\p{N}'’])(?!,| and\b| then\b)/iu,
);

/**
 * `effect.may-cast-any-graveyard`: "you may cast target creature card in a graveyard this turn" (issue 159, Havengul Lich; CR 601.2: casting from a graveyard when an effect
 * permits it, CR 108.3: a card in a graveyard is its owner's, and the spell is cast by the player who has the effect; CR 611.2a, 514.2: until end of turn). One target card of
 * any player's graveyard; the engine's `mayCast` with `anyGraveyard`. With the rider "When you cast it this turn, ~ gains all activated abilities of that card until end of turn"
 * (CR 603.7, 613.1f), the same clause's `whenCast`. Not read: "from your graveyard" (`effect.may-cast`), several cards, another rider.
 */
export const EFFECT_MAY_CAST_ANY_GRAVEYARD = defineRule<Clauses>({
  id: MAY_CAST_ANY_RULE,
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 601.2 (Casting Spells)',
    'CR 108.3 (Cards)',
    'CR 611.2a (Continuous Effects)',
    'CR 603.7 (Delayed Triggered Abilities)',
    'CR 613.1f (Interaction of Continuous Effects)',
  ],
  examples: [
    'you may cast target creature card in a graveyard this turn',
    'you may cast target creature card in a graveyard until end of turn',
    'you may cast target creature card in a graveyard this turn. when you cast it this turn, ~ gains all activated abilities of that card until end of turn',
  ],
  rejects: [
    'you may cast target creature card from a graveyard this turn',
    'you may cast target creature card in your graveyard this turn',
    'you may cast target creature card in a graveyard',
    'you may cast two target creature cards in a graveyard this turn',
    'you may cast target creature in a graveyard this turn',
    'you may cast target creature card in a graveyard this turn. when you cast it this turn, ~ gains flying until end of turn',
    'you may cast target creature card in a graveyard this turn. when you cast it this turn, ~ gains all activated abilities of that card until end of turn, then draw a card',
    'you may cast target creature card in a graveyard this turn and draw a card',
    'you may cast target creature card in a graveyard without paying its mana cost',
  ],
  parse: single(
    MAY_CAST_ANY_RULE,
    sequence(
      // A lookahead first, as `effect.may-cast` has: "you may cast ~ without paying its mana cost" (the free cast) stops where it always did.
      pattern(/(?=you may cast target )/iu),
      literal('you may cast '),
      satisfy(
        family<IrNoun>('noun', { only: ['noun.target-card-in-a-graveyard'] }),
        (noun) => noun.count === undefined && !noun.upTo && !noun.plural,
      ),
      choice(literal(' this turn'), literal(' until end of turn')),
      optional(spanned(WHEN_CAST_GAINS_ABILITIES), null),
    ),
    ([, , objects, , whenCast]) => ({
      verb: 'mayCast',
      args: {
        objects,
        anyGraveyard: flag(MAY_CAST_ANY_RULE, true, objects.span),
        whenCast: flag(MAY_CAST_ANY_RULE, whenCast !== null, objects.span),
      },
    }),
  ),
});

const MAY_CAST_SPELLS_RULE = 'effect.may-cast-spells';
const SPELL_CARD_TYPES: readonly string[] = [
  'creature',
  'artifact',
  'enchantment',
  'planeswalker',
  'instant',
  'sorcery',
];

/**
 * `effect.may-cast-spells`: "you may cast Zombie spells from your graveyard this turn" (issue 159, Liliana, Untouched by Death; CR 601.2: casting from the graveyard when an effect
 * permits it; CR 611.2a, 514.2: the permission lasts until end of turn and covers the cards of the graveyard as the turn asks). Every card of your own graveyard that the one word
 * describes (a creature type, or a card type); the engine's `mayCastSpells`. The words "you may" are read here when the sentence parser leaves them (a spell), and are the sentence's
 * own optional mark when it takes them (a loyalty ability): the permission is optional either way. Not read: "target", another graveyard,
 * several words ("Zombie creature spells"), a type that is not a creature type or a card type of a spell, no duration.
 */
export const EFFECT_MAY_CAST_SPELLS = defineRule<Clauses>({
  id: MAY_CAST_SPELLS_RULE,
  family: 'effect',
  leading: ['you', 'cast'],
  cites: ['CR 601.2 (Casting Spells)', 'CR 611.2a (Continuous Effects)', 'CR 514.2 (Cleanup Step)'],
  examples: [
    'you may cast Zombie spells from your graveyard this turn',
    'you may cast creature spells from your graveyard this turn',
    'you may cast Goblin spells from your graveyard until end of turn',
    'you may cast instant spells from your graveyard this turn',
    'cast Zombie spells from your graveyard this turn',
  ],
  rejects: [
    'you may cast Zombie spells from your graveyard',
    'you may cast Zombie spells from a graveyard this turn',
    "you may cast Zombie spells from an opponent's graveyard this turn",
    'you may cast Zombie creature spells from your graveyard this turn',
    'you may cast Banana spells from your graveyard this turn',
    'you may cast land spells from your graveyard this turn',
    'you may cast target Zombie card from your graveyard this turn',
    'you may cast Zombie spells from your graveyard this turn and draw a card',
    'you may cast spells from your graveyard this turn',
    'you may cast a Zombie spell from your graveyard this turn',
  ],
  parse: (ctx, pos) => {
    const r = pattern(
      /(?:you may )?cast ([A-Za-z]+) spells from your graveyard (?:this turn|until end of turn)(?![\p{L}\p{N}'’])(?!\s+(?:and|then)(?![\p{L}\p{N}]))/iu,
    )(ctx, pos);
    if (!r.ok) return r;
    const word = r.value[1] ?? '';
    const lower = word.toLowerCase();
    const isType = SPELL_CARD_TYPES.includes(lower);
    // A creature type is capitalized in the text ("Zombie"); a card type is not.
    const filter: IrFilter | null = isType
      ? { types: [lower], raw: word }
      : /^[A-Z]/u.test(word) && CREATURE_TYPES.has(word)
        ? { subtypes: [word], raw: word }
        : null;
    if (filter === null) return fail(ctx, pos);
    const span = { start: pos, end: r.pos };
    const objects: IrNoun = {
      kind: 'noun',
      det: 'a',
      filter,
      upTo: false,
      plural: true,
      other: false,
      span,
      rule: MAY_CAST_SPELLS_RULE,
    };
    return {
      ok: true,
      value: [makeClause(MAY_CAST_SPELLS_RULE, 'mayCastSpells', { objects }, span)],
      pos: r.pos,
    };
  },
});

const RETURN_SELF_RULE = 'effect.return-self';

interface Destination {
  readonly zone: 'battlefield' | 'hand';
  readonly tapped?: true;
  readonly attacking?: true;
  readonly faceChoice?: true;
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
    'CR 708.2a (Face-Down Spells and Permanents)',
  ],
  examples: [
    'return this card from your graveyard to the battlefield',
    'return this card from your graveyard to the battlefield tapped',
    'return this card from your graveyard to the battlefield tapped and attacking',
    'return this card from your graveyard to the battlefield with a +1/+1 counter on it',
    'return this card from your graveyard to the battlefield with two +1/+1 counters on it',
    'return this card from your graveyard to your hand',
    'return this card from your graveyard to the battlefield face up or face down',
    'return ~ from your graveyard to the battlefield',
    'return ~ from your graveyard to your hand',
  ],
  rejects: [
    'return this card from a graveyard to the battlefield',
    'return this card from your graveyard to your hand tapped',
    'return this card from your graveyard to your hand and attacking',
    'return this card from your graveyard to the battlefield tapped and attacking that player',
    'return this card from your graveyard to your hand with a +1/+1 counter on it',
    'return this card to the battlefield',
    'return this card from your graveyard to its owner’s hand',
    'return this card from your graveyard',
    'return this card from your graveyard to the battlefield with a +1/+1 counter',
    'return this card from your graveyard to the battlefield and draw a card',
    'return it from your graveyard to the battlefield',
    'return this card from your graveyard to your hand face up or face down',
    'return this card from your graveyard to the battlefield face up',
    'return this card from your graveyard to the battlefield face down',
    'return this card from your graveyard to the battlefield face up or face down tapped',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('return '),
      spanned(choice(literal('this card'), literal('~'))),
      literal(' from your graveyard to '),
      choice<Destination>(
        map(
          spanned(
            sequence(
              literal('the battlefield'),
              optional(literal(' tapped'), null),
              // CR 508.4: "tapped and attacking" (Interceptor, Shadow's Hound).
              optional(literal(' and attacking'), null),
              optional(WITH_COUNTERS, null),
              // CR 708.2a, 708.3 (Deathmist Raptor): the controller chooses whether it enters face up or face down.
              optional(literal(' face up or face down'), null),
            ),
          ),
          ({ value, span }): Destination => ({
            zone: 'battlefield',
            counters: value[3],
            ...(value[4] === null ? {} : { faceChoice: true as const }),
            ...(value[1] === null ? {} : { tapped: true }),
            ...(value[2] === null ? {} : { attacking: true as const }),
            span,
          }),
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
      ...(to.tapped === true ? { tapped: true } : {}),
      ...(to.attacking === true ? { attacking: true as const } : {}),
      ...(to.faceChoice === true ? { faceChoice: true as const } : {}),
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

const PUT_SELF_LIBRARY_RULE = 'effect.put-self-library';

/**
 * `effect.put-self-library`: "put this card from your graveyard on top of your library", "put ~ from your graveyard on the bottom of your library" (CR 113.6b: an ability that works from
 * the graveyard; CR 401.1, 401.3: the card goes to its owner's library, on top or on the bottom as the text says, and it is a new object there, CR 400.7). The card itself, from its owner's
 * graveyard: only an activated ability of the card, which the lowering checks.
 */
export const EFFECT_PUT_SELF_LIBRARY = defineRule<Clauses>({
  id: PUT_SELF_LIBRARY_RULE,
  family: 'effect',
  leading: ['put'],
  cites: [
    'CR 113.6b (Abilities)',
    'CR 401.1 (Library)',
    'CR 401.3 (Library)',
    'CR 400.7 (General)',
  ],
  examples: [
    'put this card from your graveyard on top of your library',
    'put this card from your graveyard on the bottom of your library',
    'put ~ from your graveyard on top of your library',
  ],
  rejects: [
    'put this card from a graveyard on top of your library',
    'put this card from your graveyard on top of its owner’s library',
    'put this card from your graveyard into your library',
    'put this card from your graveyard on top of your library and draw a card',
    'put this card on top of your library',
    'put it from your graveyard on top of your library',
    'put this card from your graveyard onto the battlefield',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      literal('put '),
      spanned(choice(literal('this card'), literal('~'))),
      literal(' from your graveyard on '),
      spanned(
        choice(
          map(literal('top'), () => 'top' as const),
          map(literal('the bottom'), () => 'bottom' as const),
        ),
      ),
      literal(' of your library'),
    )(ctx, pos);
    if (!r.ok) return r;
    const [, self, , position] = r.value;
    const span = { start: pos, end: r.pos };
    const objects: IrNoun = {
      kind: 'noun',
      det: 'self',
      filter: { raw: self.value },
      upTo: false,
      plural: false,
      other: false,
      span: self.span,
      rule: PUT_SELF_LIBRARY_RULE,
    };
    const spec: IrZoneSpec = {
      kind: 'zoneSpec',
      zone: 'library',
      from: 'graveyard',
      whose: 'you',
      position: position.value,
      span: position.span,
      rule: PUT_SELF_LIBRARY_RULE,
    };
    return {
      ok: true,
      value: [
        {
          kind: 'clause',
          verb: 'putLibrary',
          args: { objects, to: spec },
          optional: false,
          span,
          rule: PUT_SELF_LIBRARY_RULE,
        },
      ],
      pos: r.pos,
    };
  },
});

export const RECURSION_EFFECT_RULES = [
  EFFECT_PUT_LIBRARY_NTH,
  EFFECT_MAY_CAST,
  EFFECT_MAY_CAST_SPELLS,
  EFFECT_MAY_CAST_ANY_GRAVEYARD,
  // Before `effect.return-self`, whose words are a prefix of these (stage P50, D-207).
  EFFECT_RETURN_SELF_ATTACHED,
  EFFECT_RETURN_SELF,
  EFFECT_PUT_SELF_LIBRARY,
];
