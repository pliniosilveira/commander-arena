/**
 * Effect rules of stage P32 (D-145, D-147): what the engine's Dinosaurs slice reads. Doubling power and toughness (CR 701.10), a creature that
 * fights (CR 701.14) and each of the tokens just made fighting a different one of the creatures counted, the excess damage of a creature with
 * trample (CR 702.19b), revealing cards until one of a kind (CR 701.20), casting or playing a card without paying its mana cost (CR 608.2g,
 * 118.9), a token for each creature (CR 608.2c) and damage divided as the caster chooses (CR 601.2d). Each says what the text says; what the
 * engine can run is the lowering's business.
 */
import { choice, fail, literal, map, pattern, quiet, satisfy, sequence } from '../../combinators';
import type {
  IrAmount,
  IrClause,
  IrDuration,
  IrFlag,
  IrNoun,
  IrToken,
  IrZoneSpec,
  Span,
} from '../../ir/types';
import { FOR_EACH_AMOUNTS } from '../amount/kicked';
import { scaled } from '../amount/scaled';
import { spellPhrase } from '../noun/phrases';
import { defineRule, family, spanned } from '../registry';
import { type Clauses, makeClause, single } from './operands';
import { tokenWithEach } from './token';

function flag(rule: string, value: boolean, span: Span): IrFlag {
  return { kind: 'flag', value, span, rule };
}

/** What a doubling is of: "power and toughness", "power", "toughness". */
const STATS = choice(
  map(literal('power and toughness'), () => ({ power: true, toughness: true })),
  map(literal('power'), () => ({ power: true, toughness: false })),
  map(literal('toughness'), () => ({ power: false, toughness: true })),
);

/** The permanents a power and toughness can be doubled of: the source, a target, or a group as the effect resolves (CR 611.2c). */
const DOUBLE_SUBJECTS = [
  'noun.self',
  'noun.target-permanent',
  'noun.each-permanent',
  'noun.all-permanents',
  'noun.plain-permanents',
  'noun.it',
] as const;

/**
 * `effect.double-pt`: "double the power and toughness of each creature you control until end of turn", "double the power of target
 * creature until end of turn" (CR 701.10 Double, 611.2a: a continuous effect of a resolving spell or ability; CR 701.10c: a negative value
 * is doubled by getting that much more). Each creature gets its own amount, worked out as the effect resolves from the power and toughness
 * it has then (counters and earlier effects included). The duration is part of the phrase.
 */
export const EFFECT_DOUBLE_PT = defineRule<Clauses>({
  id: 'effect.double-pt',
  family: 'effect',
  leading: ['double'],
  cites: [
    'CR 701.10 (Double)',
    'CR 701.10c (Double)',
    'CR 611.2a (Continuous Effects)',
    'CR 611.2c (Continuous Effects)',
  ],
  examples: [
    'double the power and toughness of each creature you control until end of turn',
    'double the power of target creature until end of turn',
    'double the toughness of target creature you control until end of turn',
    'double the power and toughness of creatures you control until end of turn',
    'double the power and toughness of ~ until end of turn',
    'double the power and toughness of all creatures until end of turn',
  ],
  rejects: [
    'double the power and toughness of each creature you control',
    'double the power and toughness of each creature you control until your next turn',
    'double the power and toughness of target creatures until end of turn',
    'double the power of each creature you control until end of turn and draw a card',
    'double the power and mana value of target creature until end of turn',
    'double power and toughness of each creature you control until end of turn',
    'double the power and toughness of each creature you control for each artifact until end of turn',
    'double the number of counters on target creature',
  ],
  parse: single(
    'effect.double-pt',
    sequence(
      literal('double the '),
      spanned(STATS),
      literal(' of '),
      family<IrNoun>('noun', { only: DOUBLE_SUBJECTS }),
      literal(' '),
      family<IrDuration>('duration'),
    ),
    ([, stats, , objects, , duration]) => ({
      verb: 'doublePt',
      args: {
        objects,
        power: flag('effect.double-pt', stats.value.power, stats.span),
        toughness: flag('effect.double-pt', stats.value.toughness, stats.span),
      },
      duration,
    }),
  ),
});

/** One creature: a target or "it" or `~`, never a group or "up to". */
const ONE_CREATURE = ['noun.target-permanent', 'noun.self', 'noun.it'] as const;
const isOne = (noun: IrNoun): boolean => !noun.plural && !noun.upTo && noun.count === undefined;

/**
 * `effect.fight`: "target creature you control fights target creature you don't control", "~ fights target creature" (CR 701.14 Fight:
 * each deals damage equal to its power to the other at the same time; CR 701.14b: nothing happens unless both are creatures on the
 * battlefield as it resolves). Two single creatures: the first one fights the second.
 */
export const EFFECT_FIGHT = defineRule<Clauses>({
  id: 'effect.fight',
  family: 'effect',
  leading: ['target', 'another', '~', 'it'],
  cites: ['CR 701.14 (Fight)', 'CR 701.14b (Fight)', 'CR 120.3 (Damage)', 'CR 115.1 (Targets)'],
  examples: [
    "target creature you control fights target creature you don't control",
    'target creature fights another target creature',
    '~ fights target creature',
    'it fights target creature',
    'another target creature you control fights target creature an opponent controls',
  ],
  rejects: [
    'target creature fights',
    'target creatures fight each other',
    'target creature you control fights up to one target creature',
    'target creature you control fight target creature',
    'two target creatures fight each other',
    '~ fights',
    'target creature fights it and draws a card',
    'target creature you control fights each creature',
    'up to one target creature you control fights target creature',
  ],
  parse: single(
    'effect.fight',
    sequence(
      satisfy(family<IrNoun>('noun', { only: ONE_CREATURE }), isOne),
      literal(' fights '),
      satisfy(family<IrNoun>('noun', { only: ['noun.target-permanent'] }), isOne),
    ),
    ([fighter, , against]) => ({ verb: 'fight', args: { fighters: fighter, against } }),
  ),
});

/** The words for a group of objects after "those": "tokens", "creatures", "permanents". */
const THOSE = /(tokens|creatures|permanents)/;

/**
 * `effect.fight-each`: "each of those tokens fights a different one of those creatures" (CR 701.14, 608.2c, 601.2c: the controller of the
 * effect chooses, for each of the tokens just made, which of the creatures counted it fights, a different one each time). It reads what
 * the instruction before it made: the tokens ("those tokens") and the creatures it counted ("those creatures"); the lowering refuses it
 * after anything else, since "those" would have nothing to mean.
 */
export const EFFECT_FIGHT_EACH = defineRule<Clauses>({
  id: 'effect.fight-each',
  family: 'effect',
  leading: ['each'],
  cites: [
    'CR 701.14 (Fight)',
    'CR 608.2c (Resolving Spells and Abilities)',
    'CR 608.2d (Resolving Spells and Abilities)',
  ],
  examples: [
    'each of those tokens fights a different one of those creatures',
    'each of those creatures fights a different one of those permanents',
  ],
  rejects: [
    'each of those tokens fights one of those creatures',
    'each of those tokens fights a different one of them',
    'each of those tokens fight a different one of those creatures',
    'each of those token fights a different one of those creatures',
    'each of those tokens fights a different one of those creatures and draws a card',
    'each token fights a different one of those creatures',
    'each of target tokens fights a different one of those creatures',
    'each of those lands fights a different one of those creatures',
  ],
  parse: (ctx, pos) => {
    const r = spanned(
      pattern(
        new RegExp(
          `each of those ${THOSE.source} fights a different one of those ${THOSE.source}(?![\\p{L}\\p{N}])`,
          'iu',
        ),
      ),
    )(ctx, pos);
    if (!r.ok) return fail(ctx, pos);
    const { value, span } = r.value;
    const clause: IrClause = makeClause(
      'effect.fight-each',
      'fightPairs',
      {
        fighters: flag('effect.fight-each', (value[1] ?? '') === 'tokens', span),
        against: flag('effect.fight-each', (value[2] ?? '') === 'creatures', span),
      },
      span,
    );
    return { ok: true, value: [clause], pos: r.pos };
  },
});

/**
 * `effect.excess-damage`: "excess damage is dealt to that creature's controller" (CR 702.19b, 120.3: a creature with trample assigns the
 * damage beyond lethal to something else; here, as the second sentence of a bite or a fight, to the controller of the creature that was
 * dealt damage). Read only as the sentence "If the creature you control has trample, excess damage is dealt to that creature's controller
 * instead.", which the lowering joins to the damage before it.
 */
export const EFFECT_EXCESS_DAMAGE = defineRule<Clauses>({
  id: 'effect.excess-damage',
  family: 'effect',
  leading: ['excess'],
  cites: [
    'CR 702.19b (Trample)',
    'CR 120.3 (Damage)',
    'CR 608.2c (Resolving Spells and Abilities)',
  ],
  examples: [
    "excess damage is dealt to that creature's controller",
    'excess damage is dealt to its controller',
  ],
  rejects: [
    'excess damage is dealt to you',
    "excess damage is dealt to that creature's controller and you draw a card",
    "excess damage is dealt to target creature's controller",
    'excess damage is dealt to that player',
    "excess damage is dealt to that creature's owner",
    'excess damage is dealt',
  ],
  parse: single(
    'effect.excess-damage',
    sequence(
      literal('excess damage is dealt to '),
      family<IrNoun>('noun', { only: ['noun.its-controller'] }),
    ),
    ([, to]) => ({ verb: 'excessDamage', args: { to } }),
  ),
});

/** " tapped" or " into your hand" etc. of the card put: where the card found goes. */
function zoneArg(rule: string, span: Span, zone: IrZoneSpec['zone'], tapped: boolean): IrZoneSpec {
  return { kind: 'zoneSpec', zone, ...(tapped ? { tapped: true } : {}), span, rule };
}

/**
 * `effect.reveal-until`: "reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped
 * and the rest on the bottom of your library in a random order." (CR 701.20 Reveal, 401.4: the cards are revealed one at a time until one
 * matches, all of them if none does; CR 401.5 the rest go to the bottom in a random order). Two sentences that `splitSentences` keeps
 * together: what is revealed until, and where the card found and the rest go. The card is of a kind (a land card, a nonland card, a creature
 * card), put onto the battlefield (tapped or not) or into the hand.
 */
export const EFFECT_REVEAL_UNTIL = defineRule<Clauses>({
  id: 'effect.reveal-until',
  family: 'effect',
  leading: ['reveal'],
  cites: [
    'CR 701.20 (Reveal)',
    'CR 401.4 (Library)',
    'CR 401.5 (Library)',
    'CR 110.2a (Permanents)',
  ],
  examples: [
    'reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield and the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal a nonland card. Put that card into your hand and the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal a creature card. Put that card into your hand and the rest on the bottom of your library in a random order',
  ],
  rejects: [
    'reveal cards from the top of your library until you reveal a land card',
    'reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped',
    'reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest into your graveyard',
    'reveal cards from the top of your library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the bottom of your library in any order',
    'reveal cards from the top of your library until you reveal two land cards. Put that card onto the battlefield tapped and the rest on the bottom of your library in a random order',
    'reveal cards from the top of your library until you reveal a creature card with mana value 3 or less. Put that card into your hand and the rest on the bottom of your library in a random order',
    'reveal cards from the top of target player’s library until you reveal a land card. Put that card onto the battlefield tapped and the rest on the bottom of your library in a random order',
    'reveal the top card of your library',
    'reveal cards from the top of your library until you reveal a land card. Put that card into your graveyard and the rest on the bottom of your library in a random order',
  ],
  parse: single(
    'effect.reveal-until',
    sequence(
      literal('reveal cards from the top of your library until you reveal '),
      family<IrNoun>('noun', { only: ['noun.library-card'] }),
      literal('. put that card '),
      spanned(
        choice<{ zone: 'battlefield' | 'hand'; tapped: boolean }>(
          map(literal('onto the battlefield tapped'), () => ({
            zone: 'battlefield' as const,
            tapped: true,
          })),
          map(literal('onto the battlefield'), () => ({
            zone: 'battlefield' as const,
            tapped: false,
          })),
          map(literal('into your hand'), () => ({ zone: 'hand' as const, tapped: false })),
        ),
      ),
      literal(' and the rest on the bottom of your library in a random order'),
    ),
    ([, card, , where]) => ({
      verb: 'revealUntil',
      args: {
        card: { ...card, upTo: false, plural: false },
        to: zoneArg('effect.reveal-until', where.span, where.value.zone, where.value.tapped),
      },
    }),
  ),
});

/**
 * `effect.cast-free`: "you may cast a spell with mana value 5 or less from your hand without paying its mana cost", "you may cast a
 * creature spell from your hand without paying its mana cost", "you may play the exiled card without paying its mana cost" (CR 608.2g,
 * 118.9, 305.1: the controller may cast the card as this resolves without paying its mana cost, or, with "play", put a land onto the
 * battlefield as a land play; declining does nothing). The card is one of those in the controller's hand that match, or the card a linked
 * ability exiled (`linkedExile`, Hideaway, CR 702.75a). "A spell" is any card but a land.
 */
export const EFFECT_CAST_FREE = defineRule<Clauses>({
  id: 'effect.cast-free',
  family: 'effect',
  leading: ['you'],
  cites: [
    'CR 608.2g (Resolving Spells and Abilities)',
    'CR 118.9 (Alternative Costs)',
    'CR 305.1 (Lands)',
    'CR 702.75a (Hideaway)',
  ],
  examples: [
    'you may cast a spell with mana value 5 or less from your hand without paying its mana cost',
    'you may cast a creature spell from your hand without paying its mana cost',
    'you may cast a spell from your hand without paying its mana cost',
    'you may play the exiled card without paying its mana cost',
    'you may cast the exiled card without paying its mana cost',
  ],
  rejects: [
    'you may cast a spell with mana value 5 or less from your hand',
    'you may cast a spell with mana value 5 or less from your graveyard without paying its mana cost',
    'you may cast a spell with mana value 5 or less without paying its mana cost',
    'you may cast two spells from your hand without paying their mana costs',
    'you may cast target spell from your hand without paying its mana cost',
    'you cast a spell from your hand without paying its mana cost',
    'you may play a card from your hand without paying its mana cost',
    'you may play the exiled card',
    'you may play the exiled cards without paying their mana costs',
    'you may cast a spell with mana value 5 or less from your hand without paying its mana cost and draw a card',
    'you may cast a spell with mana value 5 or less from your hand without paying its mana cost this turn',
  ],
  parse: single(
    'effect.cast-free',
    choice<{ objects: IrNoun; play: boolean }>(
      (ctx, pos) => {
        const head = pattern(/you may cast an? /iu)(ctx, pos);
        if (!head.ok) return head;
        const phrase = spanned(spellPhrase(false))(ctx, head.pos);
        if (!phrase.ok) return phrase;
        const from = literal(' from your hand without paying its mana cost')(ctx, phrase.pos);
        if (!from.ok) return from;
        const { stackKind: _kind, zone: _zone, ...rest } = phrase.value.value;
        void _kind;
        void _zone;
        const plainSpell = rest.types === undefined && rest.anyOf === undefined;
        const filter = {
          ...rest,
          zone: 'hand' as const,
          // "a spell" is a card that is not a land: a land is played, never cast (CR 305.1, 601.1).
          ...(plainSpell ? { notTypes: ['land'] } : {}),
        };
        const objects: IrNoun = {
          kind: 'noun',
          det: 'a',
          filter,
          upTo: false,
          plural: false,
          other: false,
          span: phrase.value.span,
          rule: 'effect.cast-free',
        };
        return { ok: true, value: { objects, play: false }, pos: from.pos };
      },
      (ctx, pos) => {
        const r = spanned(
          pattern(
            /you may (cast|play) the exiled card without paying its mana cost(?![\p{L}\p{N}])/iu,
          ),
        )(ctx, pos);
        if (!r.ok) return r;
        const objects: IrNoun = {
          kind: 'noun',
          det: 'linkedExile',
          filter: { raw: 'the exiled card' },
          upTo: false,
          plural: false,
          other: false,
          span: r.value.span,
          rule: 'effect.cast-free',
        };
        return {
          ok: true,
          value: { objects, play: (r.value.value[1] ?? '').toLowerCase() === 'play' },
          pos: r.pos,
        };
      },
    ),
    ({ objects, play }) => ({
      verb: 'castFree',
      args: { objects, play: flag('effect.cast-free', play, objects.span) },
    }),
  ),
});

/**
 * `effect.for-each-create`: "for each creature your opponents control, create a 4/4 green Phyrexian Beast creature token" (CR 608.2c: the
 * count is taken as the instruction runs). The same instruction as "create a 4/4 ... token for each creature your opponents control", said
 * with the count first; a number above one multiplies the count.
 */
export const EFFECT_FOR_EACH_CREATE = defineRule<Clauses>({
  id: 'effect.for-each-create',
  family: 'effect',
  leading: ['for'],
  cites: ['CR 111.2 (Tokens)', 'CR 608.2c (Resolving Spells and Abilities)'],
  examples: [
    'for each creature your opponents control, create a 4/4 green Phyrexian Beast creature token',
    'for each creature you control, create a Treasure token',
    'for each land you control, create a 0/1 green Plant creature token',
    'for each creature your opponents control, create two 1/1 white Soldier creature tokens',
  ],
  rejects: [
    'for each creature your opponents control create a 4/4 green Phyrexian Beast creature token',
    'for each creature your opponents control, destroy it',
    'for each creature, create a 4/4 green Phyrexian Beast creature token',
    'for each creature your opponents control, create X Treasure tokens',
    'for each creature your opponents control, create a 4/4 green Phyrexian Beast creature token for each land you control',
    'for each creature your opponents control',
  ],
  parse: (ctx, pos) => {
    const r = sequence(
      // Quiet: "For each 1 damage prevented this way, create ..." stops where the older rules stop (at "For each").
      quiet(family<IrAmount>('amount', { only: FOR_EACH_AMOUNTS })),
      literal(', create '),
      tokenWithEach(),
    )(ctx, pos);
    if (!r.ok) return r;
    const [each, , token] = r.value;
    const count = scaled(token.count, each);
    if (count === null) return fail(ctx, pos);
    const merged: IrToken = { ...token, count };
    const clause = makeClause(
      'effect.for-each-create',
      'createToken',
      { token: merged },
      { start: pos, end: r.pos },
    );
    return { ok: true, value: [clause], pos: r.pos };
  },
});
/**
 * `effect.damage-divided`: "~ deals X damage divided as you choose among any number of target creatures" (CR 601.2d: the caster divides
 * the damage among the targets as the spell is cast, each target getting at least 1; CR 120.3). The amount is a number or X (defined by
 * "..., where X is the greatest power among creatures you control as you cast this spell"); the targets are "any number of target
 * creatures" or "up to three target creatures" (the fewest is none). The lowering reads it only in a spell, with a total that is a
 * number or an amount read as the spell is cast.
 */
export const EFFECT_DAMAGE_DIVIDED = defineRule<Clauses>({
  id: 'effect.damage-divided',
  family: 'effect',
  leading: ['~'],
  cites: ['CR 601.2d (Casting Spells)', 'CR 120.3 (Damage)', 'CR 115.1 (Targets)'],
  examples: [
    '~ deals X damage divided as you choose among any number of target creatures',
    '~ deals 3 damage divided as you choose among any number of target creatures',
    '~ deals 4 damage divided as you choose among up to three target creatures',
    '~ deals X damage divided as you choose among any number of target creatures you don’t control',
  ],
  rejects: [
    '~ deals X damage divided as you choose among any number of target creatures and draw a card',
    '~ deals X damage divided among any number of target creatures',
    '~ deals X damage divided as you choose among any number of creatures',
    '~ deals X damage divided as you choose among target creature',
    '~ deals X damage divided as you choose among one target creature',
    '~ deals X damage as you choose among any number of target creatures',
    '~ deals damage divided as you choose among any number of target creatures',
    '~ deals X damage divided as you choose among any target',
  ],
  parse: single(
    'effect.damage-divided',
    sequence(
      literal('~ deals '),
      family<IrAmount>('amount', { only: ['amount.number', 'amount.x'] }),
      literal(' damage divided as you choose among '),
      choice(
        family<IrNoun>('noun', { only: ['noun.any-number-targets'] }),
        satisfy(
          family<IrNoun>('noun', { only: ['noun.target-permanent'] }),
          (noun) => noun.upTo && noun.plural,
        ),
      ),
    ),
    ([, amount, , to]) => ({ verb: 'dealDividedDamage', args: { amount, to } }),
  ),
});

export const DINOSAUR_EFFECT_RULES = [
  EFFECT_DOUBLE_PT,
  EFFECT_FIGHT,
  EFFECT_FIGHT_EACH,
  EFFECT_EXCESS_DAMAGE,
  EFFECT_REVEAL_UNTIL,
  EFFECT_CAST_FREE,
  EFFECT_FOR_EACH_CREATE,
  EFFECT_DAMAGE_DIVIDED,
];
